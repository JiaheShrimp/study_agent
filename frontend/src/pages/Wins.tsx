import { useEffect, useState, useCallback, useRef } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { ChevronLeft, ChevronRight, BarChart2, X, Trash2, Plus } from 'lucide-react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { api, type Win, type WinStats } from '@/lib/api'
import { cn } from '@/lib/utils'

// ── 常量 ─────────────────────────────────────────────────────

const LEVELS: { value: Win['win_level']; label: string; short: string; cls: string }[] = [
  { value: 'small',  label: '小赢',   short: '★',   cls: 'win-small'  },
  { value: 'medium', label: '中赢',   short: '★★',  cls: 'win-medium' },
  { value: 'big',    label: '特大赢', short: '★★★', cls: 'win-big'    },
]
const LEVEL_MAP = Object.fromEntries(LEVELS.map(l => [l.value, l])) as Record<Win['win_level'], typeof LEVELS[0]>

function fmt(d: Date) { return d.toISOString().slice(0, 10) }
function daysInMonth(y: number, m: number) { return new Date(y, m + 1, 0).getDate() }
function firstWeekday(y: number, m: number) { return new Date(y, m, 1).getDay() }

// ── 主页面 ───────────────────────────────────────────────────

export function Wins() {
  const today = fmt(new Date())
  const [viewDate, setViewDate]   = useState(new Date())
  const [selected, setSelected]   = useState(today)
  const [byDate, setByDate]       = useState<Record<string, Win[]>>({})
  const [analysisOpen, setAnalysisOpen] = useState(false)

  const year  = viewDate.getFullYear()
  const month = viewDate.getMonth()
  const days  = daysInMonth(year, month)
  const pad   = firstWeekday(year, month)

  const reload = useCallback(() => {
    api.wins.byDate().then(setByDate).catch(() => {})
  }, [])

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
          <button
            onClick={() => setAnalysisOpen(true)}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground border border-border rounded-lg px-3 py-1.5 transition-colors hover:bg-secondary"
          >
            <BarChart2 className="h-3.5 w-3.5" />
            分析
          </button>
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
              const hasBig = wins.some(w => w.win_level === 'big')

              return (
                <button
                  key={key}
                  onClick={() => setSelected(key)}
                  className={cn(
                    'relative flex flex-col items-center justify-center rounded-xl py-2 min-h-[52px] text-xs font-medium transition-all',
                    isSelected
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'hover:bg-secondary text-foreground',
                    isToday && !isSelected ? 'ring-1 ring-primary/40' : ''
                  )}
                >
                  <span>{d}</span>
                  {stars > 0 && (
                    <span className={cn(
                      'text-[9px] mt-0.5 leading-none font-normal',
                      isSelected ? 'text-primary-foreground/80' : hasBig ? 'text-rose-500' : 'text-amber-500'
                    )}>
                      {'●'.repeat(Math.min(stars, 3))}{stars > 3 ? '+' : ''}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>

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
        <QuickAdd onAdded={reload} />

      </div>

      {/* 分析抽屉 */}
      {analysisOpen && <AnalysisDrawer onClose={() => setAnalysisOpen(false)} />}
    </div>
  )
}

// ── 快速添加 ─────────────────────────────────────────────────
// 交互：输入内容 → 选级别（点击三个按钮之一）→ 回车/点击保存 → 自动清空，光标留在输入框继续下一条

function QuickAdd({ onAdded }: { onAdded: () => void }) {
  const [content, setContent] = useState('')
  const [level, setLevel]     = useState<Win['win_level']>('small')
  const [saving, setSaving]   = useState(false)
  const [flash, setFlash]     = useState<string | null>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  async function save() {
    const trimmed = content.trim()
    if (!trimmed || saving) return
    setSaving(true)
    try {
      await api.wins.create(trimmed, level)
      setContent('')
      setFlash(LEVEL_MAP[level].label)
      setTimeout(() => setFlash(null), 1500)
      onAdded()
      inputRef.current?.focus()
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
        <span className="text-sm font-medium">记录今天的赢</span>
        {flash && (
          <span className="text-xs text-muted-foreground animate-pulse">
            ✓ 已记录{flash}
          </span>
        )}
      </div>

      {/* 星级选择 — 横排三个 chip */}
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

      {/* 输入框 */}
      <div className="relative">
        <textarea
          ref={inputRef}
          rows={2}
          value={content}
          onChange={e => setContent(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="今天赢在哪？ — 写完按 Enter 即保存，Shift+Enter 换行"
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
                {LEVELS.slice().reverse().map(l => {
                  const count = stats.by_level[l.value]
                  const pct = stats.total ? Math.round((count / stats.total) * 100) : 0
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
