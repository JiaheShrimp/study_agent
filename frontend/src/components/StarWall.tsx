export function StarWall({ count }: { count: number }) {
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
    </div>
  )
}
