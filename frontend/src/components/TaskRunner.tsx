import { useEffect, useRef, useState, useCallback } from 'react'
import { api, type DailyTask, type ScoreBreakdown } from '@/lib/api'
import { cn, gameToday } from '@/lib/utils'

// ── 工具 ─────────────────────────────────────────────────────
function fmt(s: number) {
  const m = Math.floor(s / 60).toString().padStart(2, '0')
  const sec = (s % 60).toString().padStart(2, '0')
  return `${m}:${sec}`
}

// ── 倒计时弹窗 ────────────────────────────────────────────────
function Countdown({ onDone, task, restBudgetSecs, workMins, restMins, isResume }: {
  onDone: () => void
  task: { content: string; hours: number }
  restBudgetSecs: number
  workMins: number
  restMins: number
  isResume?: boolean
}) {
  const [n, setN] = useState(3)

  useEffect(() => {
    if (n === 0) { onDone(); return }
    const t = setTimeout(() => setN(n - 1), 1000)
    return () => clearTimeout(t)
  }, [n])

  const totalSecs = Math.round(task.hours * 3600)
  const workH = Math.floor(totalSecs / 3600)
  const workM = Math.floor((totalSecs % 3600) / 60)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/20 backdrop-blur-sm">
      <div className="text-center space-y-5">
        <p className="text-xs font-medium text-white/70 uppercase tracking-widest">
          {isResume ? '继续任务' : '任务开始'}
        </p>

        {/* 任务信息卡 */}
        <div className="bg-white/10 backdrop-blur rounded-2xl px-6 py-4 space-y-1 text-white">
          <p className="text-sm font-semibold">{task.content}</p>
          <div className="flex items-center justify-center gap-4 text-xs text-white/70 mt-1">
            <span>⏱ 任务时长 {workH > 0 ? `${workH}h ` : ''}{workM > 0 ? `${workM}m` : `${totalSecs}s`}</span>
            <span>💤 每 {workMins}m 休息 {restMins}m</span>
          </div>
          {isResume
            ? <p className="text-[11px] text-white/50 mt-1">从上次进度继续，已有休息预算保留</p>
            : <p className="text-[11px] text-white/50 mt-1">初始休息预算 {restMins}m，每完成一段工作追加</p>
          }
        </div>

        <div
          key={n}
          className="text-9xl font-black text-white animate-in zoom-in-50 fade-in duration-200"
        >
          {n === 0 ? '🏃' : n}
        </div>
      </div>
    </div>
  )
}

