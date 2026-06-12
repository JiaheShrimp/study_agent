import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// 游戏日边界：00:00-07:59 属于前一天，与后端 _current_game_date() 对齐
export function gameToday(): string {
  const now = new Date()
  if (now.getHours() < 8) {
    const yesterday = new Date(now)
    yesterday.setDate(yesterday.getDate() - 1)
    return yesterday.toISOString().slice(0, 10)
  }
  return now.toISOString().slice(0, 10)
}
