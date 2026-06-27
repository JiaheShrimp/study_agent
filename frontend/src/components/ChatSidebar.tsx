import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Send, MessageCircle, X, Swords } from 'lucide-react'
import { api, type DialogueTurn } from '@/lib/api'
import { playChatMessage } from '@/lib/sounds'
import { cn } from '@/lib/utils'

// ─────────────────────────────────────────────────────────────
// 搭子聊天栏（全局唯一）
//
// 整个 agent 只有这一个聊天栏，所有页面共享。展示你和搭子的对话历史：
//   - 你在赢麻了等页面的操作触发的搭子主动反馈
//   - 你在这里主动打字的对话
//
// 每 15 秒轮询 /ai/dialogue 拉新消息（捕捉业务操作触发的异步反馈），
// 出现搭子新消息时播提示音。
// ─────────────────────────────────────────────────────────────

const POLL_INTERVAL = 5_000

export function ChatSidebar() {
  const [turns, setTurns] = useState<DialogueTurn[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [thinking, setThinking] = useState(false)   // 搭子「正在思考」动态指示
  const [open, setOpen] = useState(true)   // 手机端可收起
  const [assignedNote, setAssignedNote] = useState<string | null>(null)  // 刚派发任务的确认条
  const scrollRef = useRef<HTMLDivElement>(null)
  // 已知最后一条 assistant 消息 id，用于判断是否有新反馈（触发音效 + 收尾思考态）
  const lastAssistantIdRef = useRef<string | null>(null)
  const firstLoadRef = useRef(true)
  // 思考态超时兜底，防止反馈始终没来时一直转
  const thinkingTimeoutRef = useRef<number | null>(null)

  // 开/关「正在思考」。开启时设超时兜底，到点自动关。
  function startThinking() {
    setThinking(true)
    scrollToBottom()
    if (thinkingTimeoutRef.current) window.clearTimeout(thinkingTimeoutRef.current)
    thinkingTimeoutRef.current = window.setTimeout(() => setThinking(false), 30_000)
  }
  function stopThinking() {
    setThinking(false)
    if (thinkingTimeoutRef.current) {
      window.clearTimeout(thinkingTimeoutRef.current)
      thinkingTimeoutRef.current = null
    }
  }

  // 滚到底
  function scrollToBottom() {
    requestAnimationFrame(() => {
      const el = scrollRef.current
      if (el) el.scrollTop = el.scrollHeight
    })
  }

  // 拉对话历史；有新 assistant 消息则播音效（首次加载不播）
  async function refresh() {
    try {
      const data = await api.ai.dialogue(50)
      const lastAssistant = [...data].reverse().find(t => t.role === 'assistant')
      const newId = lastAssistant?.id ?? null
      const changed = newId && newId !== lastAssistantIdRef.current
      if (changed && !firstLoadRef.current) {
        playChatMessage()
        // 新反馈到达 → 收尾「正在思考」（覆盖赢麻了触发的场景）
        stopThinking()
      }
      lastAssistantIdRef.current = newId
      firstLoadRef.current = false
      setTurns(data)
      scrollToBottom()
    } catch {
      // 后端未就绪静默
    }
  }

  useEffect(() => {
    refresh()
    const timer = window.setInterval(refresh, POLL_INTERVAL)

    // 业务操作（如记录赢麻了）触发后，立即追加几次刷新，
    // 覆盖后台线程生成搭子反馈所需的几秒，让反馈尽快出现而不必干等下一轮。
    const onRefresh = () => {
      // 业务操作触发了搭子反馈：先显示「正在思考」，反馈到达时 refresh 会收尾
      startThinking()
      refresh()
      window.setTimeout(refresh, 1500)
      window.setTimeout(refresh, 3500)
      window.setTimeout(refresh, 6000)
    }
    window.addEventListener('agent:dialogue-refresh', onRefresh)

    return () => {
      window.clearInterval(timer)
      window.removeEventListener('agent:dialogue-refresh', onRefresh)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleSend(e: FormEvent) {
    e.preventDefault()
    const msg = input.trim()
    if (!msg || sending) return
    setSending(true)
    setInput('')
    // 乐观插入用户消息，立即可见
    const optimistic: DialogueTurn = {
      id: 'tmp-' + Date.now(),
      role: 'user',
      content: msg,
      trigger: '',
      at: new Date().toISOString(),
    }
    setTurns(prev => [...prev, optimistic])
    startThinking()
    try {
      const res = await api.ai.chat(msg)
      // 搭子按指令派了赏金任务 → 通知任务页刷新 + 在聊天里明确确认派了啥
      if (res?.assigned_bounty) {
        window.dispatchEvent(new CustomEvent('agent:bounty-refresh'))
        setAssignedNote(res.bounty_content || '已派发一个任务')
        setTimeout(() => setAssignedNote(null), 8000)
      }
      // 用服务端权威历史覆盖（含真实 id 和搭子回复）
      await refresh()
    } catch {
      // 失败时把乐观消息标灰提示
      setTurns(prev => prev.map(t =>
        t.id === optimistic.id ? { ...t, content: msg + '（发送失败）' } : t
      ))
    } finally {
      setSending(false)
      stopThinking()
    }
  }

  // 收起态：右下角一个浮标
  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-20 left-4 z-40 md:hidden flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg"
        aria-label="打开搭子"
      >
        <MessageCircle className="h-5 w-5" />
      </button>
    )
  }

  return (
    <aside
      className={cn(
        'shrink-0 h-full',
        // 桌面：四周留内边距，让聊天卡片真正浮起、与导航栏之间有空隙
        'md:w-96 md:p-3',
        // 手机端：浮层从左侧盖住
        'max-md:fixed max-md:inset-y-0 max-md:left-0 max-md:z-40 max-md:w-full max-md:max-w-xs max-md:p-2'
      )}
    >
      {/* 聊天卡片：独立浮卡，圆角 + 边框 + 阴影，与导航栏视觉分隔 */}
      <div className="flex flex-col h-full bg-card rounded-2xl border shadow-sm overflow-hidden max-md:shadow-2xl">
      {/* 头部 */}
      <div className="flex items-center gap-2 px-4 py-3 border-b">
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-amber-100">
          <MessageCircle className="h-4 w-4 text-amber-600" />
        </div>
        <div className="leading-tight">
          <p className="text-sm font-semibold">搭子</p>
          <p className="text-[11px] text-muted-foreground">陪你一起进步</p>
        </div>
        <button
          onClick={() => setOpen(false)}
          className="ml-auto md:hidden text-muted-foreground hover:text-foreground"
          aria-label="收起"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* 消息列表 */}
      <div ref={scrollRef} className="flex-1 overflow-auto px-3 py-4 space-y-3">
        {turns.length === 0 && (
          <p className="text-center text-sm text-muted-foreground mt-8 px-4">
            在赢麻了里记一条进步，或在下面跟我说点什么 👋
          </p>
        )}
        {turns.map(t => (
          <div
            key={t.id}
            className={cn('flex', t.role === 'user' ? 'justify-end' : 'justify-start')}
          >
            <div
              className={cn(
                'max-w-[85%] rounded-2xl px-3.5 py-2.5 text-[15px] leading-relaxed whitespace-pre-wrap break-words',
                t.role === 'user'
                  ? 'bg-primary text-primary-foreground rounded-br-sm'
                  : 'bg-secondary text-secondary-foreground rounded-bl-sm'
              )}
            >
              {t.content}
            </div>
          </div>
        ))}

        {/* 搭子「正在思考」：三点跳动气泡 */}
        {thinking && (
          <div className="flex justify-start">
            <div className="bg-secondary rounded-2xl rounded-bl-sm px-3.5 py-3 flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60 animate-typing-dot" />
              <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60 animate-typing-dot [animation-delay:0.2s]" />
              <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60 animate-typing-dot [animation-delay:0.4s]" />
            </div>
          </div>
        )}
      </div>

      {/* 派发任务确认条：搭子刚派了任务，明确告诉你派了啥（在任意页面都可见） */}
      {assignedNote && (
        <div className="mx-3 mb-2 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <Swords className="h-4 w-4 shrink-0 mt-0.5 text-amber-600" />
          <span className="leading-snug">
            已派发到「每日任务」：<span className="font-semibold">{assignedNote}</span>
          </span>
        </div>
      )}

      {/* 输入框 */}
      <form onSubmit={handleSend} className="border-t p-3 flex items-end gap-2">
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              handleSend(e)
            }
          }}
          rows={1}
          placeholder="跟搭子说点什么…"
          className="flex-1 resize-none rounded-xl border border-input bg-background px-3 py-2 text-[15px] focus:outline-none focus:ring-2 focus:ring-ring/40 max-h-28"
        />
        <button
          type="submit"
          disabled={sending || !input.trim()}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground disabled:opacity-40 transition-opacity"
          aria-label="发送"
        >
          <Send className="h-4 w-4" />
        </button>
      </form>
      </div>
    </aside>
  )
}
