import { useEffect, useRef, useState, useCallback } from 'react'
import { api, type DailyTask } from '@/lib/api'
import { cn } from '@/lib/utils'

// ── 常量 ─────────────────────────────────────────────────────
const WORK_SECS  = 30 * 60   // 30 分钟工作
const REST_SECS  = 5  * 60   // 5 分钟休息（暂停时消耗）

// ── 工具 ─────────────────────────────────────────────────────
function fmt(s: number) {
  const m = Math.floor(s / 60).toString().padStart(2, '0')
  const sec = (s % 60).toString().padStart(2, '0')
  return `${m}:${sec}`
}

// ── 倒计时弹窗 ────────────────────────────────────────────────
function Countdown({ onDone }: { onDone: () => void }) {
  const [n, setN] = useState(3)

  useEffect(() => {
    if (n === 0) { onDone(); return }
    const t = setTimeout(() => setN(n - 1), 1000)
    return () => clearTimeout(t)
  }, [n])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/20 backdrop-blur-sm">
      <div className="text-center">
        <p className="text-xs font-medium text-white/70 uppercase tracking-widest mb-4">任务开始</p>
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

// ── 跑道组件 ──────────────────────────────────────────────────
// runnerPct: 0-100，小人位置
// monsterPct: 0-100，怪兽位置（从后追）
// restPct: 0-100，休息时间剩余百分比
function Track({
  runnerPct,
  monsterPct,
  restPct,
  paused,
  isResting,
}: {
  runnerPct: number
  monsterPct: number
  restPct: number
  paused: boolean
  isResting: boolean
}) {
  const gap = runnerPct - monsterPct  // 差距，越小越危险

  return (
    <div className="w-full space-y-3">
      {/* 跑道主体 */}
      <div className="relative h-20 rounded-2xl bg-secondary/60 border border-border overflow-hidden">
        {/* 地面线 */}
        <div className="absolute bottom-5 inset-x-0 h-px bg-border/60" />

        {/* 终点旗 */}
        <div className="absolute right-3 bottom-4 text-xl select-none">🏁</div>

        {/* 怪兽 */}
        <div
          className="absolute bottom-4 text-2xl select-none transition-none"
          style={{
            left: `${Math.max(0, monsterPct)}%`,
            transform: 'translateX(-50%)',
            filter: gap < 15 ? 'drop-shadow(0 0 6px rgba(239,68,68,0.8))' : 'none',
            transition: 'left 0.3s linear, filter 0.5s',
          }}
        >
          {gap < 10 ? '👾' : gap < 20 ? '🐺' : '🐲'}
        </div>

        {/* 小人 */}
        <div
          className="absolute bottom-4 text-2xl select-none"
          style={{
            left: `${Math.min(96, runnerPct)}%`,
            transform: 'translateX(-50%)',
            transition: 'left 0.3s linear',
          }}
        >
          {paused ? '🧍' : isResting ? '🚶' : '🏃'}
        </div>

        {/* 暂停时的危险光晕 */}
        {paused && (
          <div className="absolute inset-0 bg-rose-500/5 animate-pulse pointer-events-none" />
        )}
      </div>

      {/* 休息时间条（暂停时消耗） */}
      <div className="flex items-center gap-2">
        <span className="text-[11px] text-muted-foreground shrink-0 w-16">
          {paused ? '⚠️ 暂停中' : isResting ? '😴 休息中' : '💨 冲刺中'}
        </span>
        <div className="flex-1 h-2 rounded-full bg-secondary overflow-hidden">
          <div
            className={cn(
              'h-full rounded-full transition-all duration-1000',
              restPct > 50 ? 'bg-green-400' :
              restPct > 25 ? 'bg-amber-400' : 'bg-rose-500'
            )}
            style={{ width: `${restPct}%` }}
          />
        </div>
        <span className="text-[11px] text-muted-foreground shrink-0 w-10 text-right">
          {Math.round(restPct)}%
        </span>
      </div>
    </div>
  )
}

// ── 结果页 ────────────────────────────────────────────────────
function ResultPage({
  task,
  success,
  actualSeconds,
  pauseCount,
  pauseSeconds,
  onClose,
}: {
  task: DailyTask
  success: boolean
  actualSeconds: number
  pauseCount: number
  pauseSeconds: number
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/20 backdrop-blur-sm">
      <div className="w-full max-w-sm mx-4 bg-card rounded-3xl border border-border shadow-2xl overflow-hidden">
        <div className={cn('h-1.5', success ? 'bg-gradient-to-r from-green-300 to-emerald-400' : 'bg-gradient-to-r from-rose-400 to-red-500')} />
        <div className="p-7 space-y-6 text-center">
          <div>
            <div className="text-5xl mb-3">{success ? '🏆' : '💀'}</div>
            <h2 className="text-xl font-bold">{success ? '任务完成！' : '被追上了…'}</h2>
            <p className="text-sm text-muted-foreground mt-1">{task.content}</p>
          </div>

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

          {!success && (
            <p className="text-xs text-muted-foreground bg-rose-50 rounded-xl p-3 text-rose-700">
              休息时间耗尽，怪兽追上了你。任务未计入完成。
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

export function TaskRunner({ task, onClose }: { task: DailyTask; onClose: () => void }) {
  const totalSecs = Math.round(task.hours * 3600)
  const startedAtRef = useRef<string>('')   // 记录实际开始时间

  const [phase, setPhase] = useState<Phase>('countdown')
  const stateRef = useRef<RunState>({
    workSecsLeft: WORK_SECS,
    restSecsLeft: REST_SECS,
    totalRestBudget: REST_SECS,
    workedSecs: 0,
    pausedSecs: 0,
    pauseCount: 0,
    paused: false,
    isResting: false,
    runnerPct: 2,
    monsterPct: 0,
    success: false,
    ended: false,
  })
  const [display, setDisplay] = useState({ ...stateRef.current })
  const rafRef = useRef<number>(0)
  const lastTickRef = useRef<number>(0)

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
        setPhase('result')
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
      s.totalRestBudget = REST_SECS * Math.ceil(s.workedSecs / WORK_SECS + 1)

      // 到达终点
      if (s.workedSecs >= totalSecs) {
        s.ended = true
        s.success = true
        s.runnerPct = 96
        setDisplay({ ...s })

        // 保存结果
        const today = new Date().toISOString().slice(0, 10)
        api.tasks.saveRun({
          task_id: task.id,
          task_content: task.content,
          date: today,
          success: true,
          started_at: startedAtRef.current,
          ended_at: new Date().toISOString(),
          actual_seconds: Math.round(s.workedSecs),
          pause_count: s.pauseCount,
          pause_seconds: Math.round(s.pausedSecs),
        }).catch(() => {})

        setPhase('result')
        return
      }

      // 工作 30 分钟后进入休息段
      if (s.workSecsLeft <= 0) {
        s.isResting = true
        s.workSecsLeft = WORK_SECS  // 重置下一个工作段
        // 休息 5 分钟后自动继续（用 setTimeout）
        setTimeout(() => {
          stateRef.current.isResting = false
        }, REST_SECS * 1000)
      }
    }

    setDisplay({ ...s })
    rafRef.current = requestAnimationFrame(tick)
  }, [totalSecs, task.id])

  useEffect(() => {
    if (phase !== 'running') return
    startedAtRef.current = new Date().toISOString()  // 倒计时结束，正式开始
    lastTickRef.current = performance.now()
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [phase, tick])

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

    const today = new Date().toISOString().slice(0, 10)
    api.tasks.saveRun({
      task_id: task.id,
      task_content: task.content,
      date: today,
      success: false,
      started_at: startedAtRef.current,
      ended_at: new Date().toISOString(),
      actual_seconds: Math.round(s.workedSecs),
      pause_count: s.pauseCount,
      pause_seconds: Math.round(s.pausedSecs),
    }).catch(() => {})

    setDisplay({ ...s })
    setPhase('result')
  }

  // 休息时间剩余百分比
  const restPct = display.totalRestBudget > 0
    ? (display.restSecsLeft / display.totalRestBudget) * 100
    : 100

  const workedPct = Math.min(100, (display.workedSecs / totalSecs) * 100)

  if (phase === 'countdown') {
    return <Countdown onDone={() => setPhase('running')} />
  }

  if (phase === 'result') {
    const s = stateRef.current
    return (
      <ResultPage
        task={task}
        success={s.success}
        actualSeconds={Math.round(s.workedSecs)}
        pauseCount={s.pauseCount}
        pauseSeconds={Math.round(s.pausedSecs)}
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
      <div className="flex-1 flex flex-col justify-center px-6 space-y-8">

        {/* 时间显示 */}
        <div className="text-center space-y-1">
          <p className="text-5xl font-black tabular-nums tracking-tight">
            {fmt(Math.round(totalSecs - display.workedSecs))}
          </p>
          <p className="text-xs text-muted-foreground">剩余时间</p>
        </div>

        {/* 跑道 */}
        <Track
          runnerPct={display.runnerPct}
          monsterPct={display.monsterPct}
          restPct={restPct}
          paused={display.paused}
          isResting={display.isResting}
        />

        {/* 小数据 */}
        <div className="grid grid-cols-3 gap-3 text-center">
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
        <button
          onClick={handleGiveUp}
          className="w-full h-10 rounded-2xl text-sm text-muted-foreground hover:text-rose-500 transition-colors"
        >
          放弃任务
        </button>
      </div>
    </div>
  )
}
