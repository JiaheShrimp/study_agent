import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import { Dashboard } from '@/pages/Dashboard'
import { Wins } from '@/pages/Wins'
import { Tasks, Plan } from '@/pages/Placeholder'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<Dashboard />} />
          <Route path="wins" element={<Wins />} />
          <Route path="tasks" element={<Tasks />} />
          <Route path="plan" element={<Plan />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
