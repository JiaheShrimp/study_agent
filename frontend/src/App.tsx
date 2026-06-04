import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import { Dashboard } from '@/pages/Dashboard'
import { Wins } from '@/pages/Wins'
import { Plan } from '@/pages/Placeholder'
import { Tasks } from '@/pages/Tasks'
import { TasksManage } from '@/pages/TasksManage'
import { SlotMachine } from '@/components/SlotMachine'
import { api, type DailyBonus } from '@/lib/api'

export default function App() {
  const [showSlot, setShowSlot] = useState(false)
  const [bonus, setBonus] = useState<DailyBonus | null>(null)

  useEffect(() => {
    api.bonus.today().then(b => {
      if (b) {
        setBonus(b)
      } else {
        // 今天还没抽过，显示老虎机
        setShowSlot(true)
      }
    }).catch(() => {
      // 后端未就绪时静默忽略，不阻塞页面
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
