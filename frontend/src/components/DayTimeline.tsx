import { useEffect, useState } from 'react'
import { Clock } from 'lucide-react'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'

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
}

function fmtTime(iso: string) {
  const d = new Date(iso)
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
}

function fmtDuration(secs: number) {
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  if (h > 0) return `${h}h${m > 0 ? ` ${m}m` : ''}`
  return `${m}m`
}

// 把秒数转成 "hh:mm" 形式的小时刻度标签
function hourLabel(h: number) {
  return `${h.toString().padStart(2, '0')}:00`
}

export function DayTimeline({ date }: { date?: string }) {
  const today = date ?? new Date().toISOString().slice(0, 10)
  const [runs, setRuns] = useState<Run[]>([])

  useEffect(() => {
    api.tasks.runs(today).then(setRuns).catch(() => {})
  }, [today])

  if (runs.length === 0) return null

  // 计算展示范围：最早开始前1小时 ~ 最晚结束后1小时，向整点取整
  const startTimes = runs.map(r => new Date(r.started_at).getHours())
  const endTimes   = runs.map(r => new Date(r.ended_at).getHours())
  const minHour = Math.max(0,  Math.min(...startTimes) - 1)
  const maxHour = Math.min(23, Math.max(...endTimes)   + 1)
  const hourSpan = maxHour - minHour   // 展示的小时数

  // 把时间点转成相对于 minHour 的百分比位置
  function toPct(iso: string) {
    const d = new Date(iso)
    const minutes = (d.getHours() - minHour) * 60 + d.getMinutes()
    return Math.min(100, Math.max(0, (minutes / (hourSpan * 60)) * 100))
  }

  const totalWorkedSecs = runs
    .filter(r => r.success)
    .reduce((s, r) => s + r.actual_seconds, 0)

  // 刻度线（每小时一条）
  const ticks = Array.from({ length: hourSpan + 1 }, (_, i) => minHour + i)

  // 颜色映射（每条任务一个颜色，循环）
  const COLORS = [
    'bg-primary/80',
    'bg-amber-500/80',
    'bg-emerald-500/80',
    'bg-rose-500/80',
    'bg-sky-500/80',
    'bg-violet-500/80',
  ]

  return (
    <div className="bg-card rounded-2xl border border-border p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">今日时间轴</h3>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Clock className="h-3.5 w-3.5" />
          累计专注 {fmtDuration(totalWorkedSecs)}
        </div>
      </div>

      {/* 时间轴主体 */}
      <div className="relative">
        {/* 刻度标签行 */}
        <div className="relative h-5 mb-1">
          {ticks.map(h => (
            <span
              key={h}
              className="absolute text-[10px] text-muted-foreground -translate-x-1/2"
              style={{ left: `${((h - minHour) / hourSpan) * 100}%` }}
            >
              {hourLabel(h)}
            </span>
          ))}
        </div>

        {/* 轨道 + 任务块 */}
        <div className="relative h-10 rounded-xl bg-secondary/50 overflow-visible">
          {/* 刻度线 */}
          {ticks.map(h => (
            <div
              key={h}
              className="absolute top-0 bottom-0 w-px bg-border/60"
              style={{ left: `${((h - minHour) / hourSpan) * 100}%` }}
            />
          ))}

          {/* 任务块 */}
          {runs.map((r, idx) => {
            const leftPct  = toPct(r.started_at)
            const rightPct = toPct(r.ended_at)
            const widthPct = Math.max(rightPct - leftPct, 0.5)
            const color = COLORS[idx % COLORS.length]
            const completePct = r.success
              ? 100
              : Math.round((r.actual_seconds / Math.max((new Date(r.ended_at).getTime() - new Date(r.started_at).getTime()) / 1000, 1)) * 100)

            return (
              <div
                key={r.task_id + r.started_at}
                className={cn(
                  'absolute top-1 bottom-1 rounded-lg flex items-center px-2 overflow-hidden group cursor-default',
                  color,
                  !r.success && 'opacity-60'
                )}
                style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                title={`${r.task_content}\n${fmtTime(r.started_at)} → ${fmtTime(r.ended_at)}`}
              >
                <span className="text-[10px] text-white font-medium truncate leading-none">
                  {widthPct > 5 ? r.task_content : ''}
                </span>
                {!r.success && widthPct > 8 && (
                  <span className="ml-auto text-[9px] text-white/70 shrink-0">{completePct}%</span>
                )}
              </div>
            )
          })}
        </div>

        {/* 任务图例列表 */}
        <div className="mt-3 space-y-1.5">
          {runs.map((r, idx) => {
            const color = COLORS[idx % COLORS.length]
            const wallSecs = (new Date(r.ended_at).getTime() - new Date(r.started_at).getTime()) / 1000
            const completePct = r.success
              ? 100
              : Math.min(99, Math.round((r.actual_seconds / Math.max(wallSecs, 1)) * 100))

            return (
              <div key={r.task_id + r.started_at} className="flex items-center gap-2.5">
                <div className={cn('h-2.5 w-2.5 rounded-sm shrink-0', color)} />
                <span className="text-xs text-foreground flex-1 truncate">{r.task_content}</span>
                <span className="text-[11px] text-muted-foreground shrink-0 tabular-nums">
                  {fmtTime(r.started_at)} – {fmtTime(r.ended_at)}
                </span>
                <span className={cn(
                  'text-[11px] font-medium shrink-0 tabular-nums',
                  r.success ? 'text-emerald-600' : 'text-muted-foreground'
                )}>
                  {r.success ? `✓ ${fmtDuration(r.actual_seconds)}` : `${completePct}%`}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {/* 底部累计 */}
      <div className="pt-2 border-t border-border flex items-center justify-between">
        <span className="text-xs text-muted-foreground">今日完成任务 {runs.filter(r => r.success).length} 个</span>
        <span className="text-sm font-bold text-primary tabular-nums">
          专注 {fmtDuration(totalWorkedSecs)}
        </span>
      </div>
    </div>
  )
}
