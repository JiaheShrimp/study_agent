import { useEffect, useRef, useState } from 'react'
import { Plus, Trash2, Pencil, X } from 'lucide-react'
import { api, type Spinner } from '@/lib/api'
import { cn } from '@/lib/utils'
import { playSpinTick, playSpinResult } from '@/lib/sounds'

const COLORS = [
  '#f59e0b','#10b981','#3b82f6','#8b5cf6',
  '#ef4444','#f97316','#06b6d4','#ec4899',
]

function sectorPath(cx: number, cy: number, r: number, startDeg: number, endDeg: number) {
  const rad = (d: number) => (d * Math.PI) / 180
  const x1 = cx + r * Math.cos(rad(startDeg))
  const y1 = cy + r * Math.sin(rad(startDeg))
  const x2 = cx + r * Math.cos(rad(endDeg))
  const y2 = cy + r * Math.sin(rad(endDeg))
  const large = endDeg - startDeg > 180 ? 1 : 0
  return `M${cx},${cy} L${x1},${y1} A${r},${r},0,${large},1,${x2},${y2} Z`
}

function SpinWheel({ items, spinning, result, onSpinEnd }: {
  items: string[]
  spinning: boolean
  result: string | null
  onSpinEnd: () => void
}) {
  const [rotateDeg, setRotateDeg] = useState(0)
  const rafRef = useRef(0)
  const degRef = useRef(0)
  const lastTickDegRef = useRef(0)

  const SIZE = 280
  const CX = SIZE / 2
  const CY = SIZE / 2
  const R = 126

  useEffect(() => {
    if (!spinning) {
      cancelAnimationFrame(rafRef.current)
      return
    }

    const totalDeg = 360 * (5 + Math.random() * 3) + Math.random() * 360
    let gone = 0
    lastTickDegRef.current = degRef.current

    function animate() {
      const progress = gone / totalDeg
      if (progress >= 1) {
        onSpinEnd()
        playSpinResult()
        return
      }
      const speed = progress < 0.75
        ? 18
        : Math.max(0.8, 18 * Math.pow(1 - (progress - 0.75) / 0.25, 2))

      gone += speed
      degRef.current += speed
      setRotateDeg(degRef.current)

      const sliceDeg = items.length > 0 ? 360 / items.length : 360
      if (degRef.current - lastTickDegRef.current >= sliceDeg) {
        lastTickDegRef.current += sliceDeg
        playSpinTick(Math.min(speed / 9, 1))
      }

      rafRef.current = requestAnimationFrame(animate)
    }

    rafRef.current = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(rafRef.current)
  }, [spinning])

  if (items.length === 0) {
    return (
      <div className="flex items-center justify-center rounded-full bg-secondary text-muted-foreground text-sm"
        style={{ width: SIZE, height: SIZE }}>
        请添加选项
      </div>
    )
  }

  const sliceDeg = 360 / items.length
  const fontSize = items.length > 8 ? 11 : 13

  return (
    <div className="relative flex items-center justify-center select-none" style={{ width: SIZE, height: SIZE + 28 }}>
      {/* 指针 */}
      <div className="absolute z-10 flex justify-center" style={{ top: 0, width: '100%' }}>
        <svg width="20" height="24" viewBox="0 0 20 24">
          <polygon points="10,24 1,0 19,0" fill="hsl(var(--primary))" filter="drop-shadow(0 2px 3px rgba(0,0,0,0.2))" />
        </svg>
      </div>

      {/* 转盘 SVG */}
      <div style={{ marginTop: 28 }}>
        <svg
          width={SIZE} height={SIZE}
          style={{ transform: `rotate(${rotateDeg}deg)`, display: 'block' }}
        >
          {items.map((item, i) => {
            const start = i * sliceDeg - 90
            const end = start + sliceDeg
            const midDeg = start + sliceDeg / 2
            const midRad = (midDeg * Math.PI) / 180
            const textR = R * 0.62
            const tx = CX + textR * Math.cos(midRad)
            const ty = CY + textR * Math.sin(midRad)
            const label = item.length > 6 ? item.slice(0, 5) + '…' : item

            return (
              <g key={i}>
                <path
                  d={sectorPath(CX, CY, R, start, end)}
                  fill={COLORS[i % COLORS.length]}
                  stroke="#fff"
                  strokeWidth={2}
                />
                <text
                  x={tx} y={ty}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  transform={`rotate(${midDeg + 90}, ${tx}, ${ty})`}
                  fill="#fff"
                  fontSize={fontSize}
                  fontWeight="700"
                  fontFamily="'Noto Sans SC', 'PingFang SC', 'Microsoft YaHei', sans-serif"
                  letterSpacing="0.5"
                >
                  {label}
                </text>
              </g>
            )
          })}
          {/* 外圈描边 */}
          <circle cx={CX} cy={CY} r={R} fill="none" stroke="#fff" strokeWidth={3} />
          {/* 中心圆 */}
          <circle cx={CX} cy={CY} r={18} fill="#fff" stroke="hsl(var(--border))" strokeWidth={2} />
          <circle cx={CX} cy={CY} r={8} fill="hsl(var(--primary))" />
        </svg>
      </div>

      {/* 结果浮层 */}
      {result && !spinning && (
        <div className="absolute rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center"
          style={{ top: 28, left: 0, width: SIZE, height: SIZE }}>
          <div className="text-center px-6">
            <p className="text-white/60 text-xs mb-1 tracking-widest">就决定是你了</p>
            <p className="text-white font-black text-2xl leading-tight drop-shadow-lg">{result}</p>
          </div>
        </div>
      )}
    </div>
  )
}