// ── 圆形跑道组件 ─────────────────────────────────────────────
// 小人和怪兽沿圆环跑道运动，进度对应圆弧角度
function Track({
  runnerPct,
  monsterPct,
  restSecsLeft,
  totalRestBudget,
  paused,
  isResting,
  frame,
}: {
  runnerPct: number
  monsterPct: number
  restSecsLeft: number
  totalRestBudget: number
  paused: boolean
  isResting: boolean
  frame: number
}) {
  const SIZE = 280        // SVG 尺寸
  const CX = SIZE / 2     // 圆心
  const CY = SIZE / 2
  const R = 108           // 跑道半径
  const STROKE = 14       // 跑道宽度

  const gap = runnerPct - monsterPct
  const danger = gap < 15

  // 把百分比转成圆周上的坐标（从顶部 -90° 顺时针）
  function pctToXY(pct: number, r = R) {
    const angle = (pct / 100) * 2 * Math.PI - Math.PI / 2
    return {
      x: CX + r * Math.cos(angle),
      y: CY + r * Math.sin(angle),
    }
  }

  // 圆弧路径（用于进度弧）
  function arcPath(fromPct: number, toPct: number, r = R) {
    const start = pctToXY(fromPct, r)
    const end   = pctToXY(toPct, r)
    const span  = toPct - fromPct
    const large = span > 50 ? 1 : 0
    return `M ${start.x} ${start.y} A ${r} ${r} 0 ${large} 1 ${end.x} ${end.y}`
  }

  const runnerPos  = pctToXY(Math.min(runnerPct, 99))
  const monsterPos = pctToXY(Math.max(0, monsterPct))
  const restPct    = totalRestBudget > 0 ? restSecsLeft / totalRestBudget : 1
  const restM      = Math.floor(restSecsLeft / 60)
  const restS      = Math.floor(restSecsLeft % 60)

  // 跑步动画：emoji 在奇偶帧间交替
  const runnerEmoji  = paused ? '🧍' : isResting ? '🚶' : (frame % 4 < 2 ? '🏃' : '🏃')
  const monsterEmoji = danger ? (frame % 4 < 2 ? '👾' : '👾') : '🐲'

  return (
    <div className="flex flex-col items-center gap-4">
      {/* 圆形跑道 */}
      <div className="relative" style={{ width: SIZE, height: SIZE }}>
        <svg width={SIZE} height={SIZE}>
          {/* 跑道底色 */}
          <circle
            cx={CX} cy={CY} r={R}
            fill="none"
            stroke="hsl(var(--secondary))"
            strokeWidth={STROKE}
          />

          {/* 完成进度弧（小人走过的路） */}
          {runnerPct > 0.5 && (
            <path
              d={arcPath(0, Math.min(runnerPct, 99.9))}
              fill="none"
              stroke={danger && paused ? '#fca5a5' : 'hsl(var(--primary))'}
              strokeWidth={STROKE}
              strokeLinecap="round"
              style={{ transition: 'stroke 0.5s' }}
            />
          )}

          {/* 刻度点（每10%一个） */}
          {Array.from({ length: 10 }).map((_, i) => {
            const pos = pctToXY(i * 10)
            return (
              <circle key={i} cx={pos.x} cy={pos.y} r={2}
                fill="hsl(var(--background))" opacity={0.6} />
            )
          })}

          {/* 终点旗标记（100% = 顶部） */}
          <text
            x={CX} y={CY - R - STROKE / 2 - 4}
            textAnchor="middle" fontSize={16} dominantBaseline="auto"
          >🏁</text>

          {/* 怪兽 */}
          <text
            x={monsterPos.x} y={monsterPos.y}
            textAnchor="middle" dominantBaseline="middle"
            fontSize={danger ? 20 : 18}
            style={{ transition: 'all 0.4s linear', filter: danger ? 'drop-shadow(0 0 4px #ef4444)' : 'none' }}
          >
            {monsterEmoji}
          </text>

          {/* 小人 */}
          <text
            x={runnerPos.x} y={runnerPos.y}
            textAnchor="middle" dominantBaseline="middle"
            fontSize={20}
            style={{ transition: paused ? 'none' : 'all 0.4s linear' }}
          >
            {runnerEmoji}
          </text>

          {/* 中央信息 */}
          <text x={CX} y={CY - 22} textAnchor="middle" fontSize={11}
            fill="hsl(var(--muted-foreground))">
            {paused ? '⚠ 暂停' : isResting ? '😴 休息' : '💨 冲刺'}
          </text>

          {/* 休息剩余时间 */}
          <text x={CX} y={CY + 4} textAnchor="middle" fontSize={22}
            fontWeight="bold" fontFamily="monospace"
            fill={restSecsLeft < 60 ? '#ef4444' : restSecsLeft < 120 ? '#f59e0b' : 'hsl(var(--foreground))'}>
            {restM}:{restS.toString().padStart(2, '0')}
          </text>

          {/* 休息预算标签 */}
          <text x={CX} y={CY + 24} textAnchor="middle" fontSize={10}
            fill="hsl(var(--muted-foreground))">
            休息预算
          </text>

          {/* 外圈休息预算弧（细圈，显示剩余比例） */}
          {restPct > 0.01 && (
            <path
              d={arcPath(0, restPct * 100, R + STROKE)}
              fill="none"
              stroke={restSecsLeft < 60 ? '#ef4444' : restSecsLeft < 120 ? '#f59e0b' : '#4ade80'}
              strokeWidth={4}
              strokeLinecap="round"
              opacity={0.7}
            />
          )}
          <circle cx={CX} cy={CY} r={R + STROKE}
            fill="none" stroke="hsl(var(--border))" strokeWidth={4} opacity={0.3} />
        </svg>

        {/* 暂停危险光晕 */}
        {paused && danger && (
          <div className="absolute inset-0 rounded-full bg-rose-500/5 animate-pulse pointer-events-none" />
        )}
      </div>
    </div>
  )
}

