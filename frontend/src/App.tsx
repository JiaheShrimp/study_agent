import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import { Dashboard } from '@/pages/Dashboard'
import { Wins } from '@/pages/Wins'
import { Plan } from '@/pages/Placeholder'
import { Tasks } from '@/pages/Tasks'
import { TasksManage } from '@/pages/TasksManage'
import { Settings } from '@/pages/Settings'
import { SlotMachine } from '@/components/SlotMachine'
import { api, type DailyBonus } from '@/lib/api'

export default function App() {
  const [showSlot, setShowSlot] = useState(false)
  const [bonus, setBonus] = useState<DailyBonus | null>(null)

  useEffect(() => {
    // 8 点前不弹老虎机
    const hour = new Date().getHours()
    if (hour < 8) return

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
          <Route path="tasks/manage" element={<TasksManage />} />
          <Route path="plan" element={<Plan />} />
          <Route path="settings" element={<Settings />} />
        </Route>
      </Routes>

      {showSlot && (
        <SlotMachine
          onComplete={handleBonusComplete}
          onSkip={() => setShowSlot(false)}
        />
      )}
    </BrowserRouter>
  )
}
