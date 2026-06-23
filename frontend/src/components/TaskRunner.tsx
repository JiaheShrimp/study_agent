import { useEffect, useRef, useState, useCallback } from 'react'
import { api, type DailyTask, type ScoreBreakdown } from '@/lib/api'
import { cn, gameToday } from '@/lib/utils'
import { playGoalReached } from '@/lib/sounds'

// ── 工具 ─────────────────────────────────────────────────────
function fmt(s: number) {
  const m = Math.floor(s / 60).toString().padStart(2, '0')
  const sec = (s % 60).toString().padStart(2, '0')
  return `${m}:${sec}`
}

// ── 倒计时弹窗 ────────────────────────────────────────────────
function Countdown({ onDone, task, workMins, restMins, isResume }: {
  onDone: () => void
  task: { content: string; hours: number }
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
  // 总休息预算（与主组件口径一致）：按预计时长换算
  const totalRestMin = Math.round(Math.max(restMins, (totalSecs / (workMins * 60)) * restMins))

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
            <span>⏱ 任务时长 {workH > 0 ? `${workH}h` : ''}{workM > 0 ? ` ${workM}m` : ''}</span>
            <span>💤 每 {workMins}m 休息 {restMins}m</span>
          </div>
          {isResume
            ? <p className="text-[11px] text-white/50 mt-1">从上次进度继续，已有休息预算保留</p>
            : <p className="text-[11px] text-white/50 mt-1">总休息预算 {totalRestMin}m，暂停时消耗</p>
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
// 小人沿圆环跑道运动，进度对应圆弧角度
function Track({
  runnerPct,
  restSecsLeft,
  totalRestBudget,
  paused,
  isResting,
  overtime,
  frame,
}: {
  runnerPct: number
  restSecsLeft: number
  totalRestBudget: number
  paused: boolean
  isResting: boolean
  overtime: boolean
  frame: number
}) {
  const SIZE = 380        // SVG 尺寸
  const CX = SIZE / 2     // 圆心
  const CY = SIZE / 2
  const R = 150           // 跑道半径
  const STROKE = 18       // 跑道宽度

  const lowRest = restSecsLeft < 60

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

  const runnerPos = pctToXY(Math.min(runnerPct, 99))
  const restPct   = totalRestBudget > 0 ? restSecsLeft / totalRestBudget : 1
  const restM     = Math.floor(restSecsLeft / 60)
  const restS     = Math.floor(restSecsLeft % 60)

  const runnerEmoji = paused ? '🧍' : isResting ? '🚶' : (frame % 4 < 2 ? '🏃' : '🏃')

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

          {/* 完成进度弧（小人走过的路）；超时变琥珀色 */}
          {runnerPct > 0.5 && (
            <path
              d={arcPath(0, Math.min(runnerPct, 99.9))}
              fill="none"
              stroke={overtime ? '#f59e0b' : lowRest && paused ? '#fca5a5' : 'hsl(var(--primary))'}
              strokeWidth={STROKE}
              strokeLinecap="round"
              style={{ transition: 'stroke 0.5s' }}
            />
          )}

          {/* 刻度点（每10%一个） */}
          {Array.from({ length: 10 }).map((_, i) => {
            const pos = pctToXY(i * 10)
            return (
              <circle key={i} cx={pos.x} cy={pos.y} r={2.5}
                fill="hsl(var(--background))" opacity={0.6} />
            )
          })}

          {/* 终点旗标记（100% = 顶部） */}
          <text
            x={CX} y={CY - R - STROKE / 2 - 6}
            textAnchor="middle" fontSize={22} dominantBaseline="auto"
          >🏁</text>

          {/* 小人 */}
          <text
            x={runnerPos.x} y={runnerPos.y}
            textAnchor="middle" dominantBaseline="middle"
            fontSize={28}
            style={{ transition: paused ? 'none' : 'all 0.4s linear' }}
          >
            {runnerEmoji}
          </text>

          {/* 中央信息 */}
          <text x={CX} y={CY - 30} textAnchor="middle" fontSize={14}
            fill={overtime && !paused ? '#f59e0b' : 'hsl(var(--muted-foreground))'}>
            {paused ? '⚠ 暂停' : isResting ? '😴 休息' : overtime ? '⏰ 超时冲刺' : '💨 冲刺'}
          </text>

          {/* 休息剩余时间 */}
          <text x={CX} y={CY + 6} textAnchor="middle" fontSize={32}
            fontWeight="bold" fontFamily="monospace"
            fill={restSecsLeft < 60 ? '#ef4444' : restSecsLeft < 120 ? '#f59e0b' : 'hsl(var(--foreground))'}>
            {restM}:{restS.toString().padStart(2, '0')}
          </text>

          {/* 休息预算标签 */}
          <text x={CX} y={CY + 32} textAnchor="middle" fontSize={12}
            fill="hsl(var(--muted-foreground))">
            休息预算
          </text>

          {/* 外圈休息预算弧（细圈，显示剩余比例） */}
          {restPct > 0.01 && (
            <path
              d={arcPath(0, restPct * 100, R + STROKE)}
              fill="none"
              stroke={restSecsLeft < 60 ? '#ef4444' : restSecsLeft < 120 ? '#f59e0b' : '#4ade80'}
              strokeWidth={5}
              strokeLinecap="round"
              opacity={0.7}
            />
          )}
          <circle cx={CX} cy={CY} r={R + STROKE}
            fill="none" stroke="hsl(var(--border))" strokeWidth={5} opacity={0.3} />
        </svg>

        {/* 暂停危险光晕 */}
        {paused && (
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
    failed:   { emoji: '💀', title: '力竭倒下…', note: '休息时间耗尽，没能坚持到终点。', barClass: 'from-rose-400 to-red-500' },
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
  workedSecs: number      // 累计工作秒数（正计时，从 0 开始）
  pausedSecs: number      // 累计暂停秒数
  pauseCount: number
  paused: boolean
  isResting: boolean      // 是否在自动休息段
  runnerPct: number       // 0-100
  overtime: boolean       // 是否已超过预计时间（达到 totalSecs 后仍在计时）
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

  // 总休息预算 = 按预计时长换算（每 work_mins 工作配 rest_mins 休息），开局一次性给满
  // 例：1h 任务、每 30min 休息 5min → 3600/1800 × 300 = 600s = 10 分钟
  const TOTAL_REST_BUDGET = Math.max(REST_SECS, Math.round((totalSecs / WORK_SECS) * REST_SECS))

  // 从上次暂停进度继续时的初始状态
  const initProgress = Math.min(initialWorkedSecs, totalSecs - 1)
  const initRunnerPct = initProgress > 0 ? 2 + (initProgress / totalSecs) * 90 : 2
  const initRestBudget = TOTAL_REST_BUDGET

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
    overtime: initProgress >= totalSecs,
    success: false,
    ended: false,
  })
  // 到点提示横幅是否显示；reachedRef 防止到点音效/横幅重复触发
  const [showReachedBanner, setShowReachedBanner] = useState(false)
  const reachedRef = useRef<boolean>(initProgress >= totalSecs)
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
      actual_seconds: Math.round(s.workedSecs - initProgress),
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
      // 暂停时：消耗休息预算
      s.restSecsLeft = Math.max(0, s.restSecsLeft - delta)
      s.pausedSecs += delta

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
      // 工作中：小人前进（正计时，从 0 累加，到预计时间后不停止）
      s.workedSecs += delta
      s.workSecsLeft -= delta

      // 进度：已工作时间 / 总任务时间，封顶 100%（超时后小人停在终点）
      const progress = Math.min(s.workedSecs / totalSecs, 1)
      s.runnerPct = 2 + progress * 90  // 2% ~ 92%

      // 到达预计时间：不结束，弹到点提示 + 音效（仅一次），继续计时进入超时态
      if (s.workedSecs >= totalSecs && !reachedRef.current) {
        reachedRef.current = true
        s.overtime = true
        s.runnerPct = 92
        try { playGoalReached() } catch {}
        setShowReachedBanner(true)
        setTimeout(() => setShowReachedBanner(false), 4000)
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

  function handleFinish() {
    const s = stateRef.current
    s.ended = true
    s.success = true
    s.runnerPct = 96
    cancelAnimationFrame(rafRef.current)
    setDisplay({ ...s })
    // 未到预计时间 = 提前完成（early，享受提前加成）；到点或超时 = 正常完成
    finishRun(s, s.workedSecs >= totalSecs ? 'complete' : 'early')
  }

  const workedPct = Math.min(100, (display.workedSecs / totalSecs) * 100)

  if (phase === 'countdown') {
    return <Countdown onDone={() => setPhase('running')} task={task} workMins={workMins} restMins={restMins} isResume={initialWorkedSecs > 0} />
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

  const overtimeSecs = Math.max(0, Math.round(display.workedSecs - totalSecs))

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-background">
      {/* 到点提示横幅 */}
      {showReachedBanner && (
        <div className="absolute top-0 inset-x-0 z-50 flex justify-center px-4 pt-3 pointer-events-none">
          <div className="animate-in slide-in-from-top-4 fade-in duration-300 rounded-2xl bg-amber-500 text-white px-5 py-2.5 shadow-lg text-sm font-medium flex items-center gap-2">
            ⏰ 已达预计时间，可随时点「完成任务」收尾
          </div>
        </div>
      )}

      {/* 顶部信息 */}
      <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-border">
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wide">进行中</p>
          <h2 className="text-base font-semibold mt-0.5">{task.content}</h2>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted-foreground">已完成</p>
          <p className={cn(
            'text-xl font-black tabular-nums',
            display.overtime ? 'text-amber-500' : 'text-primary'
          )}>{workedPct.toFixed(0)}%</p>
        </div>
      </div>

      {/* 主内容区 */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 gap-5">

        {/* 时间显示：正计时（已用时间）；超时后变橙色并显示超出时长 */}
        <div className="text-center space-y-1">
          <p className={cn(
            'text-5xl font-black tabular-nums tracking-tight transition-colors',
            display.overtime && 'text-amber-500'
          )}>
            {fmt(Math.round(display.workedSecs))}
          </p>
          <p className={cn(
            'text-xs',
            display.overtime ? 'text-amber-500 font-medium' : 'text-muted-foreground'
          )}>
            {display.overtime
              ? `已用时间 · 超出预计 ${fmt(overtimeSecs)}`
              : `已用时间 · 预计 ${fmt(totalSecs)}`}
          </p>
        </div>

        {/* 圆形跑道 */}
        <Track
          runnerPct={display.runnerPct}
          restSecsLeft={display.restSecsLeft}
          totalRestBudget={display.totalRestBudget}
          paused={display.paused}
          isResting={display.isResting}
          overtime={display.overtime}
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
            onClick={handleFinish}
            className={cn(
              'flex-1 h-10 rounded-2xl text-sm font-medium border transition-colors',
              display.overtime
                ? 'text-emerald-700 border-emerald-200 bg-emerald-50 hover:bg-emerald-100'
                : 'text-sky-600 border-sky-200 bg-sky-50 hover:bg-sky-100'
            )}
          >
            {display.overtime ? '✅ 完成任务' : '⚡ 提前完成'}
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
