export type ConnectorBarItem = {
  id: string
  colorVar: string
  opacity: number
}

export function computeConnectorBarColors(
  connectors: Array<{ id: string; status: "connected" | "not_configured" | "error" }>
): ConnectorBarItem[] {
  return connectors.map((c) => {
    if (c.status === "connected") {
      return { id: c.id, colorVar: "var(--ok)", opacity: 1 }
    }
    if (c.status === "error") {
      return { id: c.id, colorVar: "var(--err)", opacity: 0.75 }
    }
    return { id: c.id, colorVar: "var(--dim)", opacity: 0.6 }
  })
}

export function ConnectorBars({
  connectors,
  w = 72,
  h = 22,
}: {
  connectors: Array<{ id: string; status: "connected" | "not_configured" | "error" }>
  w?: number
  h?: number
}) {
  const items = connectors.slice(0, 16)
  if (items.length === 0) {
    return null
  }

  const gap = 2
  const bw = Math.max(2, (w - gap * (items.length - 1)) / Math.max(1, items.length))
  const coloredItems = computeConnectorBarColors(items)

  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      className="overflow-visible"
      aria-hidden="true"
    >
      {items.map((item, i) => {
        let barHeight = 6
        if (item.status === "connected") {
          barHeight = h - 4
        } else if (item.status === "error") {
          barHeight = h - 9
        }

        const colorInfo = coloredItems[i]
        const x = i * (bw + gap)
        const y = h - barHeight

        return (
          <rect
            key={item.id}
            x={x}
            y={y}
            width={bw}
            height={barHeight}
            fill={colorInfo.colorVar}
            fillOpacity={colorInfo.opacity}
            rx={1}
          />
        )
      })}
    </svg>
  )
}
