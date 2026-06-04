import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { BottomNav } from './BottomNav'
import { type DailyBonus } from '@/lib/api'

interface Props {
  bonus: DailyBonus | null
}

export function AppLayout({ bonus }: Props) {
  return (
    <div className="flex min-h-screen bg-background flex-col">
      {/* 今日倍数条 */}
      {bonus && (
        <div className="sticky top-0 z-30 flex items-center justify-center gap-2 py-1.5 text-xs font-medium bg-amber-50 border-b border-amber-200 text-amber-800">
          <span className="text-sm">🎰</span>
          今日倍数
          <span className="font-black text-base text-amber-600">{bonus.multiplier}×</span>
          <span className="text-amber-500/70">（{bonus.rolls.join(' + ')}）</span>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-auto pb-16 md:pb-0">
          <Outlet />
        </main>
        <BottomNav />
      </div>
    </div>
  )
}
