import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import { Dashboard } from '@/pages/Dashboard'
import { Wins } from '@/pages/Wins'
import { Plan } from '@/pages/Placeholder'
import { Tasks } from '@/pages/Tasks'
import { Settings } from '@/pages/Settings'
import { SpinnerPage } from '@/pages/SpinnerPage'
import { SlotMachine } from '@/components/SlotMachine'
import { GoalSettlement } from '@/components/GoalSettlement'
import { api, type DailyBonus } from '@/lib/api'

export default function App() {
  const [showSlot, setShowSlot] = useState(false)
  const [bonus, setBonus] = useState<DailyBonus | null>(null)

  useEffect(() => {
    api.bonus.today().then(b => {
      if (b) {
        setBonus(b)
      } else {
        setShowSlot(true)
      }
    }).catch(() => {
      // 后端未就绪，不弹老虎机，等后端启动后再正常显示
    })
  }, [])

  function handleBonusComplete(b: DailyBonus) {
    setBonus(b)
    setShowSlot(false)
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout bonus={bonus} />}>
          <Route index element={<Dashboard bonus={bonus} />} />
          <Route path="wins" element={<Wins />} />
          <Route path="tasks" element={<Tasks />} />
          <Route path="plan" element={<Plan />} />
          <Route path="spinner" element={<SpinnerPage />} />
          <Route path="settings" element={<Settings />} />
        </Route>
      </Routes>

      {showSlot && (
        <SlotMachine
          onComplete={handleBonusComplete}
          onSkip={() => setShowSlot(false)}
        />
      )}

      {/* 老虎机关闭后再弹结算弹窗，避免两个弹窗叠在一起。
          常规任务不再单独弹窗——跟随学习时长的整段裁定（跳过=请假桥接 / 算中断=计失败）。 */}
      {!showSlot && <GoalSettlement onDone={() => window.dispatchEvent(new CustomEvent('agent:routines-refresh'))} />}
    </BrowserRouter>
  )
}
