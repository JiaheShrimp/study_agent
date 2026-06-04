import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Trophy, CheckSquare, BookOpen, Flame, Star, ArrowRight } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { api, type Win, type WinStats, type DailyBonus } from '@/lib/api'

const LEVEL_LABEL = { small: '小赢', medium: '中赢', big: '特大赢' }
const STARS = { small: '⭐', medium: '⭐⭐', big: '⭐⭐⭐' }

function today() {
  return new Date().toISOString().slice(0, 10)
}

function greeting() {
  const h = new Date().getHours()
  if (h < 12) return '早上好'
  if (h < 18) return '下午好'
  return '晚上好'
}

export function Dashboard({ bonus }: { bonus: DailyBonus | null }) {
  const [todayWins, setTodayWins] = useState<Win[]>([])
  const [stats, setStats] = useState<WinStats | null>(null)
  const [streak, setStreak] = useState(0)

  useEffect(() => {
    api.wins.forDate(today()).then(setTodayWins).catch(() => {})
    // 最近 30 天统计
    const start = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)
    api.wins.stats(start).then((s) => {
      setStats(s)
      setStreak(calcStreak(s.by_day))
    }).catch(() => {})
  }, [])

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* 顶部问候 */}
      <div className="mb-6">
        <h2 className="text-2xl font-bold">{greeting()}，今天也要赢麻了 👋</h2>
        <p className="text-muted-foreground mt-1">{new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })}</p>
      </div>

      {/* 今日倍数卡片 */}
      {bonus && (
        <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 flex items-center gap-4">
          <div className="flex gap-2">
            {bonus.rolls.map((n, i) => (
              <div key={i} className="w-10 h-10 rounded-xl bg-white border border-amber-200 flex items-center justify-center font-black text-xl text-amber-600 shadow-sm">
                {n}
              </div>
            ))}
          </div>
          <div className="flex-1">
            <p className="text-xs text-amber-700/70 font-medium">今日倍数</p>
            <p className="text-2xl font-black text-amber-600 leading-tight">{bonus.multiplier}<span className="text-base font-bold text-amber-500 ml-0.5">×</span></p>
          </div>
          <p className="text-xs text-amber-600/70 text-right max-w-[80px]">
            {bonus.multiplier >= 12 ? '🔥 大爆发日' :
             bonus.multiplier >= 9  ? '✨ 状态不错' :
             bonus.multiplier >= 6  ? '👍 稳扎稳打' : '💪 平凡见伟大'}
          </p>
        </div>
      )}

      {/* 统计卡片行 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <StatCard
          icon={<Trophy className="h-4 w-4 text-yellow-500" />}
          label="今日星数"
          value={`⭐ ×${todayWins.reduce((s, w) => s + w.stars, 0)}`}
        />
        <StatCard
          icon={<Flame className="h-4 w-4 text-orange-500" />}
          label="连续天数"
          value={`${streak} 天`}
        />
        <StatCard
          icon={<Star className="h-4 w-4 text-purple-500" />}
          label="本月总星数"
          value={`⭐ ×${stats?.total_stars ?? 0}`}
        />
        <StatCard
          icon={<CheckSquare className="h-4 w-4 text-green-500" />}
          label="本月记录"
          value={`${stats?.total ?? 0} 条`}
        />
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* 今日赢麻速览 */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">今日赢麻速览</CardTitle>
              <Link to="/wins">
                <Button variant="ghost" size="sm" className="text-xs gap-1">
                  查看全部 <ArrowRight className="h-3 w-3" />
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {todayWins.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground text-sm">
                <p>今天还没有记录</p>
                <Link to="/wins">
                  <Button className="mt-3" size="sm">准备开始赢麻了吗？</Button>
                </Link>
              </div>
            ) : (
              <ul className="space-y-2">
                {todayWins.slice(0, 4).map((w, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <span className="shrink-0">{STARS[w.win_level]}</span>
                    <span className="text-foreground">{w.content}</span>
                  </li>
                ))}
                {todayWins.length > 4 && (
                  <li className="text-xs text-muted-foreground">还有 {todayWins.length - 4} 条...</li>
                )}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* 功能入口卡片 */}
        <div className="grid grid-cols-2 gap-4">
          <FeatureCard to="/wins" icon="🎉" label="赢麻了" desc="记录今日进步" />
          <FeatureCard to="/tasks" icon="✅" label="每日任务" desc="今日待完成" />
          <FeatureCard to="/plan" icon="📚" label="学习计划" desc="查看规划" />
          <FeatureCard to="/wins" icon="📊" label="分析" desc="趋势与洞察" />
        </div>
      </div>
    </div>
  )
}

function StatCard({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-1">
          {icon}
          <span className="text-xs text-muted-foreground">{label}</span>
        </div>
        <p className="text-lg font-semibold">{value}</p>
      </CardContent>
    </Card>
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

function calcStreak(byDay: Record<string, number>): number {
  let streak = 0
  const d = new Date()
  while (true) {
    const key = d.toISOString().slice(0, 10)
    if (!byDay[key]) break
    streak++
    d.setDate(d.getDate() - 1)
  }
  return streak
}
