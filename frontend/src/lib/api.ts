export interface Win {
  id: string
  content: string
  win_level: 'small' | 'medium' | 'big' | 'future'
  stars: number
  created_at: string
}

export interface WinStats {
  total: number
  total_stars: number
  by_day: Record<string, number>
  by_level: { small: number; medium: number; big: number; future: number }
}

export type WinnableLevel = 'small' | 'medium' | 'big'

export interface Winnable {
  id: string
  content: string
  win_level: WinnableLevel
  created_date: string
  total_wins: number
  streak: number
  best_streak: number
  last_win_date: string | null
  won_today: boolean
}

export interface ArchivedWinnable {
  id: string
  content: string
  win_level: WinnableLevel
  created_date: string
  archived_date: string
  total_wins: number
  best_streak: number
}

export interface Spinner {
  id: string
  name: string
  items: string[]
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

export interface WorkRestConfig {
  work_mins: number
  rest_mins: number
}

export interface DailyStats {
  date: string
  effective_secs_actual: number
  effective_secs_planned: number
  excluded: boolean
  exclude_reason: string
  mode: string
}

export interface GoalResult {
  goal_secs: number          // 今日目标（秒）
  consecutive_hits: number   // 连续达标天数
  consecutive_fails: number  // 当前连续未达标天数
  fail_limit: number         // 触发降级的阈值
  step_mins: number          // 达标后增加的分钟数
  degrade_mins: number       // 降级减少的分钟数
  mode: string
}

export interface GoalSettings {
  step_mins: number
  fail_limit: number
  degrade_mins: number
  min_goal_mins: number
  goal_mins: number          // 重置/修改当前目标（分钟）
}

export interface RoutineTask {
  id: string
  content: string
  hours: number
  stars: number
  target_days: number
  created_date: string
  streak: number
  best_streak: number
  total_done: number
  last_done_date: string | null
  force_warning: boolean
  fail_days: number
  completed: boolean
}

export interface ArchivedRoutine {
  id: string
  content: string
  hours: number
  stars: number
  target_days: number
  created_date: string
  archived_date: string
  archive_reason: 'completed' | 'failed'
  total_done: number
  best_streak: number
}

export interface RoutineSettings {
  max_routines: number
  fail_days_limit: number
}

export interface RoutinesData {
  max_routines: number
  fail_days_limit: number
  routines: RoutineTask[]
}

// 漏打结算：某常规任务待结算的历史日期
export interface PendingRoutineDay {
  routine_id: string
  content: string
  days: string[]            // 升序排列的待结算日期
}

export interface RoutineSettleItem {
  day: string
  decision: 'excused' | 'missed'   // 请假 / 中断
  reason?: string
}

export interface ScoreBreakdown {
  base: number           // 基础分
  bonus_no_pause: number // 零暂停加成（0或1）
  bonus_few_pause: number
  bonus_rest_saved: number
  bonus_early: number
  multiplier: number     // 每日倍数
  total: number
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
  run_status?: 'none' | 'running_failed' | 'completed' | 'paused'
  count_in_effective: boolean
  keep?: boolean   // 保留任务：跨天保留，任意时候可执行
}

export interface BountyBuff {
  id: string
  name: string
  emoji: string
  desc: string
  type: string
  trigger: string
  coef: number
}

export interface DailyBounty {
  id: string
  content: string
  hours: number
  stars: number
  buff: BountyBuff
  status: 'pending' | 'accepted' | 'done' | 'expired'
  popup_at: string   // ISO datetime
  ai_generated?: boolean
  reason?: string    // AI 派发这条任务的理由（搭子口吻）
}

export interface AIProviderMeta {
  id: string
  label: string
  hint_model: string
  hint_key: string
  needs_base_url: boolean
}

export interface AIStatus {
  available: boolean
  provider: string
  key_set: boolean
  model: string
  custom_base_url: string
  providers: AIProviderMeta[]
}

// 搭子对话历史的一条
export interface DialogueTurn {
  id: string
  role: 'user' | 'assistant'
  content: string
  trigger: string
  at: string
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
    dailyDates: () => get<string[]>('/tasks/daily/dates'),
    daily: (date?: string) => get<DailyTask[]>(`/tasks/daily${date ? `?date=${date}` : ''}`),
    initDaily: () => post<DailyTask[]>('/tasks/daily/init', {}),
    addDaily: (t: { content: string; hours: number; stars: number; count_in_effective: boolean; keep: boolean }) =>
      post<DailyTask>('/tasks/daily', t),
    updateDaily: (id: string, t: { content: string; hours: number; stars: number; count_in_effective: boolean; keep: boolean }) =>
      post<DailyTask>(`/tasks/daily/${id}`, t, 'PUT'),
    toggleDone: (id: string) => post<DailyTask>(`/tasks/daily/${id}/done`, {}, 'PATCH'),
    deleteDaily: (id: string) => del(`/tasks/daily/${id}`),
    // 每日赏金（新系统：内容从历史抽取，buff 系统随机）
    dailyBounties: () => get<DailyBounty[]>('/tasks/bounty/daily'),
    generateBounties: () => post<DailyBounty[]>('/tasks/bounty/daily/generate', {}),
    pendingBounties: () => get<DailyBounty[]>('/tasks/bounty/daily/pending'),
    respondBounty: (id: string, status: 'accepted' | 'expired') =>
      post<DailyBounty>(`/tasks/bounty/daily/${id}?status=${status}`, {}, 'PATCH'),
    completeBounty: (id: string) =>
      post<DailyBounty>(`/tasks/bounty/daily/${id}/done`, {}, 'PATCH'),
    saveRun: (r: {
      task_id: string; task_content: string; date: string; success: boolean
      started_at: string; ended_at: string
      actual_seconds: number; pause_count: number; pause_seconds: number
      task_hours: number; task_stars: number
      end_reason: string; rest_remaining_secs: number; multiplier: number
      source?: string
    }) => post<{ score: number; score_breakdown: ScoreBreakdown }>('/tasks/run', r),
    runs: (date?: string) => get<{
      task_id: string; task_content: string; date: string; success: boolean
      started_at: string; ended_at: string
      actual_seconds: number; pause_count: number; pause_seconds: number
      task_hours: number; end_reason?: string; score?: number; source?: string
      count_in_effective?: boolean
    }[]>(`/tasks/runs${date ? `?date=${date}` : ''}`),
    dailyScore: (date?: string) => get<{ date: string; total_score: number }>(
      `/tasks/daily-score${date ? `?date=${date}` : ''}`
    ),
    updateRunTime: (taskId: string, date: string, startedAt: string) =>
      post<{ ok: boolean }>('/tasks/run/time', { task_id: taskId, date, started_at: startedAt }, 'PATCH'),
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
  workRest: {
    get: () => get<WorkRestConfig>('/config/work-rest'),
    update: (cfg: WorkRestConfig) =>
      post<WorkRestConfig>('/config/work-rest', cfg, 'PUT'),
  },
  effectiveTimeMode: {
    get: () => get<{ mode: string }>('/config/effective-time-mode'),
    update: (mode: string) =>
      post<{ mode: string }>('/config/effective-time-mode', { mode }, 'PUT'),
  },
  study: {
    historyStats: (days: number) =>
      get<{ date: string; effective_secs: number; score: number; excluded: boolean }[]>(
        `/tasks/history-stats?days=${days}`
      ),
    dailyStats: (date?: string) =>
      get<DailyStats>(`/tasks/daily-stats${date ? `?date=${date}` : ''}`),
    setExclude: (reason: string, date?: string) =>
      post<DailyStats>(`/tasks/daily-stats/exclude${date ? `?date=${date}` : ''}`, { reason }),
    goal: () => get<GoalResult>('/tasks/goal'),
    updateGoalSettings: (s: GoalSettings) =>
      post<GoalResult>('/tasks/goal/settings', s, 'PUT'),
  },
  routines: {
    get: () => get<RoutinesData>('/tasks/routines'),
    updateSettings: (s: { fail_days_limit: number }) =>
      post<RoutineSettings>('/tasks/routines/settings', s, 'PUT'),
    create: (r: { content: string; hours: number; stars: number; target_days: number }) =>
      post<RoutineTask>('/tasks/routines', r),
    delete: (id: string) => del(`/tasks/routines/${id}`),
    toggleDone: (id: string, date?: string) =>
      post<RoutineTask>(`/tasks/routines/${id}/done${date ? `?date=${date}` : ''}`, {}, 'PATCH'),
    archived: () => get<ArchivedRoutine[]>('/tasks/routines/archived'),
    restart: (id: string) => post<RoutineTask>(`/tasks/routines/${id}/restart`, {}),
    pendingSettlement: () => get<PendingRoutineDay[]>('/tasks/routines/pending-settlement'),
    settle: (id: string, items: RoutineSettleItem[]) =>
      post<RoutineTask>(`/tasks/routines/${id}/settle`, items),
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
    // 可赢目标：挂在页面上的「未来可赢」，点一下赢一次
    winnables: () => get<Winnable[]>('/wins/winnables'),
    createWinnable: (content: string, win_level: WinnableLevel) =>
      post<Winnable>('/wins/winnables', { content, win_level }),
    winWinnable: (id: string) => post<Winnable>(`/wins/winnables/${id}/win`, {}),
    archiveWinnable: (id: string) => post<ArchivedWinnable>(`/wins/winnables/${id}/archive`, {}),
    archivedWinnables: () => get<ArchivedWinnable[]>('/wins/winnables/archived'),
    deleteWinnable: (id: string) => del(`/wins/winnables/${id}`),
  },
  ai: {
    status: () => get<AIStatus>('/ai/status'),
    setConfig: (cfg: { provider: string; api_key: string; model?: string; custom_base_url?: string }) =>
      post<{ ok: boolean; available: boolean }>('/ai/config', { model: '', custom_base_url: '', ...cfg }, 'PUT'),
    // 搭子对话：聊天栏轮询拉取历史 + 用户主动发消息
    dialogue: (limit = 50) => get<DialogueTurn[]>(`/ai/dialogue?limit=${limit}`),
    chat: (message: string) =>
      post<{ reply: DialogueTurn; assigned_bounty: boolean; bounty_content: string }>('/ai/chat', { message }),
  },
  spinner: {
    list: () => get<Spinner[]>('/spinner'),
    create: (name: string, items: string[]) => post<Spinner>('/spinner', { name, items }),
    update: (id: string, name: string, items: string[]) => post<Spinner>(`/spinner/${id}`, { name, items }, 'PUT'),
    delete: (id: string) => del(`/spinner/${id}`),
    spin: (id: string) => post<{ result: string }>(`/spinner/${id}/spin`, {}),
  },
}
