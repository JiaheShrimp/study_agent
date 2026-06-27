import { useEffect, useState } from 'react'
import { BookOpen, EyeOff, Settings2, X, TrendingUp, Flame, AlertTriangle, Trophy } from 'lucide-react'
import { api, type DailyStats, type GoalResult, type GoalSettings, type BestRecords } from '@/lib/api'
import { cn, gameToday } from '@/lib/utils'

function fmtH(secs: number) {
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

// 把 YYYY-MM-DD 格式成「6月4日」
function fmtMD(d: string): string {
  if (!d) return ''
  const dt = new Date(d + 'T00:00:00')
  return `${dt.getMonth() + 1} 月 ${dt.getDate()} 日`
}

function ProgressBar({ pct, overPct, hit, thin = false }: {
  pct: number; overPct: number; hit: boolean; thin?: boolean
}) {
  const h = thin ? 'h-1.5' : 'h-2'
  // 超额时：满格绿 + 右侧继续延伸一段浅绿（用 flex 布局，父不 overflow-hidden）
  if (overPct > 0) {
    // 超额段占总宽比例：把 100% 目标看作总宽的 70%，剩余 30% 留给超额显示
    const overDisplay = Math.min(overPct / 100 * 30, 30) // 最多占 30% 宽度
    const baseWidth = 70
    return (
      <div className={cn(h, 'flex items-center gap-0.5')}>
        <div className="rounded-l-full bg-emerald-400 h-full flex-none" style={{ width: `${baseWidth}%` }} />
        <div className="rounded-r-full bg-emerald-200 h-full flex-none" style={{ width: `${overDisplay}%` }} />
        <div className="flex-1 rounded-full bg-secondary h-full" />
      </div>
    )
  }
  return (
    <div className={cn(h, 'rounded-full bg-secondary overflow-hidden')}>
      <div className={cn('h-full rounded-full transition-all', hit ? 'bg-emerald-400' : 'bg-primary/70')}
        style={{ width: `${pct}%` }} />
    </div>
  )
}

// ── 目标参数设置弹窗 ─────────────────────────────────────────
function GoalSettingsModal({
  goal,
  onClose,
}: {
  goal: GoalResult
  onSave?: (s: GoalSettings) => Promise<void>   // 已固定只读，保留以兼容调用处
  onClose: () => void
}) {
  // 目标与爬坡参数已固定为只读展示，不再可编辑（保留面板让用户知道数值）
  const goalMins    = Math.round(goal.goal_secs / 60)
  const stepMins    = goal.step_mins
  const failLimit   = goal.fail_limit
  const degradeMins = goal.degrade_mins
  const minGoal     = 15

  // 只读展示行：数值灰底、不可编辑
  const Row = ({ label, sub, value, unit }: {
    label: string; sub: string; value: number; unit: string
  }) => (
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="text-[11px] text-muted-foreground">{sub}</p>
      </div>
      <div className="flex items-center gap-1.5">
        <input type="number" value={value} readOnly disabled
          className="w-16 h-8 rounded-lg border border-input bg-secondary/60 px-2 text-sm text-center text-muted-foreground cursor-not-allowed focus:outline-none"
        />
        <span className="text-xs text-muted-foreground">{unit}</span>
      </div>
    </div>
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-foreground/15 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-80 bg-card rounded-3xl border border-border shadow-2xl overflow-hidden">
        <div className="h-1 bg-gradient-to-r from-primary/50 to-primary" />
        <div className="p-6 space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold">目标设置</h2>
              <p className="text-xs text-muted-foreground mt-0.5">当前目标与爬坡参数</p>
            </div>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="space-y-4">
            <Row label="当前目标" sub="今日起的目标时长"
              value={goalMins} unit="分钟" />
            <div className="h-px bg-border" />
            <Row label="每日递增" sub="达标后次日增加的分钟数"
              value={stepMins} unit="分钟" />
            <Row label="连续未达标降级" sub="连续几天未达标触发降级"
              value={failLimit} unit="天" />
            <Row label="降级幅度" sub="触发降级时减少的分钟数"
              value={degradeMins} unit="分钟" />
            <Row label="目标下限" sub="降级不会低于此值"
              value={minGoal} unit="分钟" />
          </div>

          <div className="rounded-xl bg-secondary/50 px-3 py-2 text-[11px] text-muted-foreground">
            达标 → 次日 +{stepMins}m · 连续 {failLimit} 天未达标 → -{degradeMins}m（最低 {minGoal}m）
          </div>

          <button onClick={onClose}
            className="w-full h-9 rounded-2xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors">
            知道了
          </button>
        </div>
      </div>
    </div>
  )
}

// ── 主组件 ────────────────────────────────────────────────────
interface Props {
  date?: string
  compact?: boolean
  onModeChange?: () => void
  refreshKey?: number
}

export function StudyGoalCard({ date, compact = false, refreshKey }: Props) {
  const todayStr = gameToday()
  const today    = date ?? todayStr
  const isToday  = today === todayStr

  const [stats, setStats]   = useState<DailyStats | null>(null)
  const [goal, setGoal]     = useState<GoalResult | null>(null)
  const [best, setBest]     = useState<BestRecords | null>(null)
  const [settingsModal, setSettingsModal] = useState(false)
  const [modeOpen, setModeOpen] = useState(false)

  function loadData() {
    api.study.dailyStats(today).then(setStats).catch(() => {})
    api.study.goal().then(setGoal).catch(() => {})  // 目标始终加载（今日爬坡状态）
    api.study.bestRecords().then(setBest).catch(() => {})  // 历史最佳专注
  }
  useEffect(() => { loadData() }, [today, refreshKey])

  if (!stats) return null

  const mode = stats.mode
  const effectiveSecs = mode === 'planned' ? stats.effective_secs_planned : stats.effective_secs_actual
  const goalSecs = goal?.goal_secs ?? 0
  const hit = goalSecs > 0 && effectiveSecs >= goalSecs
  const rawPct = goalSecs > 0 ? (effectiveSecs / goalSecs) * 100 : 0
  const pct = Math.min(100, rawPct)           // 进度条基础宽度（不超100%）
  const overPct = Math.max(0, rawPct - 100)   // 超额部分百分比

  async function switchMode(m: string) {
    await api.effectiveTimeMode.update(m)
    loadData()
    setModeOpen(false)
  }

  // ── 精简版（Dashboard）────────────────────────────────────
  if (compact) {
    return (
      <div className={cn(
        'rounded-2xl border px-5 py-4 flex items-center gap-4',
        stats.excluded ? 'border-border bg-secondary/30' : 'border-primary/20 bg-primary/5'
      )}>
        <div className="h-10 w-10 rounded-xl flex items-center justify-center bg-primary/10 shrink-0">
          <BookOpen className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0 space-y-1.5">
          <div className="flex items-center gap-2">
            <p className="text-xs text-muted-foreground font-medium">今日有效学习</p>
            {stats.excluded && (
              <span className="text-[10px] text-muted-foreground bg-secondary px-1.5 py-0.5 rounded-md flex items-center gap-1">
                <EyeOff className="h-2.5 w-2.5" />{stats.exclude_reason || '不计入'}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xl font-black tabular-nums text-primary">{fmtH(effectiveSecs)}</span>
            {goal && !stats.excluded && goalSecs > 0 && (
              <span className="text-xs text-muted-foreground">/ 目标 {fmtH(goalSecs)}</span>
            )}
          </div>
          {goal && !stats.excluded && goalSecs > 0 && (
            <ProgressBar pct={pct} overPct={overPct} hit={hit} />
          )}
        </div>
        <div className="shrink-0 text-right space-y-0.5">
          {goal && !stats.excluded && goalSecs > 0 && (
            hit
              ? <p className="text-xs font-medium text-emerald-600">✓ 达标</p>
              : <p className="text-xs text-muted-foreground whitespace-nowrap">还差 {fmtH(goalSecs - effectiveSecs)}</p>
          )}
          {goal && goal.consecutive_hits > 0 && (
            <p className="text-[10px] text-orange-500 flex items-center gap-0.5 justify-end">
              <Flame className="h-3 w-3" />{goal.consecutive_hits} 天
            </p>
          )}
        </div>
      </div>
    )
  }

  // ── 详细版（Tasks 页）─────────────────────────────────────
  return (
    <>
      <div className={cn(
        'rounded-2xl border p-5 space-y-4',
        stats.excluded ? 'border-border bg-secondary/20' : 'border-primary/20 bg-primary/5'
      )}>
        {/* 标题行 */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-primary shrink-0" />
            <span className="text-sm font-semibold">有效学习时间</span>
            <button
              onClick={() => setModeOpen(v => !v)}
              className="text-[10px] text-muted-foreground bg-secondary hover:bg-secondary/80 px-2 py-0.5 rounded-full transition-colors flex items-center gap-1"
            >
              <TrendingUp className="h-2.5 w-2.5" />
              {mode === 'planned' ? '计划口径' : '实际口径'}
            </button>
          </div>
          <div className="flex items-center gap-1.5">
            {isToday && (
              <button onClick={() => setSettingsModal(true)}
                className="h-7 w-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
                <Settings2 className="h-3.5 w-3.5" />
              </button>
            )}
            {/* 不计入不再手动勾选——由系统监测偏低日、弹窗裁定。这里只展示已排除状态 */}
            {stats.excluded && (
              <span className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-xl border border-border text-muted-foreground bg-secondary/50">
                <EyeOff className="h-3.5 w-3.5" />{stats.exclude_reason || '已排除'}
              </span>
            )}
          </div>
        </div>

        {/* 口径切换 */}
        {modeOpen && (
          <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
            <p className="px-4 py-2 text-xs font-medium text-muted-foreground border-b border-border">切换计算方式</p>
            {[
              { key: 'actual',  label: '实际口径', desc: '以实际工作时间为准（不含暂停）' },
              { key: 'planned', label: '计划口径', desc: '提前完成按计划时长算，超时封顶' },
            ].map(o => (
              <button key={o.key} onClick={() => switchMode(o.key)}
                className={cn('w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-secondary transition-colors', mode === o.key && 'bg-primary/5')}>
                <span className={cn('h-4 w-4 rounded-full border-2 shrink-0 flex items-center justify-center', mode === o.key ? 'border-primary' : 'border-border')}>
                  {mode === o.key && <span className="h-2 w-2 rounded-full bg-primary" />}
                </span>
                <div>
                  <p className="text-sm font-medium">{o.label}</p>
                  <p className="text-[11px] text-muted-foreground">{o.desc}</p>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* 时间大数字 + 目标 */}
        <div className="flex items-end gap-3">
          <p className={cn('text-3xl font-black tabular-nums', stats.excluded && 'text-muted-foreground')}>
            {fmtH(effectiveSecs)}
          </p>
          {goalSecs > 0 && !stats.excluded && (
            <p className="text-sm text-muted-foreground pb-0.5">/ 目标 {fmtH(goalSecs)}</p>
          )}
          {mode === 'planned' && stats.effective_secs_actual !== stats.effective_secs_planned && (
            <p className="text-xs text-muted-foreground pb-1">实际 {fmtH(stats.effective_secs_actual)}</p>
          )}
        </div>

        {/* 排除提示 */}
        {stats.excluded && (
          <div className="rounded-xl bg-secondary/60 border border-border px-3 py-2.5 flex items-center gap-2 text-sm text-muted-foreground">
            <EyeOff className="h-4 w-4 shrink-0" />
            <span>已排除：<span className="font-medium text-foreground">{stats.exclude_reason}</span></span>
          </div>
        )}

        {/* 目标进度（未排除时始终显示） */}
        {goal && !stats.excluded && goalSecs > 0 && (
          <div className="space-y-2.5">
            {/* 连续未达标警告（仅今天显示） */}
            {isToday && goal.consecutive_fails > 0 && (
              <div className="rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 flex items-center gap-2 text-xs text-amber-700">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                <span>
                  已连续 <span className="font-semibold">{goal.consecutive_fails}</span> 天未达标
                  {goal.consecutive_fails >= goal.fail_limit - 1
                    ? `，再差 ${goal.fail_limit - goal.consecutive_fails} 天将降级 -${goal.degrade_mins}m`
                    : '，继续加油！'}
                </span>
              </div>
            )}

            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2 text-muted-foreground">
                <span>{isToday ? '今日目标' : '当前目标'} <span className="font-semibold text-foreground">{fmtH(goalSecs)}</span></span>
                {isToday && goal.consecutive_hits > 0 && (
                  <span className="flex items-center gap-0.5 text-orange-500 font-medium">
                    <Flame className="h-3 w-3" />连续达标 {goal.consecutive_hits} 天
                  </span>
                )}
              </div>
              <span className={cn('font-medium', hit ? 'text-emerald-600' : 'text-muted-foreground')}>
                {overPct > 0
                  ? `超额 ${Math.round(overPct)}%！`
                  : hit ? '✓ 达标' : `还差 ${fmtH(goalSecs - effectiveSecs)}`}
              </span>
            </div>

            <ProgressBar pct={pct} overPct={overPct} hit={hit} />

            {isToday && (
              <p className="text-[10px] text-muted-foreground">
                达标后次日目标 +{goal.step_mins}m · 连续 {goal.fail_limit} 天未达标则 -{goal.degrade_mins}m
              </p>
            )}
          </div>
        )}

        {/* 历史最佳专注 */}
        {best && best.best_focus.value > 0 && (
          <div className="flex items-center gap-1.5 text-[11px] text-amber-600 pt-0.5">
            <Trophy className="h-3 w-3 shrink-0" />
            历史最佳单日专注 <span className="font-semibold">{fmtH(best.best_focus.value)}</span>
            <span className="text-muted-foreground">· {fmtMD(best.best_focus.date)}</span>
          </div>
        )}
      </div>

      {settingsModal && goal && (
        <GoalSettingsModal
          goal={goal}
          onClose={() => setSettingsModal(false)}
        />
      )}
    </>
  )
}
