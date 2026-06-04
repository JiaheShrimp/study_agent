import { useEffect, useState, useRef, useCallback } from 'react'
import { Check, Trash2, Plus, Settings, Star, Clock, Swords, X } from 'lucide-react'
import { api, type DailyTask, type DailyBounty } from '@/lib/api'
import { cn } from '@/lib/utils'

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

// ── 快速添加 ──────────────────────────────────────────────────
function QuickAdd({ onAdd }: { onAdd: (t: { content: string; hours: number; stars: number }) => Promise<void> }) {
  const [content, setContent] = useState('')
  const [hours, setHours]     = useState(1)
  const [stars, setStars]     = useState(3)
  const [adding, setAdding]   = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  async function submit() {
    const trimmed = content.trim()
    if (!trimmed || adding) return
    setAdding(true)
    try {
      await onAdd({ content: trimmed, hours, stars })
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
      <div className="flex items-center gap-4">
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
      </div>
    </div>
  )
}

// ── 单条任务行 ────────────────────────────────────────────────
function TaskRow({ task, onToggle, onDelete, onUpdate }: {
  task: DailyTask
  onToggle: () => void
  onDelete: () => void
  onUpdate: (t: { content: string; hours: number; stars: number }) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState({ content: task.content, hours: task.hours, stars: task.stars })

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
        <div className="flex items-center gap-3">
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
          <div className="ml-auto flex gap-2">
            <button onClick={save} className="text-xs text-primary font-medium">保存</button>
            <button onClick={() => setEditing(false)} className="text-xs text-muted-foreground">取消</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={cn('flex items-start gap-3 px-4 py-3.5 group transition-colors',
      task.done ? 'opacity-55' : 'hover:bg-secondary/30')}>
      <button
        onClick={onToggle}
        className={cn(
          'mt-0.5 h-5 w-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all',
          task.done ? 'bg-primary border-primary' : 'border-border hover:border-primary/60'
        )}
      >
        {task.done && <Check className="h-3 w-3 text-primary-foreground" />}
      </button>
      <button onClick={() => !task.done && setEditing(true)} className="flex-1 text-left min-w-0">
        <p className={cn('text-sm leading-relaxed', task.done && 'line-through text-muted-foreground')}>
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
        </div>
      </button>
      <button onClick={onDelete}
        className="opacity-0 group-hover:opacity-100 mt-0.5 text-muted-foreground hover:text-rose-500 transition-all shrink-0">
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

// ── 赏金任务卡片 ──────────────────────────────────────────────
function BountyCard({ bounty, onRespond }: {
  bounty: DailyBounty
  onRespond: (s: 'accepted' | 'skipped') => void
}) {
  return (
    <div className={cn('rounded-2xl border p-4 space-y-3',
      bounty.status === 'accepted' ? 'border-amber-200 bg-amber-50/60' :
      bounty.status === 'skipped'  ? 'border-border bg-secondary/30 opacity-50' :
      'border-amber-200/60 bg-amber-50/30')}>
      <div className="flex items-start gap-2">
        <Swords className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">{bounty.content}</p>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-[11px] text-muted-foreground flex items-center gap-0.5">
              <Clock className="h-3 w-3" />{bounty.hours}h
            </span>
            <span className="flex gap-0.5">
              {Array.from({ length: bounty.stars }).map((_, i) => (
                <Star key={i} className="h-2.5 w-2.5 text-amber-400 fill-amber-400" />
              ))}
            </span>
          </div>
          <p className="text-[11px] text-amber-700 mt-1.5 bg-amber-100 rounded-md px-2 py-0.5 inline-block">
            🎁 {bounty.buff}
          </p>
        </div>
      </div>
      {bounty.status === 'pending' && (
        <div className="flex gap-2">
          <button onClick={() => onRespond('accepted')}
            className="flex-1 h-8 rounded-xl bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors">
            接受
          </button>
          <button onClick={() => onRespond('skipped')}
            className="flex-1 h-8 rounded-xl border border-border text-xs text-muted-foreground hover:bg-secondary transition-colors">
            跳过
          </button>
        </div>
      )}
      {bounty.status === 'accepted' && (
        <p className="text-xs text-amber-700 font-medium">✓ 已接受</p>
      )}
    </div>
  )
}

// ── 主页面 ────────────────────────────────────────────────────
export function Tasks() {
  const [tasks, setTasks]       = useState<DailyTask[]>([])
  const [bounties, setBounties]  = useState<DailyBounty[]>([])
  const [loading, setLoading]   = useState(true)
  const [bountyModal, setBountyModal] = useState(false)

  const today = new Date().toISOString().slice(0, 10)

  const reload = useCallback(async () => {
    const [t, b] = await Promise.all([
      api.tasks.daily().catch(() => [] as DailyTask[]),
      api.tasks.dailyBounties().catch(() => [] as DailyBounty[]),
    ])
    setTasks(t)
    setBounties(b)
  }, [])

  useEffect(() => {
    ;(async () => {
      setLoading(true)
      await api.tasks.initDaily().catch(() => {})
      const generated = await api.tasks.generateBounties().catch(() => [] as DailyBounty[])
      // 有待处理的赏金任务则自动弹出
      if (generated.some(b => b.status === 'pending')) setBountyModal(true)
      await reload()
      setLoading(false)
    })()
  }, [])

  async function handleAdd(t: { content: string; hours: number; stars: number }) {
    await api.tasks.addDaily(t)
    reload()
  }
  async function handleToggle(id: string) { await api.tasks.toggleDone(id); reload() }
  async function handleDelete(id: string) { await api.tasks.deleteDaily(id); reload() }
  async function handleUpdate(id: string, t: { content: string; hours: number; stars: number }) {
    await api.tasks.updateDaily(id, t); reload()
  }
  async function handleBounty(id: string, status: 'accepted' | 'skipped') {
    await api.tasks.respondBounty(id, status)
    const updated = await api.tasks.dailyBounties().catch(() => bounties)
    setBounties(updated)
    if (!updated.some(b => b.status === 'pending')) setBountyModal(false)
  }

  const done    = tasks.filter(t => t.done).length
  const pending = bounties.filter(b => b.status === 'pending').length
  const accepted = bounties.filter(b => b.status === 'accepted')

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-5">

        {/* 页头 */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">每日任务</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              {today} · {done}/{tasks.length} 完成
            </p>
          </div>
          <div className="flex gap-2">
            {pending > 0 && (
              <button onClick={() => setBountyModal(true)}
                className="flex items-center gap-1.5 text-xs text-amber-700 border border-amber-200 bg-amber-50 rounded-lg px-3 py-1.5 hover:bg-amber-100 transition-colors">
                <Swords className="h-3.5 w-3.5" /> 赏金 {pending}
              </button>
            )}
            <a href="/tasks/manage"
              className="flex items-center gap-1.5 text-xs text-muted-foreground border border-border rounded-lg px-3 py-1.5 hover:bg-secondary transition-colors">
              <Settings className="h-3.5 w-3.5" /> 管理
            </a>
          </div>
        </div>

        {/* 已接受的赏金任务 */}
        {accepted.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">赏金任务</p>
            {accepted.map(b => (
              <BountyCard key={b.id} bounty={b} onRespond={s => handleBounty(b.id, s)} />
            ))}
          </div>
        )}

        {/* 任务列表 */}
        <div className="bg-card rounded-2xl border border-border overflow-hidden">
          {loading ? (
            <p className="text-sm text-muted-foreground text-center py-10">加载中…</p>
          ) : tasks.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-10">还没有任务，在下方添加</p>
          ) : (
            <div className="divide-y divide-border">
              {tasks.map(t => (
                <TaskRow key={t.id} task={t}
                  onToggle={() => handleToggle(t.id)}
                  onDelete={() => handleDelete(t.id)}
                  onUpdate={u => handleUpdate(t.id, u)}
                />
              ))}
            </div>
          )}
        </div>

        {/* 快速添加 */}
        <QuickAdd onAdd={handleAdd} />

      </div>

      {/* 赏金任务弹窗 */}
      {bountyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-foreground/15 backdrop-blur-sm" onClick={() => setBountyModal(false)} />
          <div className="relative z-10 w-full max-w-sm mx-4 bg-card rounded-3xl border border-border shadow-2xl overflow-hidden">
            <div className="h-1 bg-gradient-to-r from-amber-300 via-orange-300 to-yellow-300" />
            <div className="p-6 space-y-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-widest">今日赏金</p>
                  <h2 className="text-lg font-bold mt-0.5">新的赏金任务！</h2>
                  <p className="text-xs text-muted-foreground">完成可获得额外奖励</p>
                </div>
                <button onClick={() => setBountyModal(false)} className="text-muted-foreground hover:text-foreground mt-1">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="space-y-3 max-h-72 overflow-y-auto">
                {bounties.filter(b => b.status === 'pending').map(b => (
                  <BountyCard key={b.id} bounty={b} onRespond={s => handleBounty(b.id, s)} />
                ))}
              </div>
              {pending > 0 && (
                <button onClick={() => setBountyModal(false)}
                  className="w-full h-9 text-xs text-muted-foreground hover:text-foreground transition-colors">
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