// ── 结果页 ────────────────────────────────────────────────────
// endReason: 'complete'=跑到终点, 'early'=提前完成, 'giveup'=中断, 'failed'=被追上
type EndReason = 'complete' | 'early' | 'giveup' | 'failed'

function ResultPage({
  task,
  endReason,
  actualSeconds,
  pauseCount,
  pauseSeconds,
  workedPct,
  scoreBreakdown,
  onClose,
}: {
  task: DailyTask
  endReason: EndReason
  actualSeconds: number
  pauseCount: number
  pauseSeconds: number
  workedPct: number
  scoreBreakdown: ScoreBreakdown | null
  onClose: () => void
}) {
  const success = endReason === 'complete' || endReason === 'early'

  const RESULT_INFO: Record<EndReason, { emoji: string; title: string; note?: string; barClass: string }> = {
    complete: { emoji: '🏆', title: '任务完成！', barClass: 'from-green-300 to-emerald-400' },
    early:    { emoji: '⚡', title: '提前完成！', note: '你比计划更快完成了任务。', barClass: 'from-sky-300 to-blue-400' },
    giveup:   { emoji: '🚩', title: '中断任务', note: `已完成 ${workedPct.toFixed(0)}%，本次记录已保存。`, barClass: 'from-amber-300 to-orange-400' },
    failed:   { emoji: '💀', title: '被追上了…', note: '休息时间耗尽，怪兽追上了你。', barClass: 'from-rose-400 to-red-500' },
  }

  const info = RESULT_INFO[endReason]

  const bonusItems = scoreBreakdown ? [
    scoreBreakdown.bonus_no_pause > 1   && { label: '零暂停', value: `×${scoreBreakdown.bonus_no_pause}` },
    scoreBreakdown.bonus_few_pause > 1  && { label: '少暂停', value: `×${scoreBreakdown.bonus_few_pause}` },
    scoreBreakdown.bonus_rest_saved > 1 && { label: '省休息', value: `×${scoreBreakdown.bonus_rest_saved}` },
    scoreBreakdown.bonus_early > 1      && { label: '提前完', value: `×${scoreBreakdown.bonus_early}` },
    scoreBreakdown.multiplier !== 1     && { label: '今日倍数', value: `×${scoreBreakdown.multiplier}` },
  ].filter(Boolean) as { label: string; value: string }[] : []

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/20 backdrop-blur-sm">
      <div className="w-full max-w-sm mx-4 bg-card rounded-3xl border border-border shadow-2xl overflow-hidden">
        <div className={cn('h-1.5 bg-gradient-to-r', info.barClass)} />
        <div className="p-7 space-y-5 text-center">
          <div>
            <div className="text-5xl mb-3">{info.emoji}</div>
            <h2 className="text-xl font-bold">{info.title}</h2>
            <p className="text-sm text-muted-foreground mt-1">{task.content}</p>
          </div>

          {/* 得分展示（仅成功时） */}
          {success && scoreBreakdown && (
            <div className="rounded-2xl bg-primary/5 border border-primary/20 px-4 py-4 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">获得点数</span>
                <span className="text-2xl font-black text-primary tabular-nums">+{scoreBreakdown.total}</span>
              </div>
              <div className="h-px bg-border" />
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>基础分 {scoreBreakdown.base}</span>
                {bonusItems.length > 0 && (
                  <div className="flex items-center gap-1.5 flex-wrap justify-end">
                    {bonusItems.map(b => (
                      <span key={b.label} className="bg-primary/10 text-primary px-1.5 py-0.5 rounded-md font-medium">
                        {b.label} {b.value}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="grid grid-cols-3 gap-3">
            {[
              { label: '实际用时', value: fmt(actualSeconds) },
              { label: '暂停次数', value: `${pauseCount} 次` },
              { label: '总暂停', value: fmt(pauseSeconds) },
            ].map(({ label, value }) => (
              <div key={label} className="rounded-xl bg-secondary/60 px-3 py-3">
                <p className="text-[11px] text-muted-foreground">{label}</p>
                <p className="text-base font-bold mt-0.5 tabular-nums">{value}</p>
              </div>
            ))}
          </div>

          {info.note && (
            <p className={cn(
              'text-xs rounded-xl p-3',
              success ? 'bg-sky-50 text-sky-700' : endReason === 'giveup' ? 'bg-amber-50 text-amber-700' : 'bg-rose-50 text-rose-700'
            )}>
              {info.note}
            </p>
          )}

          <button
            onClick={onClose}
            className="w-full h-11 rounded-2xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-colors"
          >
            返回任务列表
          </button>
        </div>
      </div>
    </div>
  )
}

// ── 主组件 ────────────────────────────────────────────────────
type Phase = 'countdown' | 'running' | 'result'


interface RunState {
  workSecsLeft: number    // 当前工作段剩余秒
  restSecsLeft: number    // 当前休息/暂停预算剩余秒
  totalRestBudget: number // 总休息预算（随工作时间增加）
  workedSecs: number      // 累计工作秒数
  pausedSecs: number      // 累计暂停秒数
  pauseCount: number
  paused: boolean
  isResting: boolean      // 是否在自动休息段
  runnerPct: number       // 0-100
  monsterPct: number      // 0-100
  success: boolean
  ended: boolean
}

export function TaskRunner({
  task,
  onClose,
  workMins = 30,
  restMins = 5,
  multiplier = 1.0,
  initialWorkedSecs = 0,
}: {
  task: DailyTask
  onClose: () => void
  workMins?: number
  restMins?: number
  multiplier?: number
  initialWorkedSecs?: number
}) {
  const WORK_SECS = workMins * 60
  const REST_SECS = restMins * 60

  const totalSecs = Math.round(task.hours * 3600)
  const startedAtRef = useRef<string>('')   // 记录实际开始时间

  // 从上次暂停进度继续时的初始状态
  const initProgress = Math.min(initialWorkedSecs, totalSecs - 1)
  const initRunnerPct = initProgress > 0 ? 2 + (initProgress / totalSecs) * 90 : 2
  const initRestBudget = initProgress > 0
    ? REST_SECS * Math.ceil(initProgress / WORK_SECS + 1)
    : REST_SECS

  const [phase, setPhase] = useState<Phase>('countdown')
  const [endReason, setEndReason] = useState<EndReason>('complete')
  const [scoreBreakdown, setScoreBreakdown] = useState<ScoreBreakdown | null>(null)
  const [frame, setFrame] = useState(0)
  const stateRef = useRef<RunState>({
    workSecsLeft: WORK_SECS,
    restSecsLeft: initRestBudget,
    totalRestBudget: initRestBudget,
    workedSecs: initProgress,
    pausedSecs: 0,
    pauseCount: 0,
    paused: false,
    isResting: false,
    runnerPct: initRunnerPct,
    monsterPct: Math.max(0, initRunnerPct - 25),
    success: false,
    ended: false,
  })
  const [display, setDisplay] = useState({ ...stateRef.current })
  const rafRef = useRef<number>(0)
  const lastTickRef = useRef<number>(0)

  function finishRun(s: RunState, reason: EndReason) {
    const today = gameToday()
    api.tasks.saveRun({
      task_id: task.id,
      task_content: task.content,
      date: today,
      success: reason === 'complete' || reason === 'early',
      started_at: startedAtRef.current,
      ended_at: new Date().toISOString(),
      actual_seconds: Math.round(s.workedSecs),
      pause_count: s.pauseCount,
      pause_seconds: Math.round(s.pausedSecs),
      task_hours: task.hours,
      task_stars: task.stars,
      end_reason: reason,
      rest_remaining_secs: Math.round(s.restSecsLeft),
      multiplier,
    }).then(res => setScoreBreakdown(res.score_breakdown)).catch(() => {})
    setEndReason(reason)
    setPhase('result')
  }

  const workSecsConst = WORK_SECS
  const restSecsConst = REST_SECS

  const tick = useCallback(() => {
    const now = performance.now()
    const delta = (now - lastTickRef.current) / 1000  // 秒
    lastTickRef.current = now
    const s = stateRef.current

    if (s.ended) return

    if (s.paused) {
      // 暂停时：怪兽逼近，消耗休息预算
      s.restSecsLeft = Math.max(0, s.restSecsLeft - delta)
      s.pausedSecs += delta

      // 怪兽向小人逼近（暂停期间追赶速度）
      const catchSpeed = (s.runnerPct - s.monsterPct) / Math.max(s.restSecsLeft + delta, 1)
      s.monsterPct = Math.min(s.runnerPct, s.monsterPct + catchSpeed * delta * 3)

      if (s.restSecsLeft <= 0) {
        // 失败：休息时间耗尽
        s.ended = true
        s.success = false
        setDisplay({ ...s })
        finishRun(s, 'failed')
        return
      }
    } else if (s.isResting) {
      // 自动休息段：小人停止，休息时间自动恢复（但不超过预算上限）
      // 休息段不消耗预算，让玩家缓口气
      s.restSecsLeft = Math.min(s.totalRestBudget, s.restSecsLeft + delta * 0.5)
    } else {
      // 工作中：小人前进
      s.workedSecs += delta
      s.workSecsLeft -= delta

      // 进度：已工作时间 / 总任务时间
      const progress = Math.min(s.workedSecs / totalSecs, 1)
      s.runnerPct = 2 + progress * 90  // 2% ~ 92%

      // 怪兽缓慢跟随（工作时保持距离，暂停时才拉近）
      const targetMonster = Math.max(0, s.runnerPct - 25)
      s.monsterPct += (targetMonster - s.monsterPct) * delta * 0.05

      // 累计工作时间增加休息预算
      s.totalRestBudget = restSecsConst * Math.ceil(s.workedSecs / workSecsConst + 1)

      // 到达终点
      if (s.workedSecs >= totalSecs) {
        s.ended = true
        s.success = true
        s.runnerPct = 96
        setDisplay({ ...s })
        finishRun(s, 'complete')
        return
      }

      // 工作段结束后进入休息段
      if (s.workSecsLeft <= 0) {
        s.isResting = true
        s.workSecsLeft = workSecsConst  // 重置下一个工作段
        setTimeout(() => {
          stateRef.current.isResting = false
        }, restSecsConst * 1000)
      }
    }

    setDisplay({ ...s })
    rafRef.current = requestAnimationFrame(tick)
  }, [totalSecs, task.id, workSecsConst, restSecsConst])

  useEffect(() => {
    if (phase !== 'running') return
    startedAtRef.current = new Date().toISOString()
    lastTickRef.current = performance.now()
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [phase, tick])

  // 像素动画帧计数，每 200ms +1
  useEffect(() => {
    if (phase !== 'running') return
    const id = setInterval(() => setFrame(f => f + 1), 200)
    return () => clearInterval(id)
  }, [phase])

  function handlePause() {
    const s = stateRef.current
    if (s.ended) return
    if (s.paused) {
      // 继续
      s.paused = false
      lastTickRef.current = performance.now()
      rafRef.current = requestAnimationFrame(tick)
    } else {
      // 暂停
      s.paused = true
      s.pauseCount += 1
      cancelAnimationFrame(rafRef.current)
      rafRef.current = requestAnimationFrame(tick)  // 继续跑怪兽逼近逻辑
    }
    setDisplay({ ...s })
  }

  function handleGiveUp() {
    const s = stateRef.current
    s.ended = true
    s.success = false
    cancelAnimationFrame(rafRef.current)
    setDisplay({ ...s })
    finishRun(s, 'giveup')
  }

  function handleEarlyFinish() {
    const s = stateRef.current
    s.ended = true
    s.success = true
    s.runnerPct = 96
    cancelAnimationFrame(rafRef.current)
    setDisplay({ ...s })
    finishRun(s, 'early')
  }

  const workedPct = Math.min(100, (display.workedSecs / totalSecs) * 100)

  if (phase === 'countdown') {
    return <Countdown onDone={() => setPhase('running')} task={task} restBudgetSecs={REST_SECS} workMins={workMins} restMins={restMins} isResume={initialWorkedSecs > 0} />
  }

  if (phase === 'result') {
    const s = stateRef.current
    return (
      <ResultPage
        task={task}
        endReason={endReason}
        actualSeconds={Math.round(s.workedSecs)}
        pauseCount={s.pauseCount}
        pauseSeconds={Math.round(s.pausedSecs)}
        workedPct={Math.min(100, (s.workedSecs / totalSecs) * 100)}
        scoreBreakdown={scoreBreakdown}
        onClose={onClose}
      />
    )
  }

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-background">
      {/* 顶部信息 */}
      <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-border">
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wide">进行中</p>
          <h2 className="text-base font-semibold mt-0.5">{task.content}</h2>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted-foreground">已完成</p>
          <p className="text-xl font-black tabular-nums text-primary">{workedPct.toFixed(0)}%</p>
        </div>
      </div>

      {/* 主内容区 */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 gap-5">

        {/* 时间显示 */}
        <div className="text-center space-y-1">
          <p className="text-5xl font-black tabular-nums tracking-tight">
            {fmt(Math.round(totalSecs - display.workedSecs))}
          </p>
          <p className="text-xs text-muted-foreground">剩余时间</p>
        </div>

        {/* 圆形跑道 */}
        <Track
          runnerPct={display.runnerPct}
          monsterPct={display.monsterPct}
          restSecsLeft={display.restSecsLeft}
          totalRestBudget={display.totalRestBudget}
          paused={display.paused}
          isResting={display.isResting}
          frame={frame}
        />

        {/* 小数据 */}
        <div className="grid grid-cols-3 gap-3 text-center w-full max-w-xs">
          <div>
            <p className="text-xs text-muted-foreground">工作时长</p>
            <p className="text-sm font-bold tabular-nums">{fmt(Math.round(display.workedSecs))}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">暂停次数</p>
            <p className="text-sm font-bold tabular-nums">{display.pauseCount}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">暂停时长</p>
            <p className="text-sm font-bold tabular-nums">{fmt(Math.round(display.pausedSecs))}</p>
          </div>
        </div>
      </div>

      {/* 底部按钮 */}
      <div className="px-6 pb-8 space-y-3">
        <button
          onClick={handlePause}
          className={cn(
            'w-full h-14 rounded-2xl font-bold text-base transition-all active:scale-[0.98]',
            display.paused
              ? 'bg-primary text-primary-foreground hover:bg-primary/90'
              : 'bg-secondary text-foreground hover:bg-secondary/80'
          )}
        >
          {display.paused ? '▶ 继续冲刺' : '⏸ 暂停'}
        </button>
        <div className="flex gap-3">
          <button
            onClick={handleEarlyFinish}
            className="flex-1 h-10 rounded-2xl text-sm font-medium text-sky-600 border border-sky-200 bg-sky-50 hover:bg-sky-100 transition-colors"
          >
            ⚡ 提前完成
          </button>
          <button
            onClick={handleGiveUp}
            className="flex-1 h-10 rounded-2xl text-sm text-muted-foreground hover:text-rose-500 border border-border hover:border-rose-200 transition-colors"
          >
            中断任务
          </button>
        </div>
      </div>
    </div>
  )
}
