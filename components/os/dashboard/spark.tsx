export function Spark({
  data,
  w = 72,
  h = 22,
  color = "var(--accent)",
}: {
  data: number[]
  w?: number
  h?: number
  color?: string
}) {
  if (!data || data.length < 2) {
    return (
      <svg
        width={w}
        height={h}
        viewBox={`0 0 ${w} ${h}`}
        className="overflow-visible"
        aria-hidden="true"
      >
        <line
          x1={0}
          y1={h / 2}
          x2={w}
          y2={h / 2}
          stroke={color}
          strokeWidth="1.5"
          strokeOpacity="0.3"
          strokeDasharray="3 3"
        />
      </svg>
    )
  }

  const pad = 2
  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1
  const step = w / (data.length - 1)

  const coords = data.map((val, i) => {
    const x = i * step
    const y = h - pad - ((val - min) / range) * (h - 2 * pad)
    return [x, y] as [number, number]
  })

  const polylinePoints = coords.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ")
  const polygonPoints = `${polylinePoints} ${w},${h} 0,${h}`

  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      className="overflow-visible"
      aria-hidden="true"
    >
      <polygon points={polygonPoints} fill={color} opacity="0.1" />
      <polyline
        points={polylinePoints}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
