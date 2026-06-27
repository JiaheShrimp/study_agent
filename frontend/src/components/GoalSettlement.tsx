import { useEffect, useState } from 'react'
import { CalendarClock, X } from 'lucide-react'
import { api, type PendingGap } from '@/lib/api'
import { cn } from '@/lib/utils'

// 学习目标「整段未结算区间」裁定弹窗。
//
// 系统监测：你重开 app 时，若从上次正常结算到昨天之间有一段没达标的日子
// （包括没开 app / 放假那种 0 的日子，天然落在这段里），弹**一个**窗、填一次理由，
// 对**整段**一次决定——是「跳过」（有事/状态不好，整段不计入目标升降）还是
// 「算中断」（整段按未达标计）。第二天正常打开、或一直达标的话不会弹。
// 取代了原来手动勾「今天不计入」。
//
// 裁定完成后调 onDone（刷新目标卡片）。

function fmtMin(secs: number): string {
  const m = Math.round(secs / 60)
  if (m < 60) return `${m} 分钟`
  const h = Math.floor(m / 60)
  const mm = m % 60
  return mm ? `${h} 小时 ${mm} 分` : `${h} 小时`
}

function fmtDay(d: string): string {
  const dt = new Date(d + 'T00:00:00')
  return `${dt.getMonth() + 1} 月 ${dt.getDate()} 日`
}

export function GoalSettlement({ onDone }: { onDone?: () => void }) {
  const [gap, setGap] = useState<PendingGap | null | undefined>(undefined)  // undefined=未加载
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    api.study.pendingGap()
      .then(setGap)
      .catch(() => setGap(null))
  }, [])

  if (done || gap === undefined || gap === null) return null

  async function decide(decision: 'skip' | 'count') {
    if (saving) return
    setSaving(true)
    try {
      await api.study.settleGap(decision, reason.trim())
    } catch {
      // 失败也关闭，避免卡住用户；下次打开仍会再次提示
    } finally {
      setSaving(false)
    }
    setDone(true)
    onDone?.()
  }

  // 区间描述：单天 vs 多天
  const rangeLabel = gap.days <= 1
    ? fmtDay(gap.start)
    : `${fmtDay(gap.start)} ~ ${fmtDay(gap.end)}（共 ${gap.days} 天）`

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-foreground/15 backdrop-blur-sm" />
      <div className="relative z-10 w-80 bg-card rounded-3xl border border-border shadow-2xl overflow-hidden">
        <div className="h-1 bg-gradient-to-r from-amber-300 to-orange-400" />
        <div className="p-6 space-y-4">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2">
              <CalendarClock className="h-5 w-5 text-amber-500" />
              <div>
                <h2 className="text-base font-semibold">学习时间核对</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {gap.days <= 1 ? '有一天没达标' : `有 ${gap.days} 天没达标`}
                </p>
              </div>
            </div>
            <button
              onClick={() => { setDone(true); onDone?.() }}
              className="text-muted-foreground hover:text-foreground"
              title="稍后处理"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="rounded-2xl bg-amber-50 border border-amber-100 px-4 py-3">
            <p className="text-sm font-semibold text-amber-700">{rangeLabel}</p>
            <p className="text-xs text-amber-600 mt-1">
              {gap.days <= 1
                ? <>这天学了 <span className="font-semibold">{fmtMin(gap.total_effective_secs)}</span>，没达到目标（{fmtMin(gap.goal_secs)}）。</>
                : <>这几天总共才学了 <span className="font-semibold">{fmtMin(gap.total_effective_secs)}</span>，都没达标。</>}
            </p>
            <p className="text-[11px] text-amber-500 mt-1.5">
              是有事/状态不好跳过{gap.days <= 1 ? '这天' : '这几天'}，还是确实没学够？
            </p>
          </div>

          <input
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder="理由（可选，如「放假」「生病」「有事」）"
            className="w-full h-9 rounded-xl border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring/40"
          />

          <div className="flex gap-2 pt-1">
            <button
              onClick={() => decide('count')}
              disabled={saving}
              className={cn(
                'flex-1 h-9 rounded-2xl border border-border text-sm text-muted-foreground',
                'hover:bg-secondary transition-colors disabled:opacity-40'
              )}
            >
              算中断
            </button>
            <button
              onClick={() => decide('skip')}
              disabled={saving}
              className={cn(
                'flex-1 h-9 rounded-2xl bg-amber-500 text-white text-sm font-medium',
                'hover:bg-amber-600 transition-colors disabled:opacity-40'
              )}
            >
              跳过（不计入）
            </button>
          </div>
          <p className="text-[11px] text-muted-foreground text-center">
            跳过的日子不影响目标升降，连续达标不会因此中断
          </p>
        </div>
      </div>
    </div>
  )
}
