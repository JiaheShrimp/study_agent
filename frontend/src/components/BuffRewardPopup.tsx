import { useEffect, useState } from 'react'
import { Sparkles, X } from 'lucide-react'
import { api, type BuffReward } from '@/lib/api'
import { playBountyAppear } from '@/lib/sounds'

const POLL_INTERVAL = 30_000

function taskTypeLabel(type: string) {
  if (type === 'routine') return '常规任务'
  if (type === 'kept') return '保留任务'
  return '每日任务'
}

export function BuffRewardPopup() {
  const [rewards, setRewards] = useState<BuffReward[]>([])
  const [open, setOpen] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function check() {
      const list = await api.tasks.pendingBuffRewards().catch(() => [] as BuffReward[])
      if (cancelled || !list.length) return
      setRewards(list)
      setOpen(true)
      playBountyAppear()
    }

    check()
    const timer = window.setInterval(check, POLL_INTERVAL)
    const onTaskDone = () => {
      window.setTimeout(check, 500)
      window.setTimeout(check, 1800)
    }
    window.addEventListener('agent:buff-reward-refresh', onTaskDone)
    window.addEventListener('agent:dialogue-refresh', onTaskDone)

    return () => {
      cancelled = true
      window.clearInterval(timer)
      window.removeEventListener('agent:buff-reward-refresh', onTaskDone)
      window.removeEventListener('agent:dialogue-refresh', onTaskDone)
    }
  }, [])

  async function close() {
    const ids = rewards.map(r => r.id)
    setOpen(false)
    setRewards([])
    await Promise.all(ids.map(id => api.tasks.revealBuffReward(id).catch(() => null)))
  }

  if (!open || rewards.length === 0) return null

  return (
    <div className="fixed inset-0 z-[56] flex items-center justify-center">
      <div className="absolute inset-0 bg-foreground/15 backdrop-blur-sm" onClick={close} />
      <div className="relative z-10 w-full max-w-md mx-4 bg-card rounded-3xl border border-border shadow-2xl overflow-hidden">
        <div className="h-1.5 bg-gradient-to-r from-amber-300 via-yellow-300 to-emerald-300" />
        <div className="p-6 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-widest">Buff 揭露</p>
                <h2 className="text-lg font-bold mt-1">AI 顺手给你塞了点加成</h2>
              </div>
            </div>
            <button onClick={close} className="text-muted-foreground hover:text-foreground mt-1">
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="space-y-3 max-h-[56vh] overflow-y-auto">
            {rewards.map(r => (
              <div key={r.id} className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4 space-y-3">
                <div>
                  <p className="text-[11px] text-amber-700 font-medium">{taskTypeLabel(r.task_type)}</p>
                  <p className="text-sm font-semibold leading-snug mt-0.5">{r.task_content}</p>
                </div>
                <div className="flex items-center gap-3 rounded-xl bg-amber-100 px-3 py-2">
                  <span className="text-2xl leading-none">{r.buff.emoji}</span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-amber-900">{r.buff.name}</p>
                    <p className="text-xs text-amber-800 leading-snug mt-0.5">{r.buff.desc}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <button onClick={close}
            className="w-full h-10 rounded-xl bg-amber-500 text-white text-sm font-semibold hover:bg-amber-600 transition-colors">
            收下
          </button>
        </div>
      </div>
    </div>
  )
}
