import { useEffect, useRef, useState } from 'react'
import { api, type DailyBonus } from '@/lib/api'
import { cn } from '@/lib/utils'

// ── 概率表：1最多，5极少 ──────────────────────────────────────
const WEIGHTS = [0, 40, 28, 18, 9, 5] // index = 数字，权重之和 = 100
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

// ── 单个滚轮 ──────────────────────────────────────────────────
const CELL_H = 72 // px，每个数字格子高度

function Reel({
  finalValue,
  spinning,
  delay,
  onStop,
}: {
  finalValue: number
  spinning: boolean
  delay: number
  onStop?: () => void
}) {
  const [offset, setOffset] = useState(0)
  const [stopped, setStopped] = useState(false)
  const rafRef = useRef<number>(0)
  const startRef = useRef<number>(0)
  const SPIN_DURATION = 1200 // ms 滚动时长（不含 delay）

  useEffect(() => {
    if (!spinning) {
      setStopped(false)
      setOffset(0)
      return
    }

    let started = false
    const totalDist = CELL_H * (20 + finalValue) // 先多滚几圈再停到目标

    const timer = setTimeout(() => {
      started = true
      startRef.current = performance.now()

      function animate(now: number) {
        const elapsed = now - startRef.current
        const progress = Math.min(elapsed / SPIN_DURATION, 1)
        // easeOutCubic 让末尾有减速感
        const eased = 1 - Math.pow(1 - progress, 3)
        setOffset((totalDist * eased) % (CELL_H * 5))

        if (progress < 1) {
          rafRef.current = requestAnimationFrame(animate)
        } else {
          setStopped(true)
          onStop?.()
        }
      }
      rafRef.current = requestAnimationFrame(animate)
    }, delay)

    return () => {
      clearTimeout(timer)
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [spinning, finalValue, delay])

  // 生成足够多的数字填充滚轮（循环）
  const visibleNums = Array.from({ length: 9 }, (_, i) => ((i) % 5) + 1)

  return (
    <div className="relative w-16 h-[72px] overflow-hidden rounded-xl border border-border bg-secondary/60 shadow-inner">
      {/* 渐变遮罩上下 */}
      <div className="absolute inset-x-0 top-0 h-5 z-10 bg-gradient-to-b from-card to-transparent pointer-events-none" />
      <div className="absolute inset-x-0 bottom-0 h-5 z-10 bg-gradient-to-t from-card to-transparent pointer-events-none" />
      {/* 中间高亮线 */}
      <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-[72px] border-y border-primary/20 bg-primary/5 z-0" />

      {/* 数字列 */}
      <div
        className="absolute w-full transition-none"
        style={{ transform: `translateY(-${offset}px)` }}
      >
        {visibleNums.map((n, i) => (
          <div
            key={i}
            className="flex items-center justify-center font-bold text-2xl tabular-nums"
            style={{ height: CELL_H }}
          >
            {stopped ? (
              <span className="text-primary">{finalValue}</span>
            ) : (
              <span className="text-foreground/70">{n}</span>
            )}
          </div>
        ))}
      </div>
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
  const [rolls, setRolls] = useState<number[]>([0, 0, 0])
  const [stoppedCount, setStoppedCount] = useState(0)
  const [saving, setSaving] = useState(false)

  const multiplier = rolls.reduce((a, b) => a + b, 0)

  function handleSpin() {
    const r = rollThree()
    setRolls(r)
    setStoppedCount(0)
    setPhase('spinning')
  }

  function handleReelStop() {
    setStoppedCount(c => c + 1)
  }

  // 三个轮都停了 → 保存结果
  useEffect(() => {
    if (stoppedCount < 3 || phase !== 'spinning') return
    setPhase('done')
  }, [stoppedCount, phase])

  async function handleConfirm() {
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* 背景 */}
      <div className="absolute inset-0 bg-foreground/20 backdrop-blur-sm" />

      {/* 卡片 */}
      <div className="relative z-10 w-full max-w-sm mx-4 bg-card rounded-3xl border border-border shadow-2xl overflow-hidden">

        {/* 顶部装饰条 */}
        <div className="h-1.5 bg-gradient-to-r from-amber-300 via-orange-400 to-rose-400" />

        <div className="p-8 space-y-7">
          {/* 标题 */}
          <div className="text-center space-y-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-widest">今日运势</p>
            <h2 className="text-xl font-bold tracking-tight">转动命运之轮</h2>
            <p className="text-xs text-muted-foreground">今天的奖励倍数由它决定</p>
          </div>

          {/* 三个滚轮 */}
          <div className="flex justify-center gap-3">
            {[0, 1, 2].map(i => (
              <Reel
                key={i}
                finalValue={rolls[i] || 1}
                spinning={phase === 'spinning'}
                delay={i * 400}
                onStop={handleReelStop}
              />
            ))}
          </div>

          {/* 倍数展示 */}
          <div className="text-center">
            {phase === 'done' ? (
              <div className="space-y-1 animate-in fade-in zoom-in-95 duration-300">
                <p className="text-xs text-muted-foreground">
                  {rolls[0]} + {rolls[1]} + {rolls[2]} =
                </p>
                <p className="text-5xl font-black tracking-tight text-primary">
                  {multiplier}
                  <span className="text-2xl font-bold text-muted-foreground ml-1">×</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  {multiplier >= 12 ? '🔥 今天是大爆发日！' :
                   multiplier >= 9  ? '✨ 今天状态不错！' :
                   multiplier >= 6  ? '👍 稳扎稳打' :
                                      '💪 平凡中见伟大'}
                </p>
              </div>
            ) : phase === 'spinning' ? (
              <p className="text-sm text-muted-foreground animate-pulse">转动中…</p>
            ) : (
              <p className="text-sm text-muted-foreground">点击转动，看看今天的倍数</p>
            )}
          </div>

          {/* 按钮区 */}
          <div className="space-y-2">
            {phase !== 'done' ? (
              <button
                onClick={handleSpin}
                disabled={phase === 'spinning'}
                className={cn(
                  'w-full h-11 rounded-xl font-semibold text-sm transition-all',
                  phase === 'spinning'
                    ? 'bg-secondary text-muted-foreground cursor-not-allowed'
                    : 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm active:scale-[0.98]'
                )}
              >
                {phase === 'spinning' ? '转动中…' : '🎰 开始转动'}
              </button>
            ) : (
              <button
                onClick={handleConfirm}
                disabled={saving}
                className="w-full h-11 rounded-xl font-semibold text-sm bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm active:scale-[0.98] transition-all"
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
