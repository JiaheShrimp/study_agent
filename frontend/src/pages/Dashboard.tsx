import { Link } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { api, type DailyBonus } from '@/lib/api'
import { DayTimeline } from '@/components/DayTimeline'
import { StudyGoalCard } from '@/components/StudyGoalCard'

function greeting() {
  const h = new Date().getHours()
  if (h < 12) return '早上好'
  if (h < 18) return '下午好'
  return '晚上好'
}

export function Dashboard({ bonus }: { bonus: DailyBonus | null }) {
  const [totalScore, setTotalScore] = useState<number | null>(null)

  useEffect(() => {
    api.tasks.dailyScore().then(r => setTotalScore(r.total_score)).catch(() => setTotalScore(0))
  }, [])

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* 顶部问候 */}
      <div>
        <h2 className="text-2xl font-bold">{greeting()}，今天也要赢麻了 👋</h2>
        <p className="text-muted-foreground mt-1">
          {new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })}
        </p>
      </div>

      {/* 今日倍数卡片 */}
      {bonus && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 flex items-center gap-4">
          <div className="flex gap-2">
            {bonus.rolls.map((n, i) => (
              <div key={i} className="w-10 h-10 rounded-xl bg-white border border-amber-200 flex items-center justify-center font-black text-xl text-amber-600 shadow-sm">
                {n}
              </div>
            ))}
          </div>
          <div className="flex-1">
            <p className="text-xs text-amber-700/70 font-medium">今日倍数</p>
            <p className="text-2xl font-black text-amber-600 leading-tight">
              {bonus.multiplier.toFixed(1)}<span className="text-base font-bold text-amber-500 ml-0.5">×</span>
            </p>
          </div>
          <p className="text-xs text-amber-600/70 text-right max-w-[80px]">
            {bonus.multiplier >= 2.5 ? '🔥 大爆发日' :
             bonus.multiplier >= 2.0 ? '✨ 状态不错' :
             bonus.multiplier >= 1.5 ? '👍 稳扎稳打' : '💪 平凡见伟大'}
          </p>
        </div>
      )}

      {/* 今日学习目标（精简版） */}
      <StudyGoalCard compact />

      {/* 功能入口 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <FeatureCard to="/wins"  icon="🎉" label="赢麻了"  desc="记录今日进步" />
        <FeatureCard to="/tasks" icon="✅" label="每日任务" desc="查看与追踪"  />
        <FeatureCard to="/plan"  icon="📚" label="学习计划" desc="查看规划"    />
        <FeatureCard to="/wins"  icon="📊" label="分析"    desc="趋势与洞察"  />
      </div>

      {/* 今日时间轴 */}
      <DayTimeline />

      {/* 今日星星 */}
      {totalScore !== null && totalScore > 0 && (
        <div className="bg-card rounded-2xl border border-border px-5 py-4 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">今日获得</p>
            <p className="text-xs font-semibold text-amber-600">{totalScore} ★</p>
          </div>
          <div className="space-y-1">
            {Array.from({ length: Math.ceil(totalScore / 10) }).map((_, ri) => (
              <div key={ri} className="flex gap-0.5">
                {Array.from({ length: Math.min(10, totalScore - ri * 10) }).map((_, i) => (
                  <span key={i} className="text-amber-400 text-xl leading-none select-none">★</span>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function FeatureCard({ to, icon, label, desc }: { to: string; icon: string; label: string; desc: string }) {
  return (
    <Link to={to}>
      <Card className="h-full hover:border-primary/40 hover:shadow-md transition-all cursor-pointer">
        <CardContent className="p-4 flex flex-col gap-1">
          <span className="text-2xl">{icon}</span>
          <p className="font-medium text-sm">{label}</p>
          <p className="text-xs text-muted-foreground">{desc}</p>
        </CardContent>
      </Card>
    </Link>
  )
}
