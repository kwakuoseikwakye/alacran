import React from "react"

export function SparkIcon({
  size = 28,
  shade = "var(--os-accent, #3df08c)",
  className = "",
}: {
  shade?: string
  size?: number
  className?: string
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={`shrink-0 transition-transform ${className}`}
      aria-hidden="true"
    >
      <path
        d="M12 0C12 6.627 6.627 12 0 12C6.627 12 12 17.373 12 24C12 17.373 17.373 12 24 12C17.373 12 12 6.627 12 0Z"
        fill={shade}
      />
    </svg>
  )
}
