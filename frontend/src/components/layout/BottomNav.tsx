import { NavLink } from 'react-router-dom'
import { LayoutDashboard, Trophy, CheckSquare, Disc3, Settings } from 'lucide-react'
import { cn } from '@/lib/utils'

const navItems = [
  { to: '/', icon: LayoutDashboard, label: '首页' },
  { to: '/wins', icon: Trophy, label: '赢麻了' },
  { to: '/tasks', icon: CheckSquare, label: '任务' },
  { to: '/spinner', icon: Disc3, label: '转盘' },
  { to: '/settings', icon: Settings, label: '设置' },
]

export function BottomNav() {
  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 border-t bg-card z-40">
      <div className="flex">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              cn(
                'flex flex-1 flex-col items-center gap-1 py-3 text-xs font-medium transition-colors',
                isActive ? 'text-primary' : 'text-muted-foreground'
              )
            }
          >
            <Icon className="h-5 w-5" />
            {label}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
