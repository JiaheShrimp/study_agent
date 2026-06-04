import { NavLink } from 'react-router-dom'
import { LayoutDashboard, Trophy, CheckSquare, BookOpen } from 'lucide-react'
import { cn } from '@/lib/utils'

const navItems = [
  { to: '/', icon: LayoutDashboard, label: '首页' },
  { to: '/wins', icon: Trophy, label: '赢麻了' },
  { to: '/tasks', icon: CheckSquare, label: '每日任务' },
  { to: '/plan', icon: BookOpen, label: '学习计划' },
]

export function Sidebar() {
  return (
    <aside className="hidden md:flex flex-col w-56 min-h-screen border-r bg-card px-3 py-6 shrink-0">
      <div className="px-3 mb-8">
        <h1 className="text-lg font-bold tracking-tight text-primary">Learning Agent</h1>
        <p className="text-xs text-muted-foreground mt-0.5">每天进步一点点</p>
      </div>
      <nav className="flex flex-col gap-1">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                isActive
                  ? 'bg-accent text-accent-foreground'
                  : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
              )
            }
          >
            <Icon className="h-4 w-4 shrink-0" />
            {label}
          </NavLink>
        ))}
      </nav>
    </aside>
  )
}
