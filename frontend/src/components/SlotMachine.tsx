import { useEffect, useRef, useState } from 'react'
import { api, type DailyBonus } from '@/lib/api'
import { cn } from '@/lib/utils'

// ── 概率表：1最多，5极少，最终倍数 = 平均值映射到 1.0-3.0 ──
const WEIGHTS = [0, 40, 28, 18, 9, 5]
const NUMBERS = [1, 2, 3, 4, 5]

function weightedRandom(): number {
  let r = Math.random() * 100
  for (const n of NUMBERS) {
    r -= WEIGHTS[n]
    if (r <= 0) return n
  }
  return 1
}

function rollThree(): number[] {
  return [weightedRandom(), weightedRandom(), weightedRandom()]
}

// 平均值 1-5 映射到倍数 1.0-3.0，保留一位小数
function calcMultiplier(rolls: number[]): number {
  const avg = rolls.reduce((a, b) => a + b, 0) / rolls.length
  // avg 范围 1-5 → 线性映射到 1.0-3.0
  const raw = 1 + ((avg - 1) / 4) * 2
  return Math.round(raw * 10) / 10
}

// ── 单个滚轮（真正的数字滚动动画）────────────────────────────

const CELL_H = 64       // 每格高度 px
const VISIBLE = 3       // 可见格数
const REEL_NUMS = [1, 2, 3, 4, 5, 1, 2, 3, 4, 5, 1, 2, 3, 4, 5] // 循环列表

function Reel({
  targetValue,
  active,       // 是否开始旋转
  stopDelay,    // 多少 ms 后停止
  onStopped,
}: {
  targetValue: number
  active: boolean
  stopDelay: number
  onStopped: () => void
}) {
  const [translateY, setTranslateY] = useState(0)
  const [isSpinning, setIsSpinning] = useState(false)
  const [displayValue, setDisplayValue] = useState<number | null>(null)
  const rafRef = useRef<number>(0)
  const velRef = useRef(0)            // 当前速度 px/frame
  const posRef = useRef(0)            // 当前位置
  const stoppingRef = useRef(false)
  const stoppedRef = useRef(false)

  useEffect(() => {
    if (!active) return

    setDisplayValue(null)
    setIsSpinning(true)
    stoppingRef.current = false
    stoppedRef.current = false
    velRef.current = 0
    posRef.current = 0

    // 加速阶段 → 匀速 → 停止
    const MAX_VEL = 28  // px/frame 最高速
    const ACCEL = 2.5

    function animate() {
      if (stoppedRef.current) return

      if (!stoppingRef.current) {
        // 加速到最高速
        velRef.current = Math.min(velRef.current + ACCEL, MAX_VEL)
      } else {
        // 减速
        velRef.current = Math.max(velRef.current - 1.5, 0)
      }

      posRef.current += velRef.current
      // 循环
      const total = CELL_H * REEL_NUMS.length
      posRef.current = posRef.current % total
      setTranslateY(posRef.current)

      if (stoppingRef.current && velRef.current === 0) {
        // 对齐到目标格
        const targetIndex = REEL_NUMS.lastIndexOf(targetValue)
        const snapY = targetIndex * CELL_H
        setTranslateY(snapY)
        setIsSpinning(false)
        setDisplayValue(targetValue)
        stoppedRef.current = true
        onStopped()
        return
      }

      rafRef.current = requestAnimationFrame(animate)
    }

    rafRef.current = requestAnimationFrame(animate)

    const timer = setTimeout(() => {
      stoppingRef.current = true
    }, stopDelay)

    return () => {
      clearTimeout(timer)
      cancelAnimationFrame(rafRef.current)
    }
  }, [active])

  return (
    <div
      className="relative overflow-hidden rounded-2xl border border-border bg-secondary/50 shadow-inner"
      style={{ width: 64, height: CELL_H * VISIBLE }}
    >
      {/* 상하 그라데이션 마스크 */}
      <div className="absolute inset-x-0 top-0 h-10 z-10 pointer-events-none"
        style={{ background: 'linear-gradient(to bottom, hsl(var(--card)) 0%, transparent 100%)' }} />
      <div className="absolute inset-x-0 bottom-0 h-10 z-10 pointer-events-none"
        style={{ background: 'linear-gradient(to top, hsl(var(--card)) 0%, transparent 100%)' }} />

      {/* 중앙 선택 강조 */}
      <div className="absolute inset-x-0 z-0 border-y border-primary/25 bg-primary/5"
        style={{ top: CELL_H, height: CELL_H }} />

      {/* 숫자 열 */}
      <div
        className="absolute w-full"
        style={{
          transform: `translateY(-${translateY}px)`,
          transition: isSpinning ? 'none' : 'transform 0.15s cubic-bezier(0.23, 1, 0.32, 1)',
          willChange: 'transform',
        }}
      >
        {REEL_NUMS.map((n, i) => (
          <div
            key={i}
            className="flex items-center justify-center font-black tabular-nums"
            style={{ height: CELL_H, fontSize: 28, color: 'hsl(var(--foreground))' }}
          >
            {n}
          </div>
        ))}
      </div>

      {/* 정지 후 강조 표시 */}
      {displayValue !== null && (
        <div className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none">
          <span className="font-black text-3xl text-primary">{displayValue}</span>
        </div>
      )}
    </div>
  )
}

