// 把 YYYY-MM-DD 格式成「6 月 4 日」
function fmtMD(d: string): string {
  if (!d) return ''
  const dt = new Date(d + 'T00:00:00')
  return `${dt.getMonth() + 1} 月 ${dt.getDate()} 日`
}

export function StarWall({ count, best }: { count: number; best?: { value: number; date: string } }) {
  if (count <= 0) return null

  const rows: number[] = []
  let remaining = count
  while (remaining > 0) {
    rows.push(Math.min(remaining, 10))
    remaining -= 10
  }

  return (
    <div className="bg-card rounded-2xl border border-border px-5 py-4 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground">今日获得</p>
        <p className="text-xs font-semibold text-amber-600">{count} ★</p>
      </div>
      <div className="space-y-1">
        {rows.map((n, ri) => (
          <div key={ri} className="flex gap-0.5">
            {Array.from({ length: n }).map((_, i) => (
              <span key={i} className="text-amber-400 text-base leading-none select-none">★</span>
            ))}
          </div>
        ))}
      </div>
      {best && best.value > 0 && (
        <p className="text-[11px] text-muted-foreground pt-1 border-t border-border">
          🏆 历史最佳单日 <span className="font-semibold text-amber-600">{best.value} ★</span>
          <span className="ml-1">· {fmtMD(best.date)}</span>
        </p>
      )}
    </div>
  )
}
