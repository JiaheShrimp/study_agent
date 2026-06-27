import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { BottomNav } from './BottomNav'
import { ChatSidebar } from '@/components/ChatSidebar'
import { BountyPopup } from '@/components/BountyPopup'
import { BuffRewardPopup } from '@/components/BuffRewardPopup'
import { type DailyBonus } from '@/lib/api'

interface Props {
  bonus: DailyBonus | null
}

export function AppLayout({ bonus }: Props) {
  return (
    <div className="flex h-screen bg-background flex-col overflow-hidden">
      {/* 今日倍数条 */}
      {bonus && (
        <div className="shrink-0 z-30 flex items-center justify-center gap-2 py-1.5 text-xs font-medium bg-amber-50 border-b border-amber-200 text-amber-800">
          <span className="text-sm">🎰</span>
          今日倍数
          <span className="font-black text-base text-amber-600">{bonus.multiplier.toFixed(1)}×</span>
          {!!bonus.dice_bonus && (
            <span className="rounded-full bg-white/70 px-2 py-0.5 text-[11px] text-amber-700">
              骰子 +{bonus.dice_bonus}
            </span>
          )}
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        {/* 搭子聊天栏：全局唯一，常驻左侧（导航之后、主内容之前；手机端为可收起浮层） */}
        <ChatSidebar />
        <main className="flex-1 overflow-auto pb-16 md:pb-0">
          <Outlet />
        </main>
        <BottomNav />
      </div>

      {/* 全局赏金弹窗：随机/搭子派的赏金在任意页面都能弹出 */}
      <BountyPopup />
      <BuffRewardPopup />
    </div>
  )
}