// ── 编辑奖盘弹窗 ──────────────────────────────────────────────
function EditModal({ spinner, onSave, onClose }: {
  spinner: Spinner | null
  onSave: (name: string, items: string[]) => void
  onClose: () => void
}) {
  const [name, setName] = useState(spinner?.name ?? '')
  const [items, setItems] = useState<string[]>(spinner?.items ?? [])
  const [input, setInput] = useState('')

  function addItem() {
    const v = input.trim()
    if (!v) return
    setItems(prev => [...prev, v])
    setInput('')
  }

  function removeItem(i: number) {
    setItems(prev => prev.filter((_, idx) => idx !== i))
  }

  function handleSave() {
    if (!name.trim() || items.length < 2) return
    onSave(name.trim(), items)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/20 backdrop-blur-sm p-4">
      <div className="w-full max-w-sm bg-card rounded-3xl border border-border shadow-2xl overflow-hidden">
        <div className="px-6 pt-6 pb-4 border-b border-border flex items-center justify-between">
          <h2 className="font-semibold text-base">{spinner ? '编辑奖盘' : '新建奖盘'}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-6 py-4 space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground font-medium">奖盘名称</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="例如：今天吃什么"
              className="w-full h-9 rounded-xl border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring/30"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground font-medium">选项（至少2个）</label>
            <div className="space-y-1.5 max-h-40 overflow-y-auto">
              {items.map((item, i) => (
                <div key={i} className="flex items-center gap-2 bg-secondary/50 rounded-lg px-3 py-2">
                  <span className="flex-1 text-sm truncate">{item}</span>
                  <button onClick={() => removeItem(i)} className="text-muted-foreground hover:text-rose-500 shrink-0">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') addItem() }}
                placeholder="输入选项，回车添加"
                className="flex-1 h-9 rounded-xl border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring/30"
              />
              <button
                onClick={addItem}
                className="h-9 w-9 rounded-xl bg-primary text-primary-foreground flex items-center justify-center hover:bg-primary/90"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        <div className="px-6 pb-6">
          <button
            onClick={handleSave}
            disabled={!name.trim() || items.length < 2}
            className="w-full h-11 rounded-2xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  )
}

// ── 主页面 ────────────────────────────────────────────────────
export function SpinnerPage() {
  const [spinners, setSpinners] = useState<Spinner[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [spinning, setSpinning] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const [editTarget, setEditTarget] = useState<Spinner | 'new' | null>(null)

  const active = spinners.find(s => s.id === activeId) ?? null

  useEffect(() => {
    api.spinner.list().then(list => {
      setSpinners(list)
      if (list.length > 0) setActiveId(list[0].id)
    }).catch(() => {})
  }, [])

  async function handleSpin() {
    if (!activeId || spinning || !active || active.items.length < 2) return
    setResult(null)
    setSpinning(true)
  }

  // 动画结束后取后端结果
  async function handleSpinEnd() {
    if (!activeId) return
    try {
      const res = await api.spinner.spin(activeId)
      setResult(res.result)
    } catch {}
    setSpinning(false)
  }

  async function handleSave(name: string, items: string[]) {
    if (editTarget === 'new') {
      const s = await api.spinner.create(name, items)
      setSpinners(prev => [...prev, s])
      setActiveId(s.id)
    } else if (editTarget) {
      const s = await api.spinner.update(editTarget.id, name, items)
      setSpinners(prev => prev.map(x => x.id === s.id ? s : x))
    }
    setEditTarget(null)
    setResult(null)
  }

  async function handleDelete(id: string) {
    await api.spinner.delete(id)
    setSpinners(prev => {
      const next = prev.filter(s => s.id !== id)
      if (activeId === id) setActiveId(next[0]?.id ?? null)
      return next
    })
    setResult(null)
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">随机转盘</h1>
          <p className="text-xs text-muted-foreground mt-0.5">选择困难症克星</p>
        </div>
        <button
          onClick={() => setEditTarget('new')}
          className="flex items-center gap-1.5 h-9 px-3 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-4 w-4" />
          新建
        </button>
      </div>

      {spinners.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {spinners.map(s => (
            <button
              key={s.id}
              onClick={() => { setActiveId(s.id); setResult(null) }}
              className={cn(
                'px-3 py-1.5 rounded-xl text-sm font-medium transition-colors',
                s.id === activeId
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary text-foreground hover:bg-secondary/80'
              )}
            >
              {s.name}
            </button>
          ))}
        </div>
      )}

      {active ? (
        <div className="bg-card rounded-3xl border border-border p-6 space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">{active.name}</h2>
            <div className="flex gap-2">
              <button
                onClick={() => setEditTarget(active)}
                className="h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => handleDelete(active.id)}
                className="h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-rose-50 hover:text-rose-500 transition-colors"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          <div className="flex justify-center">
            <SpinWheel
              items={active.items}
              spinning={spinning}
              result={result}
              onSpinEnd={handleSpinEnd}
            />
          </div>

          <button
            onClick={handleSpin}
            disabled={spinning || active.items.length < 2}
            className={cn(
              'w-full rounded-2xl font-bold text-base transition-all active:scale-[0.98]',
              spinning
                ? 'bg-secondary text-muted-foreground cursor-not-allowed'
                : 'bg-primary text-primary-foreground hover:bg-primary/90'
            )}
            style={{ height: '52px' }}
          >
            {spinning ? '旋转中…' : result ? '再转一次 🎰' : '开始抽奖 🎰'}
          </button>

          {result && !spinning && (
            <div className="text-center py-3 px-4 rounded-2xl bg-amber-50 border border-amber-100">
              <p className="text-xs text-amber-600 mb-0.5">就决定是你了</p>
              <p className="text-xl font-black text-amber-700">{result}</p>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-card rounded-3xl border border-border p-12 text-center text-muted-foreground">
          <p className="text-3xl mb-3">🎡</p>
          <p className="text-sm">还没有奖盘</p>
          <p className="text-xs mt-1">点击右上角「新建」创建第一个</p>
        </div>
      )}

      {editTarget !== null && (
        <EditModal
          spinner={editTarget === 'new' ? null : editTarget}
          onSave={handleSave}
          onClose={() => setEditTarget(null)}
        />
      )}
    </div>
  )
}
