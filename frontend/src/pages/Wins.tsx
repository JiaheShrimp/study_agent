import { useEffect, useState, useCallback, useRef } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { ChevronLeft, ChevronRight, BarChart2, X, Trash2, Plus, Bell, BellOff, Flame, Trophy, PartyPopper } from 'lucide-react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { api, type Win, type WinStats, type ReminderConfig, type Winnable, type ArchivedWinnable } from '@/lib/api'
import { cn, gameToday } from '@/lib/utils'
import { playWinRecord, playClick } from '@/lib/sounds'

// ── 常量 ─────────────────────────────────────────────────────

const LEVELS: { value: Win['win_level']; label: string; short: string; cls: string }[] = [
  { value: 'small',  label: '小赢',   short: '★',   cls: 'win-small'  },
  { value: 'medium', label: '中赢',   short: '★★',  cls: 'win-medium' },
  { value: 'big',    label: '特大赢', short: '★★★', cls: 'win-big'    },
  { value: 'future', label: '未来可赢', short: '◇', cls: 'win-future' },
]
const LEVEL_MAP = Object.fromEntries(LEVELS.map(l => [l.value, l])) as Record<Win['win_level'], typeof LEVELS[0]>

function fmt(d: Date) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
function daysInMonth(y: number, m: number) { return new Date(y, m + 1, 0).getDate() }
function firstWeekday(y: number, m: number) { return new Date(y, m, 1).getDay() }

// ── 主页面 ───────────────────────────────────────────────────

