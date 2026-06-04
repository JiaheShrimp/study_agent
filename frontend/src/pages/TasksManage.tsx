import { useEffect, useState } from 'react'
import { Plus, Trash2, Star, Clock, ChevronLeft, Swords } from 'lucide-react'
import { api, type TaskTemplate, type BountyTask } from '@/lib/api'
import { cn } from '@/lib/utils'
import { Link } from 'react-router-dom'

function StarPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map(n => (
        <button key={n} type="button" onClick={() => onChange(n)} className="p-0.5">
          <Star className={cn('h-4 w-4 transition-colors',
            n <= value ? 'text-amber-400 fill-amber-400' : 'text-border')} />
        </button>
      ))}
    </div>
  )
}

// ── 模板表单行 ────────────────────────────────────────────────
function TemplateForm({ onSave }: { onSave: (t: Omit<TaskTemplate, 'id'>) => void }) {
  const [content, setContent] = useState('')
  const [hours, setHours]     = useState(1)
  const [stars, setStars]     = useState(3)

  function submit() {
    if (!content.trim()) return
    onSave({ content: content.trim(), hours, stars })
    setContent('')
    setHours(1)
    setStars(3)
  }

  return (
    <div className="space-y-2.5 p-4 rounded-2xl bg-secondary/40 border border-border">
      <div className="flex gap-2">
        <input value={content} onChange={e => setContent(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && submit()}
          placeholder="模板任务内容"
          className="flex-1 h-9 rounded-xl border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring/40" />
        <button onClick={submit} disabled={!content.trim()}
          className={cn('h-9 w-9 rounded-xl flex items-center justify-center shrink-0 transition-all',
            content.trim() ? 'bg-primary text-primary-foreground hover:bg-primary/90' : 'bg-secondary text-muted-foreground')}>
          <Plus className="h-4 w-4" />
        </button>
      </div>
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Clock className="h-3.5 w-3.5" />
          <input type="number" min={0.5} max={24} step={0.5} value={hours}
            onChange={e => setHours(Number(e.target.value))}
            className="w-14 h-7 rounded-lg border border-input bg-background px-2 text-sm text-center focus:outline-none" />
          <span className="text-xs">h</span>
        </div>
        <StarPicker value={stars} onChange={setStars} />
      </div>
    </div>
  )
}

// ── 赏金任务表单 ──────────────────────────────────────────────
function BountyForm({ onSave }: { onSave: (b: Omit<BountyTask, 'id'>) => void }) {
  const [content, setContent] = useState('')
  const [hours, setHours]     = useState(1)
  const [stars, setStars]     = useState(3)
  const [buff, setBuff]       = useState('')

  function submit() {
    if (!content.trim() || !buff.trim()) return
    onSave({ content: content.trim(), hours, stars, buff: buff.trim() })
    setContent(''); setBuff(''); setHours(1); setStars(3)
  }

  return (
    <div className="space-y-2.5 p-4 rounded-2xl bg-amber-50/60 border border-amber-200/60">
      <div className="flex gap-2">
        <input value={content} onChange={e => setContent(e.target.value)}
          placeholder="赏金任务内容"
          className="flex-1 h-9 rounded-xl border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring/40" />
      </div>
      <input value={buff} onChange={e => setBuff(e.target.value)}
        placeholder="Buff 描述，如：完成后今日所有任务奖励×1.1"
        className="w-full h-9 rounded-xl border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring/40" />
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Clock className="h-3.5 w-3.5" />
          <input type="number" min={0.5} max={24} step={0.5} value={hours}
            onChange={e => setHours(Number(e.target.value))}
            className="w-14 h-7 rounded-lg border border-input bg-background px-2 text-sm text-center focus:outline-none" />
          <span className="text-xs">h</span>
        </div>
        <StarPicker value={stars} onChange={setStars} />
        <button onClick={submit} disabled={!content.trim() || !buff.trim()}
          className={cn('ml-auto h-8 px-4 rounded-xl text-xs font-medium transition-all',
            content.trim() && buff.trim() ? 'bg-primary text-primary-foreground hover:bg-primary/90' : 'bg-secondary text-muted-foreground')}>
          添加
        </button>
      </div>
    </div>
  )
}

// ── 主页面 ────────────────────────────────────────────────────
export function TasksManage() {
  const [templates, setTemplates] = useState<TaskTemplate[]>([])
  const [bounties, setBounties]   = useState<BountyTask[]>([])

  async function loadAll() {
    const [t, b] = await Promise.all([api.tasks.templates(), api.tasks.bountyPool()])
    setTemplates(t); setBounties(b)
  }

  useEffect(() => { loadAll() }, [])

  async function addTemplate(t: Omit<TaskTemplate, 'id'>) {
    await api.tasks.createTemplate(t); loadAll()
  }
  async function delTemplate(id: string) {
    await api.tasks.deleteTemplate(id); loadAll()
  }
  async function addBounty(b: Omit<BountyTask, 'id'>) {
    await api.tasks.createBounty(b); loadAll()
  }
  async function delBounty(id: string) {
    await api.tasks.deleteBounty(id); loadAll()
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-8">

        {/* 返回 */}
        <Link to="/tasks" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors w-fit">
          <ChevronLeft className="h-4 w-4" /> 返回每日任务
        </Link>

        {/* 任务模板 */}
        <section className="space-y-4">
          <div>
            <h2 className="text-base font-semibold">任务模板库</h2>
            <p className="text-xs text-muted-foreground mt-0.5">每天打开时自动从这里复制任务，时间和星级可以当天修改</p>
          </div>
          <TemplateForm onSave={addTemplate} />
          {templates.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">还没有模板</p>
          ) : (
            <div className="bg-card rounded-2xl border border-border divide-y divide-border overflow-hidden">
              {templates.map(t => (
                <div key={t.id} className="flex items-start gap-3 px-4 py-3.5 group hover:bg-secondary/30">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm">{t.content}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[11px] text-muted-foreground flex items-center gap-0.5">
                        <Clock className="h-3 w-3" />{t.hours}h
                      </span>
                      <span className="flex gap-0.5">
                        {Array.from({ length: t.stars }).map((_, i) => (
                          <Star key={i} className="h-2.5 w-2.5 text-amber-400 fill-amber-400" />
                        ))}
                      </span>
                    </div>
                  </div>
                  <button onClick={() => delTemplate(t.id)}
                    className="opacity-0 group-hover:opacity-100 mt-0.5 text-muted-foreground hover:text-rose-500 transition-all shrink-0">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* 赏金任务库 */}
        <section className="space-y-4">
          <div>
            <h2 className="text-base font-semibold flex items-center gap-2">
              <Swords className="h-4 w-4 text-amber-600" /> 赏金任务库
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">每天随机抽取 0-3 个弹出，玩家可选择接受或跳过</p>
          </div>
          <BountyForm onSave={addBounty} />
          {bounties.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">还没有赏金任务</p>
          ) : (
            <div className="bg-card rounded-2xl border border-amber-200/60 divide-y divide-border overflow-hidden">
              {bounties.map(b => (
                <div key={b.id} className="flex items-start gap-3 px-4 py-3.5 group hover:bg-amber-50/40">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm">{b.content}</p>
                    <p className="text-[11px] text-amber-700 mt-0.5">🎁 {b.buff}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[11px] text-muted-foreground flex items-center gap-0.5">
                        <Clock className="h-3 w-3" />{b.hours}h
                      </span>
                      <span className="flex gap-0.5">
                        {Array.from({ length: b.stars }).map((_, i) => (
                          <Star key={i} className="h-2.5 w-2.5 text-amber-400 fill-amber-400" />
                        ))}
                      </span>
                    </div>
                  </div>
                  <button onClick={() => delBounty(b.id)}
                    className="opacity-0 group-hover:opacity-100 mt-0.5 text-muted-foreground hover:text-rose-500 transition-all shrink-0">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

      </div>
    </div>
  )
}
