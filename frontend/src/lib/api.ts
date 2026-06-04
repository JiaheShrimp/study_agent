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

export const api = {
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
