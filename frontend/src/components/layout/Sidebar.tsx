import { useEffect, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { LayoutDashboard, Trophy, CheckSquare, Disc3, Settings } from 'lucide-react'
// BookOpen 供「学习计划」入口使用，功能暂不推进，恢复时一并取消注释
import { cn } from '@/lib/utils'
import { api } from '@/lib/api'

const navItems = [
  { to: '/', icon: LayoutDashboard, label: '首页' },
  { to: '/wins', icon: Trophy, label: '赢麻了' },
  { to: '/tasks', icon: CheckSquare, label: '每日任务' },
  { to: '/spinner', icon: Disc3, label: '随机转盘' },
  // 学习计划功能暂不推进，先注释入口（恢复时把 BookOpen import 一并恢复）
  // { to: '/plan', icon: BookOpen, label: '学习计划' },
]

export function Sidebar() {
  const [aiAvailable, setAiAvailable] = useState<boolean | null>(null)

  useEffect(() => {
    api.ai.status().then(s => setAiAvailable(s.available)).catch(() => {})
  }, [])

  return (
    <aside className="hidden md:flex flex-col w-56 min-h-screen border-r bg-card px-3 py-6 shrink-0">
      <div className="px-3 mb-8">
        <h1 className="text-lg font-bold tracking-tight text-primary">Learning Agent</h1>
        <p className="text-xs text-muted-foreground mt-0.5">每天进步一点点</p>
      </div>
      <nav className="flex flex-col gap-1 flex-1">
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

      {/* 底部：设置入口 + AI 状态点 */}
      <NavLink
        to="/settings"
        className={({ isActive }) =>
          cn(
            'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors mt-2',
            isActive
              ? 'bg-accent text-accent-foreground'
              : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
          )
        }
      >
        <div className="relative">
          <Settings className="h-4 w-4 shrink-0" />
          {aiAvailable !== null && (
            <span className={cn(
              'absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full border border-card',
              aiAvailable ? 'bg-emerald-400' : 'bg-border'
            )} />
          )}
        </div>
        设置
        {aiAvailable && (
          <span className="ml-auto text-[10px] text-emerald-500 font-medium">AI ✦</span>
        )}
      </NavLink>
    </aside>
  )
}
