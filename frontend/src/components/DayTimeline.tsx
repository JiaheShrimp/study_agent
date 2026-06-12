import { useEffect, useRef, useState } from 'react'
import { Clock, Pencil, Check, X } from 'lucide-react'
import { api } from '@/lib/api'
import { cn, gameToday } from '@/lib/utils'

interface Run {
  task_id: string
  task_content: string
  date: string
  success: boolean
  started_at: string
  ended_at: string
  actual_seconds: number
  pause_count: number
  pause_seconds: number
  task_hours: number
  end_reason?: string
  source?: string
}

function fmtTime(iso: string) {
  const d = new Date(iso)
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
}

function fmtDuration(secs: number) {
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  const s = secs % 60
  if (h > 0) return `${h}h${m > 0 ? ` ${m}m` : ''}`
  if (m > 0) return `${m}m${s > 0 ? ` ${s}s` : ''}`
  return `${s}s`
}

// ── 单条任务时间轴行 ──────────────────────────────────────────
function RunRow({ run, onTimeUpdate }: { run: Run; onTimeUpdate: (startedAt: string) => void }) {
  const isManual = run.source === 'manual'
  const isPaused = !run.success && run.end_reason === 'giveup'
  const workSecs  = run.actual_seconds
  const pauseSecs = run.pause_seconds

  // manual 条目 wallSecs = actual_seconds（进度条满格）
  const wallSecs = isManual
    ? workSecs
    : (new Date(run.ended_at).getTime() - new Date(run.started_at).getTime()) / 1000
  const workPct  = wallSecs > 0 ? Math.min(100, (workSecs  / wallSecs) * 100) : 100
  const pausePct = wallSecs > 0 ? Math.min(100 - workPct, (pauseSecs / wallSecs) * 100) : 0

  const completePct = run.success
    ? 100
    : Math.min(99, Math.round((workSecs / Math.max(run.task_hours * 3600, 1)) * 100))

  // 时间编辑状态
  const [editing, setEditing] = useState(false)
  const [timeInput, setTimeInput] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  function startEdit() {
    // 初始化为当前开始时间的 HH:MM
    const d = new Date(run.started_at)
    setTimeInput(`${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`)
    setEditing(true)
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  function confirmEdit() {
    if (!timeInput) { setEditing(false); return }
    // 把 HH:MM 拼到今天日期
    const base = new Date(run.started_at)
    const [h, m] = timeInput.split(':').map(Number)
    base.setHours(h, m, 0, 0)
    onTimeUpdate(base.toISOString().slice(0, 19))
    setEditing(false)
  }

  return (
    <div className="flex items-start gap-3 py-3 border-b border-border/50 last:border-0">
      {/* 左侧：时间 + 任务名 */}
      <div className="w-32 shrink-0 pt-0.5 space-y-0.5">
        {/* 时间行：manual 可编辑 */}
        {isManual && editing ? (
          <div className="flex items-center gap-1">
            <input
              ref={inputRef}
              type="time"
              value={timeInput}
              onChange={e => setTimeInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') confirmEdit(); if (e.key === 'Escape') setEditing(false) }}
              className="w-20 h-5 text-xs border border-input rounded px-1 bg-background focus:outline-none focus:ring-1 focus:ring-ring/40"
            />
            <button onClick={confirmEdit} className="text-emerald-600 hover:text-emerald-700">
              <Check className="h-3 w-3" />
            </button>
            <button onClick={() => setEditing(false)} className="text-muted-foreground hover:text-foreground">
              <X className="h-3 w-3" />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-1 group/time">
            <p className="text-xs text-muted-foreground tabular-nums">
              {fmtTime(run.started_at)} – {fmtTime(run.ended_at)}
            </p>
            {isManual && (
              <button
                onClick={startEdit}
                className="opacity-0 group-hover/time:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
                title="修改开始时间"
              >
                <Pencil className="h-3 w-3" />
              </button>
            )}
          </div>
        )}
        <p className={cn(
          'text-sm font-medium leading-tight',
          run.success ? 'text-foreground' : isPaused ? 'text-amber-700' : 'text-muted-foreground'
        )}>
          {run.task_content}
          {isPaused && <span className="ml-1 text-xs text-amber-500">已暂停</span>}
        </p>
      </div>

      {/* 右侧：时间条 + 数据 */}
      <div className="flex-1 space-y-1.5 pt-0.5">
        {/* 时间条 */}
        <div className="relative h-5 rounded-md overflow-hidden bg-secondary/50">
          <div
            className={cn(
              'absolute left-0 top-0 h-full rounded-l-md transition-all',
              run.success ? 'bg-primary/70' : isPaused ? 'bg-amber-400/60' : 'bg-primary/40'
            )}
            style={{ width: `${workPct}%` }}
          />
          {pausePct > 0.5 && (
            <div
              className="absolute top-0 h-full"
              style={{
                left: `${workPct}%`,
                width: `${pausePct}%`,
                background: 'repeating-linear-gradient(45deg, transparent, transparent 3px, rgba(0,0,0,0.08) 3px, rgba(0,0,0,0.08) 6px)',
                backgroundColor: 'hsl(var(--amber-200, 43 96% 56%) / 0.3)',
              }}
            />
          )}
          {workPct > 15 && (
            <span className="absolute left-2 top-0 bottom-0 flex items-center text-xs text-primary-foreground/80 font-medium truncate pr-1">
              {fmtDuration(workSecs)}
            </span>
          )}
        </div>

        {/* 图例说明 */}
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="inline-block w-2 h-2 rounded-sm bg-primary/60" />
            专注 {fmtDuration(workSecs)}
          </span>
          {pauseSecs > 0 && (
            <span className="flex items-center gap-1">
              <span className="inline-block w-2 h-2 rounded-sm bg-border" style={{
                background: 'repeating-linear-gradient(45deg, transparent, transparent 2px, rgba(0,0,0,0.15) 2px, rgba(0,0,0,0.15) 4px)',
                backgroundColor: 'hsl(var(--secondary))',
              }} />
              暂停 {fmtDuration(pauseSecs)}{run.pause_count > 0 ? ` · ${run.pause_count} 次` : ''}
            </span>
          )}
          <span className={cn(
            'ml-auto font-medium',
            run.success ? 'text-emerald-600' : isPaused ? 'text-amber-600' : 'text-rose-400'
          )}>
            {run.success ? '✓ 完成' : isPaused ? `${completePct}% 已暂停` : `${completePct}% 未完成`}
          </span>
        </div>
      </div>
    </div>
  )
}

// ── 主组件 ────────────────────────────────────────────────────
export function DayTimeline({ date }: { date?: string }) {
  const today = date ?? gameToday()
  const [runs, setRuns] = useState<Run[]>([])

  function reload() {
    api.tasks.runs(today).then(r => setRuns(r as Run[])).catch(() => {})
  }

  useEffect(() => { reload() }, [today])

  if (runs.length === 0) return null

  const doneCount = runs.filter(r => r.success).length
  const totalDoneSecs = runs.filter(r => r.success).reduce((s, r) => s + r.actual_seconds, 0)
  const totalWorkedSecs = runs.reduce((s, r) => s + r.actual_seconds, 0)

  return (
    <div className="bg-card rounded-2xl border border-border p-5 space-y-3">
      {/* 标题行 */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">今日时间轴</h3>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Clock className="h-3.5 w-3.5" />
          累计专注 {fmtDuration(totalWorkedSecs)}
          {doneCount > 0 && totalDoneSecs !== totalWorkedSecs && (
            <span className="text-emerald-600">（完成 {fmtDuration(totalDoneSecs)}）</span>
          )}
        </div>
      </div>

      {/* 任务列表 */}
      <div className="divide-y divide-border/50">
        {runs.map(r => (
          <RunRow
            key={r.task_id + r.started_at}
            run={r}
            onTimeUpdate={async (startedAt) => {
              await api.tasks.updateRunTime(r.task_id, today, startedAt).catch(() => {})
              reload()
            }}
          />
        ))}
      </div>

      {/* 底部汇总 */}
      <div className="pt-1 border-t border-border flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          今日完成 {doneCount} 个 · 共执行 {runs.length} 次
        </span>
        <span className="text-sm font-bold text-primary tabular-nums">
          专注 {fmtDuration(totalDoneSecs)}
        </span>
      </div>
    </div>
  )
}
