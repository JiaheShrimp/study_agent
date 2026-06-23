import { useEffect, useMemo, useState } from 'react'
import { CalendarX, X } from 'lucide-react'
import { api, type PendingRoutineDay, type RoutineSettleItem } from '@/lib/api'
import { cn } from '@/lib/utils'

// 漏打结算弹窗：下次打开 app 时，对每个常规任务、逐天提示用户结算。
// 「正当请假」→ 桥接连续天数，不计入失败；「确认中断」→ 计为失败。
// 全部结算完成后调用 onDone（用于刷新常规任务列表）。

type QueueItem = { routine_id: string; content: string; day: string }

export function RoutineSettlement({ onDone }: { onDone?: () => void }) {
  const [pending, setPending] = useState<PendingRoutineDay[] | null>(null)
  const [idx, setIdx] = useState(0)
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  // 累积每个任务的结算项，待该任务全部日期处理完后一次性提交
  const [buffer, setBuffer] = useState<Record<string, RoutineSettleItem[]>>({})

  useEffect(() => {
    api.routines.pendingSettlement()
      .then(p => setPending(p.filter(x => x.days.length > 0)))
      .catch(() => setPending([]))
  }, [])

  // 把所有任务的待结算日期摊平成一个队列
  const queue = useMemo<QueueItem[]>(() => {
    if (!pending) return []
    const q: QueueItem[] = []
    for (const p of pending) {
      for (const d of p.days) {
        q.push({ routine_id: p.routine_id, content: p.content, day: d })
      }
    }
    return q
  }, [pending])

  if (!pending || queue.length === 0) return null
  if (idx >= queue.length) return null

  const cur = queue[idx]
  // 当前任务还剩几天待结算（含当前这天）
  const remainForRoutine = queue
    .slice(idx)
    .filter(q => q.routine_id === cur.routine_id).length

  async function decide(decision: 'excused' | 'missed') {
    if (saving) return
    const item: RoutineSettleItem = { day: cur.day, decision, reason: reason.trim() }
    const nextBuffer = {
      ...buffer,
      [cur.routine_id]: [...(buffer[cur.routine_id] || []), item],
    }

    // 判断当前任务是否处理完（下一项不是同一任务，或已到队尾）
    const next = queue[idx + 1]
    const routineFinished = !next || next.routine_id !== cur.routine_id

    if (routineFinished) {
      setSaving(true)
      try {
        await api.routines.settle(cur.routine_id, nextBuffer[cur.routine_id])
      } catch {
        // 失败也继续，避免卡住用户；下次打开仍会再次提示
      } finally {
        setSaving(false)
      }
      // 该任务已提交，从 buffer 移除
      const cleaned = { ...nextBuffer }
      delete cleaned[cur.routine_id]
      setBuffer(cleaned)
    } else {
      setBuffer(nextBuffer)
    }

    setReason('')
    const nextIdx = idx + 1
    setIdx(nextIdx)
    if (nextIdx >= queue.length) onDone?.()
  }

  const fmt = (d: string) => {
    const dt = new Date(d + 'T00:00:00')
    const w = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][dt.getDay()]
    return `${dt.getMonth() + 1} 月 ${dt.getDate()} 日 · ${w}`
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-foreground/15 backdrop-blur-sm" />
      <div className="relative z-10 w-80 bg-card rounded-3xl border border-border shadow-2xl overflow-hidden">
        <div className="h-1 bg-gradient-to-r from-violet-400 to-purple-500" />
        <div className="p-6 space-y-4">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2">
              <CalendarX className="h-5 w-5 text-violet-500" />
              <div>
                <h2 className="text-base font-semibold">漏打结算</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  还剩 {queue.length - idx} 天待处理
                </p>
              </div>
            </div>
            <button
              onClick={() => { setIdx(queue.length); onDone?.() }}
              className="text-muted-foreground hover:text-foreground"
              title="稍后处理"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="rounded-2xl bg-violet-50 border border-violet-100 px-4 py-3">
            <p className="text-sm font-semibold text-violet-700">{cur.content}</p>
            <p className="text-xs text-violet-500 mt-1">{fmt(cur.day)} 没有打卡</p>
            {remainForRoutine > 1 && (
              <p className="text-[11px] text-violet-400 mt-1">
                此习惯还有 {remainForRoutine - 1} 天待结算
              </p>
            )}
          </div>

          <input
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder="请假理由（可选，如「放假」「生病」）"
            className="w-full h-9 rounded-xl border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring/40"
          />

          <div className="flex gap-2 pt-1">
            <button
              onClick={() => decide('missed')}
              disabled={saving}
              className={cn(
                'flex-1 h-9 rounded-2xl border border-border text-sm text-muted-foreground',
                'hover:bg-secondary transition-colors disabled:opacity-40'
              )}
            >
              算作中断
            </button>
            <button
              onClick={() => decide('excused')}
              disabled={saving}
              className={cn(
                'flex-1 h-9 rounded-2xl bg-violet-500 text-white text-sm font-medium',
                'hover:bg-violet-600 transition-colors disabled:opacity-40'
              )}
            >
              正当请假
            </button>
          </div>
          <p className="text-[11px] text-muted-foreground text-center">
            请假的日子不计入连续失败，连续天数保持不断
          </p>
        </div>
      </div>
    </div>
  )
}