export function Wins() {
  const today = gameToday()
  const [viewDate, setViewDate]   = useState(new Date())
  const [selected, setSelected]   = useState(today)
  const [byDate, setByDate]       = useState<Record<string, Win[]>>({})
  const [analysisOpen, setAnalysisOpen]   = useState(false)
  const [reminderOpen, setReminderOpen]   = useState(false)

  const year  = viewDate.getFullYear()
  const month = viewDate.getMonth()
  const days  = daysInMonth(year, month)
  const pad   = firstWeekday(year, month)

  const [winnableTick, setWinnableTick] = useState(0)

  const reload = useCallback(() => {
    api.wins.byDate().then(setByDate).catch(() => {})
  }, [])

  // 让可赢目标卡片重新拉取（QuickAdd 记一条未来可赢后调用）
  const reloadWinnables = useCallback(() => setWinnableTick(t => t + 1), [])

  useEffect(() => { reload() }, [reload])

  const dayWins = byDate[selected] ?? []

  async function handleDelete(id: string) {
    await api.wins.delete(id)
    reload()
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-5">

        {/* 页头 */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">赢麻了</h1>
            <p className="text-xs text-muted-foreground mt-0.5">记录每一个值得庆祝的进步</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => { playClick(); setReminderOpen(true) }}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground border border-border rounded-lg px-3 py-1.5 transition-colors hover:bg-secondary"
            >
              <Bell className="h-3.5 w-3.5" />
              提醒
            </button>
            <button
              onClick={() => { playClick(); setAnalysisOpen(true) }}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground border border-border rounded-lg px-3 py-1.5 transition-colors hover:bg-secondary"
            >
              <BarChart2 className="h-3.5 w-3.5" />
              分析
            </button>
          </div>
        </div>

        {/* 日历卡片 */}
        <div className="bg-card rounded-2xl border border-border shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
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
                className="h-7 w-7 flex items-center justify-center rounded-lg hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* 星期标题 */}
          <div className="grid grid-cols-7 mb-1">
            {['日','一','二','三','四','五','六'].map(d => (
              <div key={d} className="text-center text-[11px] text-muted-foreground py-1">{d}</div>
            ))}
          </div>

          {/* 日期格子 */}
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: pad }).map((_, i) => <div key={`p${i}`} />)}
            {Array.from({ length: days }).map((_, i) => {
              const d   = i + 1
              const key = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`
              const wins = byDate[key] ?? []
              const stars = wins.reduce((s, w) => s + w.stars, 0)
              const isToday    = key === today
              const isSelected = key === selected
              const hasBig    = wins.some(w => w.win_level === 'big')
              const hasFuture = wins.some(w => w.win_level === 'future')
              const hasAny    = stars > 0 || hasFuture

              return (
                <button
                  key={key}
                  onClick={() => setSelected(key)}
                  className={cn(
                    'relative flex flex-col items-center justify-center rounded-2xl py-2 min-h-[56px] text-xs font-medium transition-all',
                    isSelected
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : hasAny
                        ? 'bg-secondary text-foreground'
                        : 'text-foreground/70 hover:bg-secondary/60',
                    isToday && !isSelected ? 'ring-1 ring-primary/50' : ''
                  )}
                >
                  <span>{d}</span>
                  {stars > 0 && (
                    <span className={cn(
                      'text-[9px] mt-0.5 leading-none font-normal flex items-center gap-0.5',
                      isSelected ? 'text-primary-foreground/80' : hasBig ? 'text-rose-500' : 'text-amber-500'
                    )}>
                      ★ {stars}
                    </span>
                  )}
                  {stars === 0 && hasFuture && (
                    <span className={cn(
                      'text-[9px] mt-0.5 leading-none font-normal',
                      isSelected ? 'text-primary-foreground/80' : 'text-indigo-400'
                    )}>
                      ◇
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {/* 可赢目标 */}
        <WinnableSection onWin={reload} refreshTick={winnableTick} />

        {/* 当日记录卡片 */}
        <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 pt-5 pb-3">
            <div>
              <span className="text-sm font-medium">
                {selected === today ? '今天' : selected}
              </span>
              {dayWins.length > 0 && (
                <span className="ml-2 text-xs text-muted-foreground">
                  {dayWins.reduce((s, w) => s + w.stars, 0)} 星
                </span>
              )}
            </div>
          </div>

          {dayWins.length === 0 ? (
            <div className="px-5 pb-5 text-sm text-muted-foreground">
              {selected === today ? '今天还没有记录，加油！' : '这天没有记录'}
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {dayWins.map(w => (
                <li key={w.id} className="flex items-start gap-3 px-5 py-3.5 group">
                  <span className={cn('text-[11px] px-2 py-0.5 rounded-md font-medium shrink-0 mt-0.5 tabular-nums', LEVEL_MAP[w.win_level].cls)}>
                    {LEVEL_MAP[w.win_level].short} {LEVEL_MAP[w.win_level].label}
                  </span>
                  <span className="text-sm flex-1 leading-relaxed">{w.content}</span>
                  <button
                    onClick={() => handleDelete(w.id)}
                    className="opacity-0 group-hover:opacity-100 shrink-0 mt-0.5 text-muted-foreground hover:text-rose-500 transition-all"
                    title="删除"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* 快速添加区 */}
        <QuickAdd onAdded={reload} onWinnableAdded={reloadWinnables} />

      </div>

      {/* 分析抽屉 */}
      {analysisOpen && <AnalysisDrawer onClose={() => setAnalysisOpen(false)} />}

      {/* 提醒设置抽屉 */}
      {reminderOpen && <ReminderDrawer onClose={() => setReminderOpen(false)} />}
    </div>
  )
}

// ── 可赢目标 ─────────────────────────────────────────────────
// 挂在页面上的「未来可赢」。点「赢一次」→ 累计天数/次数 + 复制进当日赢记录；
// 点「赢太多了」→ 归档进历史。靛蓝（indigo）主题，与未来可赢一致。

function WinnableSection({ onWin, refreshTick }: { onWin: () => void; refreshTick: number }) {
  const [items, setItems]   = useState<Winnable[]>([])
  const [busyId, setBusyId]   = useState<string | null>(null)
  const [historyOpen, setHistoryOpen] = useState(false)

  const reload = useCallback(() => {
    api.wins.winnables().then(setItems).catch(() => {})
  }, [])

  useEffect(() => { reload() }, [reload])
  // 下面输入框记一条未来可赢后，refreshTick 变化 → 重新拉取列表
  useEffect(() => { if (refreshTick > 0) reload() }, [refreshTick, reload])

  async function win(w: Winnable) {
    if (busyId) return
    setBusyId(w.id)
    try {
      await api.wins.winWinnable(w.id)
      playWinRecord(w.win_level)
      // 通知搭子聊天栏：又赢了一次，尽快刷新拉取搭子反馈
      window.dispatchEvent(new CustomEvent('agent:dialogue-refresh'))
      reload()
      onWin()   // 当日赢记录里多了一条，刷新日历/今日列表
    } finally {
      setBusyId(null)
    }
  }

  async function archive(id: string) {
    if (busyId) return
    setBusyId(id)
    try {
      await api.wins.archiveWinnable(id)
      playClick()
      reload()
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="bg-card rounded-2xl border border-border shadow-sm p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <span className="text-sm font-medium flex items-center gap-1.5">
            <span className="text-indigo-400">◇</span> 可赢目标
          </span>
          <p className="text-[11px] text-muted-foreground/70 mt-0.5">每天点「赢一次」积累连续与次数，赢的内容会进当日记录</p>
        </div>
        <button
          onClick={() => { playClick(); setHistoryOpen(true) }}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          历史
        </button>
      </div>

      {/* 列表 */}
      {items.length > 0 && (
        <ul className="space-y-2">
          {items.map(w => (
            <li
              key={w.id}
              className="flex items-center gap-3 rounded-xl border border-indigo-200/60 bg-indigo-50/40 px-3.5 py-2.5"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={cn('text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0', LEVEL_MAP[w.win_level].cls)}>
                    {LEVEL_MAP[w.win_level].short}
                  </span>
                  <p className="text-sm leading-snug truncate">{w.content}</p>
                </div>
                <div className="flex items-center gap-3 mt-1 text-[11px] text-muted-foreground">
                  <span className={cn('flex items-center gap-0.5', w.streak > 0 && 'text-orange-500')}>
                    <Flame className="h-3 w-3" /> 连续 {w.streak} 天
                  </span>
                  <span className="flex items-center gap-0.5">
                    <Trophy className="h-3 w-3" /> 累计赢 {w.total_wins} 次
                  </span>
                </div>
              </div>
              <button
                onClick={() => win(w)}
                disabled={!!busyId}
                className={cn(
                  'shrink-0 text-xs font-medium rounded-lg px-3 py-1.5 transition-all',
                  w.won_today
                    ? 'bg-indigo-100 text-indigo-600 hover:bg-indigo-200'
                    : 'bg-indigo-500 text-white hover:bg-indigo-600 shadow-sm',
                  busyId && 'opacity-50 cursor-not-allowed'
                )}
                title={w.won_today ? '今天已赢，再点也会累计次数' : '赢一次'}
              >
                {w.won_today ? '✓ 今天赢过' : '赢一次'}
              </button>
              <button
                onClick={() => archive(w.id)}
                disabled={!!busyId}
                className="shrink-0 flex items-center gap-1 text-[11px] text-muted-foreground hover:text-indigo-600 transition-colors disabled:opacity-50"
                title="赢太多了，归档进历史"
              >
                <PartyPopper className="h-3.5 w-3.5" />
                赢太多了
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* 空状态：引导去下面的输入框记一条未来可赢 */}
      {items.length === 0 && (
        <p className="text-xs text-muted-foreground/70 rounded-xl border border-dashed border-border/80 px-4 py-3 text-center">
          在下面「记录未来可赢」里写一条，就会挂到这里 ↓
        </p>
      )}

      {historyOpen && <WinnableHistory onClose={() => setHistoryOpen(false)} />}
    </div>
  )
}

function WinnableHistory({ onClose }: { onClose: () => void }) {
  const [items, setItems] = useState<ArchivedWinnable[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.wins.archivedWinnables().then(setItems).finally(() => setLoading(false))
  }, [])

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-foreground/10 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative z-10 w-full max-w-xs bg-card border-l border-border shadow-2xl flex flex-col h-full overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <span className="text-sm font-semibold">赢太多了 · 历史</span>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-3">
          {loading ? (
            <p className="text-xs text-muted-foreground text-center py-8">加载中…</p>
          ) : items.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-8">还没有归档的可赢目标</p>
          ) : (
            items.map(w => (
              <div key={w.id} className="rounded-xl border border-border bg-secondary/40 px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className={cn('text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0', LEVEL_MAP[w.win_level].cls)}>
                    {LEVEL_MAP[w.win_level].short}
                  </span>
                  <p className="text-sm leading-snug">{w.content}</p>
                </div>
                <div className="flex items-center gap-3 mt-1.5 text-[11px] text-muted-foreground">
                  <span className="flex items-center gap-0.5"><Trophy className="h-3 w-3" /> 累计赢 {w.total_wins} 次</span>
                  <span className="flex items-center gap-0.5"><Flame className="h-3 w-3" /> 最长连续 {w.best_streak} 天</span>
                </div>
                <p className="text-[10px] text-muted-foreground/60 mt-1">{w.archived_date} 归档</p>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

// ── 快速添加 ─────────────────────────────────────────────────
// 交互：输入内容 → 选级别（点击三个按钮之一）→ 回车/点击保存 → 自动清空，光标留在输入框继续下一条
// 特例：选「未来可赢」时不直接写当日记录，而是挂成一个「可赢目标」（上方卡片）。
//      之后每点一次「赢一次」才把内容写进当日赢记录。

function QuickAdd({ onAdded, onWinnableAdded }: { onAdded: () => void; onWinnableAdded: () => void }) {
  const [content, setContent] = useState('')
  const [level, setLevel]     = useState<Win['win_level']>('small')
  // 选「未来可赢」时，挂成可赢目标用的星级（之后每次「赢一次」按此等级记当日记录）
  const [winnableLevel, setWinnableLevel] = useState<'small' | 'medium' | 'big'>('small')
  const [saving, setSaving]   = useState(false)
  const [flash, setFlash]     = useState<string | null>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  async function save() {
    const trimmed = content.trim()
    if (!trimmed || saving) return
    setSaving(true)
    try {
      if (level === 'future') {
        // 未来可赢 → 挂成可赢目标（带星级），不直接写当日记录
        await api.wins.createWinnable(trimmed, winnableLevel)
        playWinRecord(winnableLevel)
        setContent('')
        setFlash(`已挂上可赢目标（${LEVEL_MAP[winnableLevel].label}）`)
        setTimeout(() => setFlash(null), 1500)
        onWinnableAdded()
        inputRef.current?.focus()
      } else {
        await api.wins.create(trimmed, level)
        playWinRecord(level)
        // 通知搭子聊天栏：记了一条赢，尽快刷新拉取搭子反馈
        window.dispatchEvent(new CustomEvent('agent:dialogue-refresh'))
        setContent('')
        setFlash(`已记录${LEVEL_MAP[level].label}`)
        setTimeout(() => setFlash(null), 1500)
        onAdded()
        inputRef.current?.focus()
      }
    } finally {
      setSaving(false)
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Enter 保存（Shift+Enter 换行）
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      save()
    }
  }

  return (
    <div className="bg-card rounded-2xl border border-border shadow-sm p-5 space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{level === 'future' ? '记录未来可赢' : '记录今天的赢'}</span>
        {flash && (
          <span className="text-xs text-muted-foreground animate-pulse">
            ✓ {flash}
          </span>
        )}
      </div>

      {/* 星级选择 — 横排四个 chip */}
      <div className="flex gap-2">
        {LEVELS.map(l => (
          <button
            key={l.value}
            onClick={() => setLevel(l.value)}
            className={cn(
              'flex-1 text-xs py-1.5 rounded-lg border font-medium transition-all',
              level === l.value
                ? cn(l.cls, 'shadow-sm scale-[1.02]')
                : 'border-border text-muted-foreground hover:bg-secondary'
            )}
          >
            {l.short} {l.label}
          </button>
        ))}
      </div>

      {/* 未来可赢：选「赢一次」时计入当日记录的星级 */}
      {level === 'future' && (
        <div className="flex items-center gap-2 rounded-xl bg-indigo-50/40 border border-indigo-200/60 px-3 py-2">
          <span className="text-[11px] text-muted-foreground shrink-0">赢一次算</span>
          {LEVELS.filter(l => l.value !== 'future').map(l => (
            <button
              key={l.value}
              onClick={() => setWinnableLevel(l.value as 'small' | 'medium' | 'big')}
              className={cn(
                'flex-1 text-xs py-1 rounded-lg border font-medium transition-all',
                winnableLevel === l.value
                  ? cn(l.cls, 'shadow-sm scale-[1.02]')
                  : 'border-border text-muted-foreground hover:bg-secondary'
              )}
            >
              {l.short} {l.label}
            </button>
          ))}
        </div>
      )}

      {/* 输入框 */}
      <div className="relative">
        <textarea
          ref={inputRef}
          rows={2}
          value={content}
          onChange={e => setContent(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={level === 'future' ? '今天没做好，但以后可以做到什么？' : '今天赢在哪？ — 写完按 Enter 即保存，Shift+Enter 换行'}
          className="w-full resize-none rounded-xl border border-input bg-background px-4 py-3 text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-ring/40 transition-shadow leading-relaxed"
          autoFocus
        />
        <button
          onClick={save}
          disabled={!content.trim() || saving}
          className={cn(
            'absolute right-3 bottom-3 h-7 w-7 flex items-center justify-center rounded-lg transition-all',
            content.trim()
              ? 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm'
              : 'bg-secondary text-muted-foreground cursor-not-allowed'
          )}
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>

      <p className="text-[11px] text-muted-foreground/70">
        Enter 保存并继续 · Shift+Enter 换行 · 可连续添加多条
      </p>
    </div>
  )
}

// ── 分析抽屉 ─────────────────────────────────────────────────

type Range = '7' | '30' | '90'

function AnalysisDrawer({ onClose }: { onClose: () => void }) {
  const [range, setRange]   = useState<Range>('7')
  const [stats, setStats]   = useState<WinStats | null>(null)
  const [loading, setLoading] = useState(false)

  const load = useCallback((r: Range) => {
    setLoading(true)
    const start = fmt(new Date(Date.now() - Number(r) * 86400000))
    api.wins.stats(start).then(setStats).finally(() => setLoading(false))
  }, [])

  useEffect(() => { load(range) }, [range, load])

  const chartData = stats
    ? Object.entries(stats.by_day).sort(([a],[b]) => a.localeCompare(b)).map(([date, stars]) => ({ date: date.slice(5), stars }))
    : []

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-foreground/10 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative z-10 w-full max-w-xs bg-card border-l border-border shadow-2xl flex flex-col h-full overflow-y-auto">

        {/* 头部 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <span className="text-sm font-semibold">分析</span>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-6">
          {/* 时间范围 */}
          <Select value={range} onValueChange={v => setRange(v as Range)}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">最近 7 天</SelectItem>
              <SelectItem value="30">最近 30 天</SelectItem>
              <SelectItem value="90">最近 90 天</SelectItem>
            </SelectContent>
          </Select>

          {loading ? (
            <p className="text-xs text-muted-foreground text-center py-8">加载中…</p>
          ) : stats ? (
            <>
              {/* 汇总 */}
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: '总记录', value: `${stats.total} 条` },
                  { label: '总星数', value: `${stats.total_stars} 星` },
                ].map(({ label, value }) => (
                  <div key={label} className="rounded-xl bg-secondary/60 px-4 py-3">
                    <p className="text-[11px] text-muted-foreground">{label}</p>
                    <p className="text-lg font-semibold mt-0.5 tracking-tight">{value}</p>
                  </div>
                ))}
              </div>

              {/* 等级分布 */}
              <div className="space-y-2.5">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">等级分布</p>
                {LEVELS.filter(l => l.value !== 'future').slice().reverse().map(l => {
                  const count = stats.by_level[l.value] ?? 0
                  const winTotal = stats.total - (stats.by_level.future ?? 0)
                  const pct = winTotal ? Math.round((count / winTotal) * 100) : 0
                  return (
                    <div key={l.value} className="flex items-center gap-2.5">
                      <span className={cn('text-[10px] px-1.5 py-0.5 rounded font-medium w-16 text-center shrink-0', l.cls)}>
                        {l.short} {l.label}
                      </span>
                      <div className="flex-1 bg-secondary rounded-full h-1.5">
                        <div className="bg-primary/70 h-1.5 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-xs text-muted-foreground w-5 text-right tabular-nums">{count}</span>
                    </div>
                  )
                })}
                {(stats.by_level.future ?? 0) > 0 && (
                  <div className="flex items-center gap-2.5 pt-1 border-t border-border/60">
                    <span className={cn('text-[10px] px-1.5 py-0.5 rounded font-medium w-16 text-center shrink-0', 'win-future')}>
                      ◇ 未来可赢
                    </span>
                    <div className="flex-1" />
                    <span className="text-xs text-muted-foreground w-5 text-right tabular-nums">{stats.by_level.future}</span>
                  </div>
                )}
              </div>

              {/* 柱状图 */}
              {chartData.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">每日星数</p>
                  <ResponsiveContainer width="100%" height={120}>
                    <BarChart data={chartData} barSize={10}>
                      <XAxis dataKey="date" tick={{ fontSize: 9 }} tickLine={false} axisLine={false} />
                      <YAxis hide />
                      <Tooltip
                        contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid hsl(var(--border))', background: 'hsl(var(--card))' }}
                        formatter={(v) => [`${v} 星`, '']}
                        cursor={{ fill: 'hsl(var(--secondary))' }}
                      />
                      <Bar dataKey="stars" fill="hsl(var(--primary))" radius={[3,3,0,0]} opacity={0.8} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* AI 占位 */}
              <div className="rounded-xl border border-dashed border-border/80 p-4 text-center space-y-1">
                <p className="text-xs text-muted-foreground">AI 趋势分析即将上线</p>
                <p className="text-[11px] text-muted-foreground/60">积累更多记录后，AI 会帮你发现规律</p>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  )
}

// ── 提醒设置抽屉 ──────────────────────────────────────────────

function ReminderDrawer({ onClose }: { onClose: () => void }) {
  const [cfg, setCfg]     = useState<ReminderConfig>({ reminder_enabled: false, reminder_times: ['21:00'] })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)
  const [saved, setSaved]     = useState(false)

  useEffect(() => {
    api.reminder.get().then(setCfg).finally(() => setLoading(false))
  }, [])

  async function handleSave() {
    setSaving(true)
    try {
      await api.reminder.update(cfg)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } finally {
      setSaving(false)
    }
  }

  function addTime() {
    setCfg(c => ({ ...c, reminder_times: [...c.reminder_times, '20:00'] }))
  }

  function removeTime(i: number) {
    setCfg(c => ({ ...c, reminder_times: c.reminder_times.filter((_, idx) => idx !== i) }))
  }

  function updateTime(i: number, val: string) {
    setCfg(c => {
      const times = [...c.reminder_times]
      times[i] = val
      return { ...c, reminder_times: times }
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-foreground/10 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative z-10 w-full max-w-xs bg-card border-l border-border shadow-2xl flex flex-col h-full">

        {/* 头部 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <span className="text-sm font-semibold">提醒设置</span>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-6 flex-1 overflow-y-auto">
          {loading ? (
            <p className="text-xs text-muted-foreground text-center py-8">加载中…</p>
          ) : (
            <>
              {/* 开关 */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">每日提醒</p>
                  <p className="text-xs text-muted-foreground mt-0.5">到点弹窗提醒你记录今天的赢</p>
                </div>
                <button
                  onClick={() => setCfg(c => ({ ...c, reminder_enabled: !c.reminder_enabled }))}
                  className={cn(
                    'relative w-10 h-5.5 rounded-full transition-colors',
                    cfg.reminder_enabled ? 'bg-primary' : 'bg-secondary border border-border'
                  )}
                  style={{ height: '22px' }}
                >
                  <span className={cn(
                    'absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform',
                    cfg.reminder_enabled ? 'translate-x-5' : 'translate-x-0.5'
                  )} />
                </button>
              </div>

              {/* 时间列表 */}
              {cfg.reminder_enabled && (
                <div className="space-y-3">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">提醒时间</p>
                  {cfg.reminder_times.map((t, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <input
                        type="time"
                        value={t}
                        onChange={e => updateTime(i, e.target.value)}
                        className="flex-1 h-9 rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring/40"
                      />
                      {cfg.reminder_times.length > 1 && (
                        <button
                          onClick={() => removeTime(i)}
                          className="text-muted-foreground hover:text-rose-500 transition-colors"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  ))}
                  {cfg.reminder_times.length < 4 && (
                    <button
                      onClick={addTime}
                      className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      添加时间
                    </button>
                  )}
                </div>
              )}

              {!cfg.reminder_enabled && (
                <div className="rounded-xl bg-secondary/60 p-4 flex items-center gap-3">
                  <BellOff className="h-5 w-5 text-muted-foreground shrink-0" />
                  <p className="text-xs text-muted-foreground">提醒已关闭，开启后将在设定时间弹出通知</p>
                </div>
              )}
            </>
          )}
        </div>

        {/* 底部保存 */}
        <div className="p-5 border-t border-border">
          <button
            onClick={handleSave}
            disabled={saving || loading}
            className={cn(
              'w-full h-9 rounded-lg text-sm font-medium transition-colors',
              saved
                ? 'bg-green-100 text-green-700'
                : 'bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50'
            )}
          >
            {saved ? '✓ 已保存' : saving ? '保存中…' : '保存设置'}
          </button>
        </div>
      </div>
    </div>
  )
}
