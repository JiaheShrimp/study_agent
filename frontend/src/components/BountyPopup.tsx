import { useEffect, useRef, useState } from 'react'
import { Swords, X, Clock, Star, MessageCircle } from 'lucide-react'
import { api, type DailyBounty } from '@/lib/api'
import { playBountyAppear } from '@/lib/sounds'

// ─────────────────────────────────────────────────────────────
// 全局赏金弹窗
//
// 赏金任务（随机弹出 / 搭子在聊天里派的）可能在**任意页面**产生，所以这个弹窗
// 必须全局常驻（挂在 AppLayout），而不是只活在每日任务页——否则在别的页面让
// 搭子派任务，任务真的派了却没人提示你。
//
// 职责：轮询 pending 赏金 + 监听 agent:bounty-refresh（聊天派任务后触发）→
// 有新赏金就弹窗 + 音效。接受/放弃就地处理。
// ─────────────────────────────────────────────────────────────

const POLL_INTERVAL = 60_000

export function BountyPopup() {
  const [pending, setPending] = useState<DailyBounty[]>([])
  const [open, setOpen] = useState(false)
  // 本会话已弹过的赏金 id，避免重复弹
  const shownIds = useRef<Set<string>>(new Set())

  useEffect(() => {
    function check() {
      // 只在「今天」有意义；游戏日以零点为界
      api.tasks.pendingBounties().then(list => {
        if (!list.length) return
        const fresh = list.filter(b => !shownIds.current.has(b.id))
        setPending(prev => {
          const ids = new Set(prev.map(b => b.id))
          return [...prev.filter(b => list.some(l => l.id === b.id)), ...list.filter(b => !ids.has(b.id))]
        })
        if (fresh.length) {
          fresh.forEach(b => shownIds.current.add(b.id))
          setOpen(true)
          playBountyAppear()
        }
      }).catch(() => {})
    }

    check()
    const timer = window.setInterval(check, POLL_INTERVAL)
    // 聊天里搭子派了任务 → 立即多刷几次，覆盖落地的几百毫秒
    const onBounty = () => {
      check()
      window.setTimeout(check, 800)
      window.setTimeout(check, 2000)
    }
    // 任务页「赏金 N」按钮主动要求打开 → 拉取当前 pending 并强制弹出
    const onOpen = () => {
      api.tasks.pendingBounties().then(list => {
        if (list.length) { setPending(list); setOpen(true) }
      }).catch(() => {})
    }
    window.addEventListener('agent:bounty-refresh', onBounty)
    window.addEventListener('agent:bounty-open', onOpen)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('agent:bounty-refresh', onBounty)
      window.removeEventListener('agent:bounty-open', onOpen)
    }
  }, [])

  async function respond(id: string, status: 'accepted' | 'expired') {
    await api.tasks.respondBounty(id, status).catch(() => {})
    const all = await api.tasks.dailyBounties().catch(() => [] as DailyBounty[])
    const stillPending = all.filter(b => b.status === 'pending')
    setPending(stillPending)
    if (!stillPending.length) setOpen(false)
    // 通知任务页刷新已接受/列表（若正打开在看）
    window.dispatchEvent(new CustomEvent('agent:bounty-changed'))
  }

  if (!open || pending.length === 0) return null

  return (
    <div className="fixed inset-0 z-[55] flex items-center justify-center">
      <div className="absolute inset-0 bg-foreground/15 backdrop-blur-sm" onClick={() => setOpen(false)} />
      <div className="relative z-10 w-full max-w-lg mx-4 bg-card rounded-3xl border border-border shadow-2xl overflow-hidden">
        <div className="h-1.5 bg-gradient-to-r from-amber-300 via-orange-300 to-yellow-300" />
        <div className="p-7 space-y-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-widest">今日赏金</p>
              <h2 className="text-xl font-bold mt-1">⚔️ 新的赏金任务！</h2>
              <p className="text-sm text-muted-foreground mt-0.5">完成可获得额外 Buff 奖励</p>
            </div>
            <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground mt-1">
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="space-y-3 max-h-[60vh] overflow-y-auto">
            {pending.map(b => (
              <BountyCard key={b.id} bounty={b}
                onAccept={() => respond(b.id, 'accepted')}
                onExpire={() => respond(b.id, 'expired')} />
            ))}
          </div>
          <button onClick={() => setOpen(false)}
            className="w-full h-10 text-sm text-muted-foreground hover:text-foreground transition-colors">
            稍后再看
          </button>
        </div>
      </div>
    </div>
  )
}

// 赏金卡片（与 Tasks 页同款；这里自带一份，保持全局弹窗自洽）
function BountyCard({ bounty, onAccept, onExpire }: {
  bounty: DailyBounty
  onAccept: () => void
  onExpire: () => void
}) {
  return (
    <div className="rounded-2xl border border-amber-200/60 bg-amber-50/30 p-5 space-y-4">
      <div className="flex items-start gap-3">
        <Swords className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <p className="text-base font-semibold leading-snug">{bounty.content}</p>
            {bounty.ai_generated && (
              <span className="shrink-0 text-[10px] text-violet-500 font-medium bg-violet-50 border border-violet-200 rounded-md px-1.5 py-0.5 mt-0.5">✦ AI</span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-1">
            <span className="text-sm text-muted-foreground flex items-center gap-0.5">
              <Clock className="h-3.5 w-3.5" />{bounty.hours}h
            </span>
            <span className="flex gap-0.5">
              {Array.from({ length: bounty.stars }).map((_, i) => (
                <Star key={i} className="h-3.5 w-3.5 text-amber-400 fill-amber-400" />
              ))}
            </span>
          </div>
          {bounty.reason && (
            <div className="mt-2 flex items-start gap-1.5 text-xs text-amber-700/90 italic">
              <MessageCircle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-amber-500" />
              <span className="leading-snug">{bounty.reason}</span>
            </div>
          )}
          <div className="mt-3 flex items-center gap-2 bg-amber-100 rounded-xl px-3 py-2">
            <span className="text-xl leading-none">{bounty.buff.emoji}</span>
            <div>
              <p className="text-sm font-semibold text-amber-800">{bounty.buff.name}</p>
              <p className="text-xs text-amber-700 leading-snug mt-0.5">{bounty.buff.desc}</p>
            </div>
          </div>
        </div>
      </div>
      <div className="flex gap-2">
        <button onClick={onAccept}
          className="flex-1 h-10 rounded-xl bg-amber-500 text-white text-sm font-semibold hover:bg-amber-600 transition-colors">
          接受挑战
        </button>
        <button onClick={onExpire}
          className="flex-1 h-10 rounded-xl border border-border text-sm text-muted-foreground hover:bg-secondary transition-colors">
          放弃
        </button>
      </div>
    </div>
  )
}
