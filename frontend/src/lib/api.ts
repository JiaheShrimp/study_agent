export interface Win {
  id: string
  content: string
  win_level: 'small' | 'medium' | 'big'
  stars: number
  created_at: string
}

export interface WinStats {
  total: number
  total_stars: number
  by_day: Record<string, number>
  by_level: { small: number; medium: number; big: number }
}

const BASE = '/api'

async function get<T>(path: string): Promise<T> {
  const res = await fetch(BASE + path)
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

async function del(path: string): Promise<void> {
  const res = await fetch(BASE + path, { method: 'DELETE' })
  if (!res.ok) throw new Error(await res.text())
}

async function post<T>(path: string, body: unknown, method = 'POST'): Promise<T> {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export interface ReminderConfig {
  reminder_enabled: boolean
  reminder_times: string[]
}

export interface DailyBonus {
  date: string
  rolls: number[]
  multiplier: number  // 1.0-3.0，一位小数
}

export interface TaskTemplate {
  id: string
  content: string
  hours: number
  stars: number
}

export interface DailyTask {
  id: string
  content: string
  hours: number
  stars: number
  done: boolean
  from_template: boolean
}

export interface BountyTask {
  id: string
  content: string
  hours: number
  stars: number
  buff: string
}

export interface DailyBounty extends BountyTask {
  status: 'pending' | 'accepted' | 'skipped'
}

export const api = {
  tasks: {
    // 模板
    templates: () => get<TaskTemplate[]>('/tasks/templates'),
    createTemplate: (t: Omit<TaskTemplate, 'id'>) => post<TaskTemplate>('/tasks/templates', t),
    updateTemplate: (id: string, t: Omit<TaskTemplate, 'id'>) =>
      post<TaskTemplate>(`/tasks/templates/${id}`, t, 'PUT'),
    deleteTemplate: (id: string) => del(`/tasks/templates/${id}`),
    // 当日任务
    daily: (date?: string) => get<DailyTask[]>(`/tasks/daily${date ? `?date=${date}` : ''}`),
    initDaily: () => post<DailyTask[]>('/tasks/daily/init', {}),
    addDaily: (t: { content: string; hours: number; stars: number }) =>
      post<DailyTask>('/tasks/daily', t),
    updateDaily: (id: string, t: { content: string; hours: number; stars: number }) =>
      post<DailyTask>(`/tasks/daily/${id}`, t, 'PUT'),
    toggleDone: (id: string) => post<DailyTask>(`/tasks/daily/${id}/done`, {}, 'PATCH'),
    deleteDaily: (id: string) => del(`/tasks/daily/${id}`),
    // 赏金任务库
    bountyPool: () => get<BountyTask[]>('/tasks/bounty/pool'),
    createBounty: (b: Omit<BountyTask, 'id'>) => post<BountyTask>('/tasks/bounty/pool', b),
    updateBounty: (id: string, b: Omit<BountyTask, 'id'>) =>
      post<BountyTask>(`/tasks/bounty/pool/${id}`, b, 'PUT'),
    deleteBounty: (id: string) => del(`/tasks/bounty/pool/${id}`),
    // 每日赏金
    dailyBounties: () => get<DailyBounty[]>('/tasks/bounty/daily'),
    generateBounties: () => post<DailyBounty[]>('/tasks/bounty/daily/generate', {}),
    respondBounty: (id: string, status: 'accepted' | 'skipped') =>
      post<DailyBounty>(`/tasks/bounty/daily/${id}?status=${status}`, {}, 'PATCH'),
    saveRun: (r: { task_id: string; date: string; success: boolean; actual_seconds: number; pause_count: number; pause_seconds: number }) =>
      post<typeof r>('/tasks/run', r),
  },
  bonus: {
    today: () => get<DailyBonus | null>('/bonus/today'),
    save: (bonus: DailyBonus) => post<DailyBonus>('/bonus/today', bonus),
  },
  reminder: {
    get: () => get<ReminderConfig>('/config/reminder'),
    update: (cfg: ReminderConfig) =>
      post<ReminderConfig>('/config/reminder', cfg, 'PUT'),
  },
  wins: {
    list: () => get<Win[]>('/wins/'),
    byDate: () => get<Record<string, Win[]>>('/wins/by-date'),
    forDate: (day: string) => get<Win[]>(`/wins/date/${day}`),
    create: (content: string, win_level: Win['win_level']) =>
      post<Win>('/wins/', { content, win_level }),
    stats: (start?: string, end?: string) => {
      const params = new URLSearchParams()
      if (start) params.set('start', start)
      if (end) params.set('end', end)
      return get<WinStats>(`/wins/stats?${params}`)
    },
    delete: (id: string) => del(`/wins/${id}`),
  },
}
