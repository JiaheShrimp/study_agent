import { useEffect, useState, useRef, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { Check, Trash2, Plus, Settings, Star, Clock, Swords, X, Play, Timer, Flame, AlertTriangle, Trophy, RotateCcw, ChevronLeft, ChevronRight, CalendarDays, BarChart2 } from 'lucide-react'
import { api, type DailyTask, type DailyBounty, type WorkRestConfig, type RoutineTask, type RoutinesData, type ArchivedRoutine } from '@/lib/api'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'

type TaskRun = Awaited<ReturnType<typeof api.tasks.runs>>[number]
import { cn, gameToday } from '@/lib/utils'
import { TaskRunner } from '@/components/TaskRunner'
import { StudyGoalCard } from '@/components/StudyGoalCard'
import { playBountyAppear, playClick, playTaskDone } from '@/lib/sounds'

// ── 工具 ─────────────────────────────────────────────────────
function daysInMonth(y: number, m: number) { return new Date(y, m + 1, 0).getDate() }
function firstWeekday(y: number, m: number) { return new Date(y, m, 1).getDay() }
function fmtDate(d: Date) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// ── 任务月历选择器 ────────────────────────────────────────────
function TaskCalendar({
  selectedDate,
  onSelect,
  datesWithTasks,
}: {
  selectedDate: string
  onSelect: (d: string) => void
  datesWithTasks: Set<string>
}) {
  const todayStr = gameToday()
  const [viewDate, setViewDate] = useState(() => {
    const d = new Date(selectedDate)
    return new Date(d.getFullYear(), d.getMonth(), 1)
  })
  const year  = viewDate.getFullYear()
  const month = viewDate.getMonth()
  const days  = daysInMonth(year, month)
  const pad   = firstWeekday(year, month)

  return (
    <div className="bg-card rounded-2xl border border-border shadow-sm p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium">{year} 年 {month + 1} 月</span>
        <div className="flex gap-0.5">
          <button
            onClick={() => setViewDate(new Date(year, month - 1, 1))}
            className="h-7 w-7 flex items-center justify-center rounded-lg hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            onClick={() => setViewDate(new Date(year, month + 1, 1))}
            disabled={year === new Date().getFullYear() && month >= new Date().getMonth()}
            className="h-7 w-7 flex items-center justify-center rounded-lg hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground disabled:opacity-30"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 mb-1">
        {['日','一','二','三','四','五','六'].map(d => (
          <div key={d} className="text-center text-[11px] text-muted-foreground py-0.5">{d}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-0.5">
        {Array.from({ length: pad }).map((_, i) => <div key={`p${i}`} />)}
        {Array.from({ length: days }).map((_, i) => {
          const d   = i + 1
          const key = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
          const isToday    = key === todayStr
          const isSelected = key === selectedDate
          const hasTasks   = datesWithTasks.has(key)
          const isFuture   = key > todayStr

          return (
            <button
              key={key}
              onClick={() => !isFuture && onSelect(key)}
              disabled={isFuture}
              className={cn(
                'relative h-8 w-full rounded-lg text-xs flex flex-col items-center justify-center transition-colors',
                isFuture    && 'opacity-25 cursor-default',
                isSelected  && 'bg-primary text-primary-foreground font-semibold',
                !isSelected && isToday && 'ring-1 ring-primary text-primary font-medium',
                !isSelected && !isFuture && 'hover:bg-secondary',
              )}
            >
              {d}
              {hasTasks && !isSelected && (
                <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-primary/50" />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ── 星级选择 ──────────────────────────────────────────────────
function StarPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map(n => (
        <button key={n} onClick={() => onChange(n)} className="p-0.5">
          <Star className={cn('h-3.5 w-3.5 transition-colors',
            n <= value ? 'text-amber-400 fill-amber-400' : 'text-border')} />
        </button>
      ))}
    </div>
  )
}

// ── 学习分析抽屉 ──────────────────────────────────────────────
type AnalysisRange = 7 | 30

function TaskAnalysisDrawer({ onClose }: { onClose: () => void }) {
  const [range, setRange] = useState<AnalysisRange>(7)
  const [data, setData]   = useState<{ date: string; effective_secs: number; score: number; excluded: boolean }[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    api.study.historyStats(range)
      .then(setData)
      .finally(() => setLoading(false))
  }, [range])

  const chartData = data.map(d => ({
    date: d.date.slice(5),   // MM-DD
    hours: +(d.effective_secs / 3600).toFixed(2),
    score: d.score,
    excluded: d.excluded,
  }))

  const activeDays  = data.filter(d => d.effective_secs > 0).length
  const bestHours   = Math.max(...data.map(d => d.effective_secs), 0) / 3600
  const bestScore   = Math.max(...data.map(d => d.score), 0)
  const avgHours    = activeDays > 0
    ? data.reduce((s, d) => s + d.effective_secs, 0) / activeDays / 3600
    : 0

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-foreground/15 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-sm h-full bg-card shadow-2xl flex flex-col overflow-hidden">
        {/* 头部 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <span className="text-sm font-semibold">学习分析</span>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {/* 时间范围切换 */}
          <div className="flex gap-1 bg-secondary rounded-xl p-1">
            {([7, 30] as AnalysisRange[]).map(r => (
              <button key={r} onClick={() => setRange(r)}
                className={cn('flex-1 text-xs py-1.5 rounded-lg font-medium transition-all',
                  range === r ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
                )}>
                近 {r} 天
              </button>
            ))}
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">加载中…</div>
          ) : (
            <>
              {/* 汇总数据 */}
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: '最佳单日', value: `${bestHours.toFixed(1)}h` },
                  { label: '最高得分', value: `${bestScore}★` },
                  { label: '日均学习', value: `${avgHours.toFixed(1)}h` },
                ].map(item => (
                  <div key={item.label} className="bg-secondary/60 rounded-xl p-3 text-center">
                    <p className="text-base font-bold text-foreground">{item.value}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{item.label}</p>
                  </div>
                ))}
              </div>

              {/* 学习时间趋势 */}
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">每日学习时间（h）</p>
                <ResponsiveContainer width="100%" height={130}>
                  <BarChart data={chartData} barSize={range === 7 ? 14 : 6}>
                    <XAxis dataKey="date" tick={{ fontSize: 9 }} tickLine={false} axisLine={false}
                      interval={range === 30 ? 4 : 0} />
                    <YAxis hide />
                    <Tooltip
                      formatter={(v: number) => [`${v}h`, '学习时间']}
                      contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid hsl(var(--border))' }}
                    />
                    <Bar dataKey="hours" radius={[3, 3, 0, 0]}>
                      {chartData.map((entry, i) => (
                        <Cell key={i}
                          fill={entry.excluded ? 'hsl(var(--muted-foreground) / 0.3)' : 'hsl(var(--primary) / 0.8)'}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* 得分趋势 */}
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">每日得分（★）</p>
                <ResponsiveContainer width="100%" height={130}>
                  <BarChart data={chartData} barSize={range === 7 ? 14 : 6}>
                    <XAxis dataKey="date" tick={{ fontSize: 9 }} tickLine={false} axisLine={false}
                      interval={range === 30 ? 4 : 0} />
                    <YAxis hide />
                    <Tooltip
                      formatter={(v: number) => [`${v}★`, '得分']}
                      contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid hsl(var(--border))' }}
                    />
                    <Bar dataKey="score" radius={[3, 3, 0, 0]}>
                      {chartData.map((entry, i) => (
                        <Cell key={i}
                          fill={entry.score > 0 ? '#f59e0b' : 'hsl(var(--secondary))'}
                          opacity={entry.excluded ? 0.35 : 0.85}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* 排除日说明 */}
              {data.some(d => d.excluded) && (
                <p className="text-[10px] text-muted-foreground/60 text-center">灰色柱为已排除日期，不计入目标统计</p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ── 快速添加 ──────────────────────────────────────────────────
function QuickAdd({ onAdd }: { onAdd: (t: { content: string; hours: number; stars: number; count_in_effective: boolean }) => Promise<void> }) {
  const [content, setContent]                 = useState('')
  const [hours, setHours]                     = useState(1)
  const [stars, setStars]                     = useState(3)
  const [countInEffective, setCountInEffective] = useState(true)
  const [adding, setAdding]                   = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  async function submit() {
    const trimmed = content.trim()
    if (!trimmed || adding) return
    setAdding(true)
    try {
      await onAdd({ content: trimmed, hours, stars, count_in_effective: countInEffective })
      setContent('')
      inputRef.current?.focus()
    } finally {
      setAdding(false)
    }
  }

  return (
    <div className="bg-card rounded-2xl border border-border p-4 space-y-3">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">添加任务</p>
      <div className="flex gap-2">
        <input
          ref={inputRef}
          value={content}
          onChange={e => setContent(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') { e.preventDefault(); submit() }
            if (e.key === ' ' && content.trim()) { e.preventDefault(); submit() }
          }}
          placeholder="任务内容 — Enter 或空格快速添加下一条"
          className="flex-1 h-9 rounded-xl border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring/40"
          autoFocus
        />
        <button
          onClick={submit}
          disabled={!content.trim() || adding}
          className={cn(
            'h-9 w-9 rounded-xl flex items-center justify-center shrink-0 transition-all',
            content.trim() ? 'bg-primary text-primary-foreground hover:bg-primary/90' : 'bg-secondary text-muted-foreground'
          )}
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Clock className="h-3.5 w-3.5" />
          <input
            type="number" min={0.5} max={24} step={0.5}
            value={hours}
            onChange={e => setHours(Number(e.target.value))}
            className="w-14 h-7 rounded-lg border border-input bg-background px-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-ring/40"
          />
          <span className="text-xs">h</span>
        </div>
        <StarPicker value={stars} onChange={setStars} />
        <label className="flex items-center gap-1.5 cursor-pointer select-none ml-auto">
          <input
            type="checkbox"
            checked={!countInEffective}
            onChange={e => setCountInEffective(!e.target.checked)}
            className="h-3.5 w-3.5 rounded accent-muted-foreground"
          />
          <span className="text-xs text-muted-foreground">不计入学习时间</span>
        </label>
      </div>
    </div>
  )
}

// ── 单条任务行 ────────────────────────────────────────────────
function TaskRow({ task, onToggle, onDelete, onUpdate, onStart, readOnly = false, completePct, score }: {
  task: DailyTask
  onToggle: () => void
  onDelete: () => void
  onUpdate: (t: { content: string; hours: number; stars: number; count_in_effective: boolean }) => void
  onStart: () => void
  readOnly?: boolean
  completePct?: number   // 失败/中断时的完成百分比（0-99）
  score?: number         // 完成任务的得分
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState({
    content: task.content,
    hours: task.hours,
    stars: task.stars,
    count_in_effective: task.count_in_effective ?? true,
  })

  function save() {
    if (draft.content.trim()) onUpdate({ ...draft, content: draft.content.trim() })
    setEditing(false)
  }

  if (editing) {
    return (
      <div className="px-4 py-3 space-y-2.5">
        <input
          autoFocus
          value={draft.content}
          onChange={e => setDraft(d => ({ ...d, content: e.target.value }))}
          onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false) }}
          className="w-full h-8 rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring/40"
        />
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />
            <input
              type="number" min={0.5} max={24} step={0.5}
              value={draft.hours}
              onChange={e => setDraft(d => ({ ...d, hours: Number(e.target.value) }))}
              className="w-14 h-7 rounded-lg border border-input bg-background px-2 text-sm text-center focus:outline-none"
            />
            <span className="text-xs">h</span>
          </div>
          <StarPicker value={draft.stars} onChange={s => setDraft(d => ({ ...d, stars: s }))} />
          <label className="flex items-center gap-1.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={!draft.count_in_effective}
              onChange={e => setDraft(d => ({ ...d, count_in_effective: !e.target.checked }))}
              className="h-3.5 w-3.5 rounded accent-muted-foreground"
            />
            <span className="text-xs text-muted-foreground">不计入学习时间</span>
          </label>
          <div className="ml-auto flex gap-2">
            <button onClick={save} className="text-xs text-primary font-medium">保存</button>
            <button onClick={() => setEditing(false)} className="text-xs text-muted-foreground">取消</button>
          </div>
        </div>
      </div>
    )
  }

  const runStatus  = task.run_status ?? 'none'
  const isFailed   = runStatus === 'running_failed'
  const isPaused   = runStatus === 'paused'
  const isComplete = task.done || runStatus === 'completed'
  const canStart = !isComplete && !readOnly

  return (
    <div className={cn('flex items-start gap-3 px-4 py-3.5 group transition-colors',
      isComplete ? 'opacity-55' : !readOnly && 'hover:bg-secondary/30')}>
      <button
        onClick={onToggle}
        disabled={readOnly}
        className={cn(
          'mt-0.5 h-5 w-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all',
          isComplete ? 'bg-primary border-primary' :
          isFailed   ? 'border-rose-400 bg-rose-50' :
          isPaused   ? 'border-amber-400 bg-amber-50' :
          'border-border hover:border-primary/60',
          readOnly && 'cursor-default'
        )}
      >
        {isComplete && <Check className="h-3 w-3 text-primary-foreground" />}
        {isFailed && !isComplete && <span className="text-[8px] text-rose-500 font-bold">✕</span>}
        {isPaused && !isComplete && <span className="text-[8px] text-amber-500 font-bold">▮▮</span>}
      </button>
      <button
        onClick={() => !readOnly && !isComplete && !isFailed && !isPaused && setEditing(true)}
        className="flex-1 text-left min-w-0"
        disabled={readOnly}
      >
        <p className={cn(
          'text-sm leading-relaxed',
          isComplete && 'line-through text-muted-foreground',
          isFailed && !isComplete && 'line-through text-rose-400/80',
          isPaused && !isComplete && 'text-amber-700/80',
        )}>
          {task.content}
        </p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-[11px] text-muted-foreground flex items-center gap-0.5">
            <Clock className="h-3 w-3" />{task.hours}h
          </span>
          <span className="flex gap-0.5">
            {Array.from({ length: task.stars }).map((_, i) => (
              <Star key={i} className="h-2.5 w-2.5 text-amber-400 fill-amber-400" />
            ))}
          </span>
          {isFailed && !isComplete && (
            <span className="text-[10px] text-rose-500 font-medium">
              {completePct != null ? `${completePct}% · ` : ''}失败 · 可重试
            </span>
          )}
          {isPaused && !isComplete && (
            <span className="text-[10px] text-amber-600 font-medium">
              {completePct != null ? `${completePct}% · ` : ''}已暂停 · 点击继续
            </span>
          )}
          {!(task.count_in_effective ?? true) && (
            <span className="text-[10px] text-muted-foreground/70 bg-secondary px-1.5 py-0.5 rounded-md">
              不计时
            </span>
          )}
          {isComplete && score != null && (task.count_in_effective ?? true) && (
            <span className="text-[10px] text-amber-500 font-medium bg-amber-50 px-1.5 py-0.5 rounded-md">
              +{score}★
            </span>
          )}
        </div>
      </button>
      {/* 开始/重试/继续按钮（历史只读时隐藏） */}
      {canStart && (
        <button
          onClick={e => { e.stopPropagation(); onStart() }}
          className={cn(
            'opacity-0 group-hover:opacity-100 mt-0.5 transition-all shrink-0 ml-1',
            isFailed  ? 'text-rose-400 hover:text-rose-600' :
            isPaused  ? 'text-amber-500 hover:text-amber-700' :
            'text-muted-foreground hover:text-primary'
          )}
          title={isFailed ? '重试任务' : isPaused ? '继续任务' : '开始任务'}
        >
          <Play className="h-3.5 w-3.5" />
        </button>
      )}
      {!readOnly && (
        <button onClick={onDelete}
          className="opacity-0 group-hover:opacity-100 mt-0.5 text-muted-foreground hover:text-rose-500 transition-all shrink-0">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  )
}

// ── 赏金任务卡片 ──────────────────────────────────────────────
function BountyCard({ bounty, onAccept, onExpire }: {
  bounty: DailyBounty
  onAccept: () => void
  onExpire: () => void
}) {
  const accepted = bounty.status === 'accepted' || bounty.status === 'done'
  return (
    <div className={cn('rounded-2xl border p-5 space-y-4',
      accepted ? 'border-amber-200 bg-amber-50/60' : 'border-amber-200/60 bg-amber-50/30')}>
      <div className="flex items-start gap-3">
        <Swords className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <p className="text-base font-semibold leading-snug">{bounty.content}</p>
            {bounty.ai_generated && (
              <span className="shrink-0 text-[10px] text-violet-500 font-medium bg-violet-50 border border-violet-200 rounded-md px-1.5 py-0.5 mt-0.5">✦ AI</span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-1">
            <span className="text-sm text-muted-foreground flex items-center gap-0.5">
              <Clock className="h-3.5 w-3.5" />{bounty.hours}h
            </span>
            <span className="flex gap-0.5">
              {Array.from({ length: bounty.stars }).map((_, i) => (
                <Star key={i} className="h-3.5 w-3.5 text-amber-400 fill-amber-400" />
              ))}
            </span>
          </div>
          {/* Buff 展示 */}
          <div className="mt-3 flex items-center gap-2 bg-amber-100 rounded-xl px-3 py-2">
            <span className="text-xl leading-none">{bounty.buff.emoji}</span>
            <div>
              <p className="text-sm font-semibold text-amber-800">{bounty.buff.name}</p>
              <p className="text-xs text-amber-700 leading-snug mt-0.5">{bounty.buff.desc}</p>
            </div>
          </div>
        </div>
      </div>
      {bounty.status === 'pending' && (
        <div className="flex gap-2">
          <button onClick={onAccept}
            className="flex-1 h-10 rounded-xl bg-amber-500 text-white text-sm font-semibold hover:bg-amber-600 transition-colors">
            接受挑战
          </button>
          <button onClick={onExpire}
            className="flex-1 h-10 rounded-xl border border-border text-sm text-muted-foreground hover:bg-secondary transition-colors">
            放弃
          </button>
        </div>
      )}
      {accepted && (
        <p className="text-sm text-amber-700 font-medium flex items-center gap-1">
          ✓ 已接受 · 完成任务可获得 {bounty.buff.emoji} {bounty.buff.name}
        </p>
      )}
      {bounty.status === 'done' && (
        <p className="text-sm text-emerald-600 font-medium">🎉 已完成，buff 已生效！</p>
      )}
    </div>
  )
}

// ── 常规任务：新增弹窗 ────────────────────────────────────────
function AddRoutineModal({
  maxReached,
  onAdd,
  onClose,
}: {
  maxReached: boolean
  onAdd: (r: { content: string; hours: number; stars: number; target_days: number; allow_makeup: boolean }) => Promise<void>
  onClose: () => void
}) {
  const [content, setContent]         = useState('')
  const [hours, setHours]             = useState(0.5)
  const [stars, setStars]             = useState(3)
  const [targetDays, setTargetDays]   = useState(21)
  const [allowMakeup, setAllowMakeup] = useState(false)
  const [saving, setSaving]           = useState(false)

  async function submit() {
    if (!content.trim() || saving) return
    setSaving(true)
    try { await onAdd({ content: content.trim(), hours, stars, target_days: targetDays, allow_makeup: allowMakeup }) }
    finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-foreground/15 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-80 bg-card rounded-3xl border border-border shadow-2xl overflow-hidden">
        <div className="h-1 bg-gradient-to-r from-violet-400 to-purple-500" />
        <div className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold">新增常规任务</h2>
              <p className="text-xs text-muted-foreground mt-0.5">坚持完成以养成习惯</p>
            </div>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>

          {maxReached && (
            <div className="rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-700">
              已达到常规任务上限，请先删除或完成现有任务。
            </div>
          )}

          <div className="space-y-3">
            <input
              autoFocus
              value={content}
              onChange={e => setContent(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') submit() }}
              placeholder="习惯内容，如「每天背 30 个单词」"
              className="w-full h-9 rounded-xl border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring/40"
              disabled={maxReached}
            />
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Clock className="h-3.5 w-3.5" />
                <input type="number" min={0.25} max={8} step={0.25}
                  value={hours}
                  onChange={e => setHours(Number(e.target.value))}
                  className="w-14 h-7 rounded-lg border border-input bg-background px-2 text-sm text-center focus:outline-none"
                  disabled={maxReached}
                />
                <span className="text-xs">h</span>
              </div>
              <StarPicker value={stars} onChange={setStars} />
            </div>
            <div className="flex items-center gap-2">
              <Flame className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="text-xs text-muted-foreground shrink-0">目标天数</span>
              <input type="number" min={7} max={365} step={1}
                value={targetDays}
                onChange={e => setTargetDays(Number(e.target.value))}
                className="w-16 h-7 rounded-lg border border-input bg-background px-2 text-sm text-center focus:outline-none"
                disabled={maxReached}
              />
              <span className="text-xs text-muted-foreground">天</span>
            </div>
            {/* 补卡开关 */}
            <button
              type="button"
              onClick={() => !maxReached && setAllowMakeup(v => !v)}
              disabled={maxReached}
              className={cn(
                'flex items-center gap-2 rounded-xl px-3 py-2 text-xs transition-colors border',
                allowMakeup
                  ? 'bg-violet-50 border-violet-200 text-violet-700'
                  : 'bg-secondary/50 border-border text-muted-foreground hover:bg-secondary'
              )}
            >
              <span className={cn(
                'relative w-7 h-4 rounded-full transition-colors shrink-0',
                allowMakeup ? 'bg-violet-500' : 'bg-border'
              )}>
                <span className={cn(
                  'absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform',
                  allowMakeup ? 'translate-x-3.5' : 'translate-x-0.5'
                )} />
              </span>
              <span>允许补卡 — 昨天漏打可在今天补上，保持连续</span>
            </button>
          </div>

          <div className="flex gap-2 pt-1">
            <button onClick={onClose}
              className="flex-1 h-9 rounded-2xl border border-border text-sm text-muted-foreground hover:bg-secondary transition-colors">
              取消
            </button>
            <button onClick={submit} disabled={saving || !content.trim() || maxReached}
              className="flex-1 h-9 rounded-2xl bg-violet-500 text-white text-sm font-medium hover:bg-violet-600 transition-colors disabled:opacity-40">
              {saving ? '添加中…' : '开始坚持'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── 常规任务：设置弹窗 ────────────────────────────────────────
function RoutineSettingsModal({
  data,
  onSave,
  onClose,
}: {
  data: RoutinesData
  onSave: (s: { fail_days_limit: number }) => Promise<void>
  onClose: () => void
}) {
  const [failD, setFailD] = useState(data.fail_days_limit)
  const [saving, setSaving] = useState(false)

  async function save() {
    setSaving(true)
    try { await onSave({ fail_days_limit: failD }) }
    finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-foreground/15 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-80 bg-card rounded-3xl border border-border shadow-2xl overflow-hidden">
        <div className="h-1 bg-gradient-to-r from-violet-400 to-purple-500" />
        <div className="p-6 space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">常规任务设置</h2>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">同时上限</p>
                <p className="text-[11px] text-muted-foreground">养成习惯解锁更多槽位，失败则减少</p>
              </div>
              <span className="text-sm font-semibold text-violet-500">{data.max_routines} 个</span>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">强制警告天数</p>
                <p className="text-[11px] text-muted-foreground">连续几天未完成触发警告</p>
              </div>
              <div className="flex items-center gap-1.5">
                <input type="number" min={1} max={30}
                  value={failD} onChange={e => setFailD(Number(e.target.value))}
                  className="w-14 h-8 rounded-lg border border-input bg-background px-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-ring/40"
                />
                <span className="text-xs text-muted-foreground">天</span>
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={onClose}
              className="flex-1 h-9 rounded-2xl border border-border text-sm text-muted-foreground hover:bg-secondary transition-colors">
              取消
            </button>
            <button onClick={save} disabled={saving}
              className="flex-1 h-9 rounded-2xl bg-violet-500 text-white text-sm font-medium hover:bg-violet-600 transition-colors disabled:opacity-50">
              {saving ? '保存中…' : '保存'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── 常规任务：单条卡片 ────────────────────────────────────────
function RoutineCard({
  routine,
  today,
  failDaysLimit,
  onToggle,
  onMakeup,
  onDelete,
  onStart,
}: {
  routine: RoutineTask
  today: string
  failDaysLimit: number
  onToggle: () => void
  onMakeup: () => void
  onDelete: () => void
  onStart: () => void
}) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const doneTodayFlag = routine.last_done_date === today
  const progressPct = Math.min(100, Math.round((routine.total_done / routine.target_days) * 100))
  const remaining = routine.target_days - routine.total_done

  return (
    <div className={cn(
      'rounded-2xl border p-4 space-y-3 transition-colors',
      routine.completed
        ? 'border-emerald-200 bg-emerald-50/40'
        : routine.force_warning
        ? 'border-rose-200 bg-rose-50/50'
        : 'border-violet-100 bg-violet-50/30'
    )}>
      {/* 顶部：标题 + 操作 */}
      <div className="flex items-start gap-2">
        {/* 完成勾选 */}
        <button
          onClick={onToggle}
          disabled={routine.completed}
          className={cn(
            'mt-0.5 h-5 w-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all',
            doneTodayFlag
              ? 'bg-violet-500 border-violet-500'
              : routine.completed
              ? 'bg-emerald-400 border-emerald-400'
              : 'border-violet-300 hover:border-violet-500'
          )}
        >
          {(doneTodayFlag || routine.completed) && <Check className="h-3 w-3 text-white" />}
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            {routine.completed && <Trophy className="h-3.5 w-3.5 text-emerald-500 shrink-0" />}
            {routine.force_warning && !routine.completed && (
              <AlertTriangle className="h-3.5 w-3.5 text-rose-500 shrink-0" />
            )}
            <p className={cn(
              'text-sm font-medium',
              routine.completed && 'text-emerald-700',
              routine.force_warning && !routine.completed && 'text-rose-700',
            )}>
              {routine.content}
            </p>
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-[11px] text-muted-foreground flex items-center gap-0.5">
              <Clock className="h-3 w-3" />{routine.hours}h
            </span>
            <span className="flex gap-0.5">
              {Array.from({ length: routine.stars }).map((_, i) => (
                <Star key={i} className="h-2.5 w-2.5 text-amber-400 fill-amber-400" />
              ))}
            </span>
          </div>
        </div>

        {/* 右侧按钮组 */}
        <div className="flex items-center gap-1.5 shrink-0">
          {!routine.completed && (
            <button
              onClick={onStart}
              className="h-7 w-7 rounded-lg flex items-center justify-center text-violet-400 hover:text-violet-600 hover:bg-violet-100 transition-colors"
              title="启动计时"
            >
              <Play className="h-3.5 w-3.5" />
            </button>
          )}
          {confirmDelete ? (
            <div className="flex items-center gap-1">
              <button onClick={onDelete}
                className="text-[11px] text-rose-600 font-medium px-2 py-0.5 rounded-lg bg-rose-100 hover:bg-rose-200 transition-colors">
                确认删除
              </button>
              <button onClick={() => setConfirmDelete(false)}
                className="text-[11px] text-muted-foreground px-1">
                取消
              </button>
            </div>
          ) : (
            <button onClick={() => setConfirmDelete(true)}
              className="h-7 w-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-rose-500 hover:bg-rose-50 transition-colors">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* 进度条 */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-[11px]">
          <div className="flex items-center gap-2 text-muted-foreground">
            <span className="flex items-center gap-1">
              <Flame className="h-3 w-3 text-orange-400" />
              连续 <span className="font-semibold text-foreground">{routine.streak}</span> 天
            </span>
            <span>·</span>
            <span>共 {routine.total_done}/{routine.target_days} 天</span>
          </div>
          <span className={cn(
            'font-medium',
            routine.completed ? 'text-emerald-600' : routine.force_warning ? 'text-rose-500' : 'text-violet-600'
          )}>
            {routine.completed ? '已完成！' : `还差 ${remaining} 天`}
          </span>
        </div>
        <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
          <div
            className={cn(
              'h-full rounded-full transition-all',
              routine.completed ? 'bg-emerald-400' : routine.force_warning ? 'bg-rose-400' : 'bg-violet-400'
            )}
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {/* 补卡提示 */}
      {routine.makeup_available && (
        <button
          onClick={onMakeup}
          className="w-full flex items-center justify-center gap-1.5 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-xs text-violet-700 font-medium hover:bg-violet-100 transition-colors"
        >
          <RotateCcw className="h-3 w-3" />
          补昨天的打卡（今天已完成，再补一次保持连续）
        </button>
      )}

      {/* 强制警告 */}
      {routine.force_warning && !routine.completed && (
        <div className="rounded-xl bg-rose-100 border border-rose-200 px-3 py-2 text-xs text-rose-700 flex items-start gap-1.5">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <span>已连续 <strong>{routine.fail_days}</strong> 天未完成，达到上限后将自动移除此习惯。</span>
        </div>
      )}
      {/* 接近警告（未触发但已有失败天数） */}
      {!routine.force_warning && !routine.completed && routine.fail_days > 0 && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-700 flex items-start gap-1.5">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <span>已连续 <strong>{routine.fail_days}</strong> 天未完成，连续 {failDaysLimit} 天将自动移除。</span>
        </div>
      )}

      {/* 最佳连续记录 */}
      {routine.best_streak > 0 && routine.best_streak > routine.streak && (
        <p className="text-[10px] text-muted-foreground flex items-center gap-1">
          <RotateCcw className="h-3 w-3" />
          历史最长连续 {routine.best_streak} 天
        </p>
      )}
    </div>
  )
}

// ── 计时设置弹窗 ──────────────────────────────────────────────
function WorkRestModal({
  cfg,
  onSave,
  onClose,
}: {
  cfg: WorkRestConfig
  onSave: (c: WorkRestConfig) => Promise<void>
  onClose: () => void
}) {
  const [workMins, setWorkMins] = useState(cfg.work_mins)
  const [restMins, setRestMins] = useState(cfg.rest_mins)
  const [saving, setSaving] = useState(false)

  async function save() {
    setSaving(true)
    try { await onSave({ work_mins: workMins, rest_mins: restMins }) }
    finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-foreground/15 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-80 bg-card rounded-3xl border border-border shadow-2xl overflow-hidden">
        <div className="h-1 bg-gradient-to-r from-sky-300 to-blue-400" />
        <div className="p-6 space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold">计时设置</h2>
              <p className="text-xs text-muted-foreground mt-0.5">自定义工作与休息节奏</p>
            </div>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">工作时长</p>
                <p className="text-[11px] text-muted-foreground">每专注段的分钟数</p>
              </div>
              <div className="flex items-center gap-1.5">
                <input
                  type="number" min={5} max={120} step={5}
                  value={workMins}
                  onChange={e => setWorkMins(Number(e.target.value))}
                  className="w-16 h-8 rounded-lg border border-input bg-background px-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-ring/40"
                />
                <span className="text-xs text-muted-foreground">分钟</span>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">休息预算</p>
                <p className="text-[11px] text-muted-foreground">每工作段对应的休息配额</p>
              </div>
              <div className="flex items-center gap-1.5">
                <input
                  type="number" min={1} max={30} step={1}
                  value={restMins}
                  onChange={e => setRestMins(Number(e.target.value))}
                  className="w-16 h-8 rounded-lg border border-input bg-background px-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-ring/40"
                />
                <span className="text-xs text-muted-foreground">分钟</span>
              </div>
            </div>

            <div className="rounded-xl bg-secondary/50 px-3 py-2.5 text-[11px] text-muted-foreground">
              当前设置：每工作 <span className="font-semibold text-foreground">{workMins}m</span> 休息 <span className="font-semibold text-foreground">{restMins}m</span>，
              暂停时消耗休息预算，耗尽则任务失败。
            </div>
          </div>

          <div className="flex gap-2">
            <button onClick={onClose}
              className="flex-1 h-9 rounded-2xl border border-border text-sm text-muted-foreground hover:bg-secondary transition-colors">
              取消
            </button>
            <button onClick={save} disabled={saving}
              className="flex-1 h-9 rounded-2xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50">
              {saving ? '保存中…' : '保存'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── 星星墙 ────────────────────────────────────────────────────
function StarWall({ count }: { count: number }) {
  if (count <= 0) return null
  const rows: number[] = []
  let remaining = count
  while (remaining > 0) {
    rows.push(Math.min(remaining, 10))
    remaining -= 10
  }
  return (
    <div className="bg-card rounded-2xl border border-border px-5 py-4 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground">今日获得</p>
        <p className="text-xs font-semibold text-amber-600">{count} ★</p>
      </div>
      <div className="space-y-1">
        {rows.map((n, ri) => (
          <div key={ri} className="flex gap-0.5 flex-wrap">
            {Array.from({ length: n }).map((_, i) => (
              <span key={i} className="text-amber-400 text-base leading-none select-none">★</span>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── 主页面 ────────────────────────────────────────────────────
export function Tasks() {
  const todayStr = gameToday()

  const [selectedDate, setSelectedDate]     = useState(todayStr)
  const [datesWithTasks, setDatesWithTasks] = useState<Set<string>>(new Set())
  const [calendarOpen, setCalendarOpen]     = useState(false)

  const [tasks, setTasks]           = useState<DailyTask[]>([])
  const [runs, setRuns]             = useState<TaskRun[]>([])
  const [bounties, setBounties]      = useState<DailyBounty[]>([])
  const [loading, setLoading]       = useState(true)
  const [totalScore, setTotalScore] = useState<number | null>(null)
  const [bountyModal, setBountyModal] = useState(false)
  const [runningTask, setRunningTask] = useState<DailyTask | null>(null)
  const [workRestCfg, setWorkRestCfg]   = useState<WorkRestConfig>({ work_mins: 30, rest_mins: 5 })
  const [timerModal, setTimerModal]     = useState(false)
  const [analysisOpen, setAnalysisOpen] = useState(false)
  const [routinesData, setRoutinesData] = useState<RoutinesData>({ max_routines: 3, fail_days_limit: 3, routines: [] })
  const [multiplier, setMultiplier] = useState(1.0)
  const [addRoutineModal, setAddRoutineModal]         = useState(false)
  const [routineSettingsModal, setRoutineSettingsModal] = useState(false)
  const [archivedDrawer, setArchivedDrawer]           = useState(false)
  const [archivedList, setArchivedList]               = useState<ArchivedRoutine[]>([])
  const [studyRefreshKey, setStudyRefreshKey] = useState(0)
  const [runnerInitSecs, setRunnerInitSecs] = useState(0)
  // 本次会话已经弹出过的赏金任务 id，避免重复弹
  const shownBountyIds = useRef<Set<string>>(new Set())

  const isToday = selectedDate === todayStr

  const reload = useCallback(async (date: string) => {
    const [t, b, r, sc] = await Promise.all([
      api.tasks.daily(date).catch(() => [] as DailyTask[]),
      isToday ? api.tasks.dailyBounties().catch(() => [] as DailyBounty[]) : Promise.resolve([] as DailyBounty[]),
      api.tasks.runs(date).catch(() => [] as TaskRun[]),
      api.tasks.dailyScore(date).catch(() => ({ total_score: 0 })),
    ])
    setTasks(t)
    setBounties(b)
    setRuns(r)
    setTotalScore(sc.total_score ?? 0)
  }, [isToday])

  useEffect(() => {
    ;(async () => {
      setLoading(true)
      if (isToday) {
        await api.tasks.initDaily().catch(() => {})
        await api.tasks.generateBounties().catch(() => {})  // 生成当日赏金（幂等）
      }
      const [cfg, rd, dates, bonus] = await Promise.all([
        api.workRest.get().catch(() => null),
        api.routines.get().catch(() => null),
        api.tasks.dailyDates().catch(() => [] as string[]),
        api.bonus.today().catch(() => null),
      ])
      if (cfg)   setWorkRestCfg(cfg)
      if (rd)    setRoutinesData(rd)
      if (bonus) setMultiplier(bonus.multiplier)
      setDatesWithTasks(new Set(dates))
      await reload(selectedDate)
      setLoading(false)
    })()
  }, [selectedDate])

  // 轮询：每 60 秒检查是否有到时间的赏金任务需要弹出
  useEffect(() => {
    if (!isToday) return
    function checkPending() {
      api.tasks.pendingBounties().then(pending => {
        if (pending.length === 0) return
        // 找出本次会话首次出现的新赏金
        const newOnes = pending.filter(p => !shownBountyIds.current.has(p.id))
        setBounties(prev => {
          const ids = new Set(prev.map(b => b.id))
          return [...prev, ...pending.filter(p => !ids.has(p.id))]
        })
        if (newOnes.length > 0) {
          newOnes.forEach(p => shownBountyIds.current.add(p.id))
          setBountyModal(true)
          playBountyAppear()
        }
      }).catch(() => {})
    }
    checkPending()
    const id = setInterval(checkPending, 60_000)
    return () => clearInterval(id)
  }, [isToday])

  async function handleAdd(t: { content: string; hours: number; stars: number; count_in_effective: boolean }) {
    await api.tasks.addDaily(t)
    reload(selectedDate)
    api.tasks.dailyDates().then(d => setDatesWithTasks(new Set(d))).catch(() => {})
  }
  async function handleToggle(id: string, currentDone: boolean) {
    await api.tasks.toggleDone(id)
    if (!currentDone) playTaskDone()
    reload(selectedDate)
    setStudyRefreshKey(k => k + 1)
  }
  async function handleDelete(id: string) { await api.tasks.deleteDaily(id); reload(selectedDate) }
  async function handleUpdate(id: string, t: { content: string; hours: number; stars: number; count_in_effective: boolean }) {
    await api.tasks.updateDaily(id, t); reload(selectedDate)
  }
  async function handleBountyAccept(id: string) {
    await api.tasks.respondBounty(id, 'accepted')
    const updated = await api.tasks.dailyBounties().catch(() => bounties)
    setBounties(updated)
    // 没有剩余 pending 就关弹窗
    if (!updated.some(b => b.status === 'pending')) setBountyModal(false)
  }
  async function handleBountyExpire(id: string) {
    await api.tasks.respondBounty(id, 'expired')
    const updated = await api.tasks.dailyBounties().catch(() => bounties)
    setBounties(updated)
    if (!updated.some(b => b.status === 'pending')) setBountyModal(false)
  }

  const done    = tasks.filter(t => t.done).length
  const pendingBounties = bounties.filter(b => b.status === 'pending')
  const accepted = bounties.filter(b => b.status === 'accepted' || b.status === 'done')

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-5">

        {/* 页头 */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">每日任务</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              {done}/{tasks.length} 完成
            </p>
          </div>
          <div className="flex gap-2">
            {isToday && pendingBounties.length > 0 && (
              <button onClick={() => { playClick(); setBountyModal(true) }}
                className="flex items-center gap-1.5 text-xs text-amber-700 border border-amber-200 bg-amber-50 rounded-lg px-3 py-1.5 hover:bg-amber-100 transition-colors">
                <Swords className="h-3.5 w-3.5" /> 赏金 {pendingBounties.length}
              </button>
            )}
            {isToday && (
              <button onClick={() => setTimerModal(true)}
                className="flex items-center gap-1.5 text-xs text-muted-foreground border border-border rounded-lg px-3 py-1.5 hover:bg-secondary transition-colors"
                title={`每 ${workRestCfg.work_mins}m 休息 ${workRestCfg.rest_mins}m`}>
                <Timer className="h-3.5 w-3.5" /> {workRestCfg.work_mins}m/{workRestCfg.rest_mins}m
              </button>
            )}
            <button onClick={() => setAnalysisOpen(true)}
              className="flex items-center gap-1.5 text-xs text-muted-foreground border border-border rounded-lg px-3 py-1.5 hover:bg-secondary transition-colors">
              <BarChart2 className="h-3.5 w-3.5" /> 分析
            </button>
            <Link to="/tasks/manage"
              className="flex items-center gap-1.5 text-xs text-muted-foreground border border-border rounded-lg px-3 py-1.5 hover:bg-secondary transition-colors">
              <Settings className="h-3.5 w-3.5" /> 管理
            </Link>
          </div>
        </div>

        {/* 日期导航栏 */}
        <div className="bg-card rounded-2xl border border-border px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => {
              const d = new Date(selectedDate)
              d.setDate(d.getDate() - 1)
              setSelectedDate(fmtDate(d))
              setCalendarOpen(false)
            }}
            className="h-7 w-7 flex items-center justify-center rounded-lg hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground shrink-0"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>

          <button
            onClick={() => setCalendarOpen(v => !v)}
            className="flex-1 flex items-center justify-center gap-2 text-sm font-medium hover:text-primary transition-colors"
          >
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
            {isToday ? `今天 · ${selectedDate}` : selectedDate}
            {!isToday && (
              <span className="text-[10px] text-muted-foreground bg-secondary px-1.5 py-0.5 rounded-md">历史</span>
            )}
          </button>

          <button
            onClick={() => {
              const d = new Date(selectedDate)
              d.setDate(d.getDate() + 1)
              const next = fmtDate(d)
              if (next <= todayStr) { setSelectedDate(next); setCalendarOpen(false) }
            }}
            disabled={isToday}
            className="h-7 w-7 flex items-center justify-center rounded-lg hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground disabled:opacity-30 shrink-0"
          >
            <ChevronRight className="h-4 w-4" />
          </button>

          {!isToday && (
            <button
              onClick={() => { setSelectedDate(todayStr); setCalendarOpen(false) }}
              className="text-[11px] text-primary font-medium hover:text-primary/80 transition-colors shrink-0"
            >
              回到今天
            </button>
          )}
        </div>

        {/* 月历展开 */}
        {calendarOpen && (
          <TaskCalendar
            selectedDate={selectedDate}
            onSelect={d => { setSelectedDate(d); setCalendarOpen(false) }}
            datesWithTasks={datesWithTasks}
          />
        )}

        {/* 有效学习时间目标（详细版） */}
        <StudyGoalCard date={selectedDate} refreshKey={studyRefreshKey} />

        {/* 常规任务区块 */}
        {(routinesData.routines.length > 0 || true) && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                <Flame className="h-3.5 w-3.5 text-violet-400" />
                常规任务
                <span className="text-[10px] font-normal normal-case">
                  {routinesData.routines.filter(r => !r.completed).length}/{routinesData.max_routines}
                </span>
              </p>
              <div className="flex gap-1.5">
                <button
                  onClick={async () => {
                    const list = await api.routines.archived().catch(() => [])
                    setArchivedList(list)
                    setArchivedDrawer(true)
                  }}
                  className="h-6 px-2 rounded-md flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                  title="习惯历史"
                >
                  <CalendarDays className="h-3 w-3" />
                  历史
                </button>
                <button onClick={() => setRoutineSettingsModal(true)}
                  className="h-6 w-6 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
                  <Settings className="h-3.5 w-3.5" />
                </button>
                <button onClick={() => setAddRoutineModal(true)}
                  className="h-6 w-6 rounded-md flex items-center justify-center text-violet-500 hover:text-violet-700 hover:bg-violet-50 transition-colors">
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {routinesData.routines.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-violet-200 bg-violet-50/20 p-5 text-center">
                <p className="text-sm text-muted-foreground">还没有常规任务</p>
                <p className="text-xs text-muted-foreground mt-1">添加一个想坚持的习惯，追踪你的连续完成天数</p>
                <button onClick={() => setAddRoutineModal(true)}
                  className="mt-3 text-xs text-violet-600 font-medium hover:text-violet-800 transition-colors">
                  + 添加第一个习惯
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {routinesData.routines.map(r => (
                  <RoutineCard
                    key={r.id}
                    routine={r}
                    today={todayStr}
                    failDaysLimit={routinesData.fail_days_limit}
                    onToggle={async () => {
                      const updated = await api.routines.toggleDone(r.id, todayStr).catch(() => null)
                      if (updated) {
                        setRoutinesData(d => ({
                          ...d,
                          routines: d.routines.map(x => x.id === r.id ? updated : x),
                        }))
                      }
                    }}
                    onMakeup={async () => {
                      const yesterday = fmtDate(new Date(Date.now() - 86400000))
                      const updated = await api.routines.toggleDone(r.id, yesterday).catch(() => null)
                      if (updated) {
                        setRoutinesData(d => ({
                          ...d,
                          routines: d.routines.map(x => x.id === r.id ? updated : x),
                        }))
                      }
                    }}
                    onDelete={async () => {
                      await api.routines.delete(r.id).catch(() => {})
                      setRoutinesData(d => ({ ...d, routines: d.routines.filter(x => x.id !== r.id) }))
                    }}
                    onStart={() => {
                      // 把常规任务包装成 DailyTask 格式传给 TaskRunner
                      setRunningTask({
                        id: r.id,
                        content: r.content,
                        hours: r.hours,
                        stars: r.stars,
                        done: false,
                        from_template: false,
                        run_status: 'none',
                      } as DailyTask)
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* 已接受的赏金任务 */}
        {accepted.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">赏金任务</p>
            {accepted.map(b => (
              <BountyCard key={b.id} bounty={b}
                onAccept={() => handleBountyAccept(b.id)}
                onExpire={() => handleBountyExpire(b.id)} />
            ))}
          </div>
        )}

        {/* 任务列表 */}
        <div className="bg-card rounded-2xl border border-border overflow-hidden">
          {loading ? (
            <p className="text-sm text-muted-foreground text-center py-10">加载中…</p>
          ) : tasks.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-10">
              {isToday ? '还没有任务，在下方添加' : '这一天没有任务记录'}
            </p>
          ) : (
            <div className="divide-y divide-border">
              {tasks.map(t => {
                // 取该任务最后一条失败 run，计算完成百分比
                const lastFailRun = [...runs]
                  .filter(r => r.task_id === t.id && !r.success)
                  .pop()
                const completePct = lastFailRun
                  ? Math.min(99, Math.round((lastFailRun.actual_seconds / Math.max(lastFailRun.task_hours * 3600, 1)) * 100))
                  : undefined
                // 取成功 run 的得分（取最后一条成功记录）
                const successRun = [...runs]
                  .filter(r => r.task_id === t.id && r.success)
                  .pop()
                const taskScore = successRun?.score
                return (
                  <TaskRow key={t.id} task={t}
                    readOnly={!isToday}
                    completePct={completePct}
                    score={taskScore}
                    onToggle={() => isToday && handleToggle(t.id, t.done)}
                    onDelete={() => handleDelete(t.id)}
                    onUpdate={u => handleUpdate(t.id, u)}
                    onStart={() => {
                      if (t.run_status === 'paused') {
                        // 取最后一条中断 run 的 actual_seconds 作为初始进度
                        const lastPausedRun = [...runs]
                          .filter(r => r.task_id === t.id && !r.success)
                          .pop()
                        setRunnerInitSecs(lastPausedRun ? lastPausedRun.actual_seconds : 0)
                      } else {
                        setRunnerInitSecs(0)
                      }
                      setRunningTask(t)
                    }}
                  />
                )
              })}
            </div>
          )}
        </div>

        {/* 星星墙 */}
        {totalScore !== null && <StarWall count={totalScore} />}

        {/* 快速添加（仅今天可用） */}
        {isToday && <QuickAdd onAdd={handleAdd} />}

      </div>

      {/* 任务运行器 */}
      {runningTask && (
        <TaskRunner
          task={runningTask}
          onClose={() => { setRunningTask(null); setRunnerInitSecs(0); reload(selectedDate) }}
          workMins={workRestCfg.work_mins}
          restMins={workRestCfg.rest_mins}
          multiplier={multiplier}
          initialWorkedSecs={runnerInitSecs}
        />
      )}

      {/* 常规任务：新增弹窗 */}
      {addRoutineModal && (
        <AddRoutineModal
          maxReached={routinesData.routines.filter(r => !r.completed).length >= routinesData.max_routines}
          onAdd={async (r) => {
            const created = await api.routines.create({ ...r, allow_makeup: r.allow_makeup })
            setRoutinesData(d => ({ ...d, routines: [...d.routines, created] }))
            setAddRoutineModal(false)
          }}
          onClose={() => setAddRoutineModal(false)}
        />
      )}

      {/* 常规任务：设置弹窗 */}
      {routineSettingsModal && (
        <RoutineSettingsModal
          data={routinesData}
          onSave={async (s) => {
            const saved = await api.routines.updateSettings(s)
            setRoutinesData(d => ({ ...d, ...saved }))
            setRoutineSettingsModal(false)
          }}
          onClose={() => setRoutineSettingsModal(false)}
        />
      )}

      {/* 学习分析抽屉 */}
      {analysisOpen && <TaskAnalysisDrawer onClose={() => setAnalysisOpen(false)} />}

      {/* 计时设置弹窗 */}
      {timerModal && (
        <WorkRestModal
          cfg={workRestCfg}
          onSave={async (c) => {
            const saved = await api.workRest.update(c)
            setWorkRestCfg(saved)
            setTimerModal(false)
          }}
          onClose={() => setTimerModal(false)}
        />
      )}

      {/* 常规任务：归档历史抽屉 */}
      {archivedDrawer && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-foreground/15 backdrop-blur-sm" onClick={() => setArchivedDrawer(false)} />
          <div className="relative z-10 w-full max-w-md mx-0 sm:mx-4 bg-card rounded-t-3xl sm:rounded-3xl border border-border shadow-2xl overflow-hidden max-h-[80vh] flex flex-col">
            <div className="h-1 bg-gradient-to-r from-violet-300 to-violet-500" />
            <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-widest">习惯历史</p>
                <h3 className="text-base font-semibold mt-0.5">常规任务记录</h3>
              </div>
              <button onClick={() => setArchivedDrawer(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="overflow-y-auto flex-1 p-4 space-y-3">
              {archivedList.length === 0 ? (
                <div className="py-10 text-center text-sm text-muted-foreground">还没有历史记录</div>
              ) : (
                [...archivedList].reverse().map(a => (
                  <div key={a.id} className={cn(
                    'rounded-2xl border p-4 space-y-2',
                    a.archive_reason === 'completed'
                      ? 'border-emerald-200 bg-emerald-50/40'
                      : 'border-rose-100 bg-rose-50/30'
                  )}>
                    <div className="flex items-start gap-2">
                      <span className="text-base mt-0.5">{a.archive_reason === 'completed' ? '🏆' : '💔'}</span>
                      <div className="flex-1 min-w-0">
                        <p className={cn(
                          'text-sm font-medium',
                          a.archive_reason === 'completed' ? 'text-emerald-700' : 'text-rose-700'
                        )}>{a.content}</p>
                        <div className="flex items-center gap-2 mt-0.5 text-[11px] text-muted-foreground">
                          <span className="flex items-center gap-0.5"><Clock className="h-3 w-3" />{a.hours}h</span>
                          <span className="flex gap-0.5">
                            {Array.from({ length: a.stars }).map((_, i) => (
                              <Star key={i} className="h-2.5 w-2.5 text-amber-400 fill-amber-400" />
                            ))}
                          </span>
                        </div>
                      </div>
                      <span className={cn(
                        'text-[10px] font-medium px-2 py-0.5 rounded-full shrink-0',
                        a.archive_reason === 'completed'
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-rose-100 text-rose-700'
                      )}>
                        {a.archive_reason === 'completed' ? '已达成' : '已失败'}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                      <span>完成 {a.total_done}/{a.target_days} 天</span>
                      <span>·</span>
                      <span>最长连续 {a.best_streak} 天</span>
                      <span>·</span>
                      <span>{a.archived_date} 归档</span>
                    </div>
                    {a.archive_reason === 'failed' && (
                      <button
                        onClick={async () => {
                          const activeCount = routinesData.routines.filter(r => !r.completed).length
                          if (activeCount >= routinesData.max_routines) {
                            alert(`当前已有 ${routinesData.max_routines} 个常规任务，请先删除一个再重启`)
                            return
                          }
                          const newR = await api.routines.restart(a.id).catch((e: Error) => {
                            alert(e.message || '重启失败')
                            return null
                          })
                          if (newR) {
                            setRoutinesData(d => ({ ...d, routines: [...d.routines, newR] }))
                            setArchivedList(l => l.filter(x => x.id !== a.id))
                          }
                        }}
                        className="w-full flex items-center justify-center gap-1.5 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-xs text-violet-700 font-medium hover:bg-violet-100 transition-colors"
                      >
                        <RotateCcw className="h-3 w-3" />
                        重新挑战此习惯
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* 赏金任务弹窗 */}
      {bountyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-foreground/15 backdrop-blur-sm" onClick={() => setBountyModal(false)} />
          <div className="relative z-10 w-full max-w-lg mx-4 bg-card rounded-3xl border border-border shadow-2xl overflow-hidden">
            <div className="h-1.5 bg-gradient-to-r from-amber-300 via-orange-300 to-yellow-300" />
            <div className="p-7 space-y-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-widest">今日赏金</p>
                  <h2 className="text-xl font-bold mt-1">⚔️ 新的赏金任务！</h2>
                  <p className="text-sm text-muted-foreground mt-0.5">完成可获得额外 Buff 奖励</p>
                </div>
                <button onClick={() => setBountyModal(false)} className="text-muted-foreground hover:text-foreground mt-1">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="space-y-3 max-h-[60vh] overflow-y-auto">
                {pendingBounties.map(b => (
                  <BountyCard key={b.id} bounty={b}
                    onAccept={() => handleBountyAccept(b.id)}
                    onExpire={() => handleBountyExpire(b.id)} />
                ))}
              </div>
              {pendingBounties.length > 0 && (
                <button onClick={() => setBountyModal(false)}
                  className="w-full h-10 text-sm text-muted-foreground hover:text-foreground transition-colors">
                  稍后再看
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