// ── 主组件 ────────────────────────────────────────────────────

interface Props {
  onComplete: (bonus: DailyBonus) => void
  onSkip: () => void
}

export function SlotMachine({ onComplete, onSkip }: Props) {
  const [phase, setPhase] = useState<'idle' | 'spinning' | 'done'>('idle')
  const [rolls, setRolls] = useState<number[]>([1, 1, 1])
  const [stoppedCount, setStoppedCount] = useState(0)
  const [saving, setSaving] = useState(false)

  const multiplier = phase === 'done' ? calcMultiplier(rolls) : null

  function handleSpin() {
    const r = rollThree()
    setRolls(r)
    setStoppedCount(0)
    setPhase('spinning')
  }

  function handleReelStop() {
    setStoppedCount(c => {
      const next = c + 1
      if (next === 3) setPhase('done')
      return next
    })
  }

  async function handleConfirm() {
    if (!multiplier) return
    setSaving(true)
    const today = new Date().toISOString().slice(0, 10)
    const bonus: DailyBonus = { date: today, rolls, multiplier }
    try {
      await api.bonus.save(bonus)
      onComplete(bonus)
    } finally {
      setSaving(false)
    }
  }

  const label =
    !multiplier ? '' :
    multiplier >= 2.5 ? '🔥 今天是大爆发日！' :
    multiplier >= 2.0 ? '✨ 今天状态不错！' :
    multiplier >= 1.5 ? '👍 稳扎稳打' :
                        '💪 平凡中见伟大'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-foreground/15 backdrop-blur-sm" />

      <div className="relative z-10 w-full max-w-sm mx-4 bg-card rounded-3xl border border-border shadow-2xl overflow-hidden">
        {/* 顶部彩色条 */}
        <div className="h-1 bg-gradient-to-r from-amber-300 via-orange-300 to-rose-300" />

        <div className="p-8 space-y-7">
          {/* 标题 */}
          <div className="text-center space-y-1">
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-widest">今日运势</p>
            <h2 className="text-xl font-bold">转动命运之轮</h2>
            <p className="text-xs text-muted-foreground">今天的奖励倍数由它决定</p>
          </div>

          {/* 三个滚轮 */}
          <div className="flex justify-center gap-3">
            {[0, 1, 2].map(i => (
              <Reel
                key={i}
                targetValue={rolls[i]}
                active={phase === 'spinning'}
                stopDelay={800 + i * 600}   // 依次停: 0.8s / 1.4s / 2.0s
                onStopped={handleReelStop}
              />
            ))}
          </div>

          {/* 倍数结果 */}
          <div className="text-center min-h-[72px] flex flex-col items-center justify-center">
            {phase === 'done' && multiplier ? (
              <div className="space-y-1 animate-in fade-in zoom-in-95 duration-300">
                <p className="text-xs text-muted-foreground">
                  ({rolls[0]} + {rolls[1]} + {rolls[2]}) ÷ 3 =
                </p>
                <p className="text-5xl font-black tracking-tight text-primary leading-none">
                  {multiplier}
                  <span className="text-xl font-bold text-muted-foreground ml-1">×</span>
                </p>
                <p className="text-xs text-muted-foreground mt-1">{label}</p>
              </div>
            ) : phase === 'spinning' ? (
              <p className="text-sm text-muted-foreground animate-pulse">转动中…</p>
            ) : (
              <p className="text-sm text-muted-foreground">点击下方开始转动</p>
            )}
          </div>

          {/* 按钮 */}
          <div className="space-y-2">
            {phase !== 'done' ? (
              <button
                onClick={handleSpin}
                disabled={phase === 'spinning'}
                className={cn(
                  'w-full h-12 rounded-2xl font-semibold text-sm transition-all',
                  phase === 'spinning'
                    ? 'bg-secondary text-muted-foreground cursor-not-allowed'
                    : 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm active:scale-[0.98]'
                )}
              >
                {phase === 'spinning' ? '转动中…' : '🎰  开始转动'}
              </button>
            ) : (
              <button
                onClick={handleConfirm}
                disabled={saving}
                className="w-full h-12 rounded-2xl font-semibold text-sm bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm active:scale-[0.98] transition-all"
              >
                {saving ? '保存中…' : `好的，今天 ${multiplier}× 出发！`}
              </button>
            )}
            <button
              onClick={onSkip}
              className="w-full h-8 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              跳过
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
