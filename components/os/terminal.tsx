import React from "react"

export type DotState = "ok" | "warn" | "err" | "off" | "connected" | "active" | "available" | "idle"

const DOT_FOR: Record<string, "ok" | "warn" | "err" | "off"> = {
  connected: "ok",
  active: "ok",
  ok: "ok",
  available: "warn",
  warn: "warn",
  training: "warn",
  idle: "warn",
  error: "err",
  fail: "err",
  not_configured: "off",
  planned: "off",
  off: "off",
}

export function dotState(state: string): "ok" | "warn" | "err" | "off" {
  return DOT_FOR[state] ?? "off"
}

export function Dot({ state, pulse = false }: { state: string; pulse?: boolean }) {
  const cls = dotState(state)
  const colorClass =
    cls === "ok"
      ? "bg-os-ok"
      : cls === "warn"
      ? "bg-os-warn"
      : cls === "err"
      ? "bg-os-err"
      : "bg-os-dim opacity-50"

  return (
    <span className="relative inline-flex h-2 w-2 items-center justify-center align-middle">
      {pulse && cls === "ok" && (
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-os-ok opacity-75" />
      )}
      <span className={`relative inline-flex h-1.5 w-1.5 rounded-full ${colorClass}`} />
    </span>
  )
}

export type BadgeTone = "default" | "accent" | "ok" | "warn" | "err" | "neutral"

const BADGE_TONE: Record<BadgeTone, string> = {
  default: "border-os-border text-os-muted bg-os-surface2",
  neutral: "border-os-border text-os-dim bg-os-surface2",
  accent: "border-os-accent/30 bg-os-accent/10 text-os-accent",
  ok: "border-os-ok/30 bg-os-ok/10 text-os-ok",
  warn: "border-os-warn/30 bg-os-warn/10 text-os-warn",
  err: "border-os-err/30 bg-os-err/10 text-os-err",
}

export function Badge({
  tone = "default",
  ghost = false,
  children,
  className = "",
}: {
  tone?: BadgeTone
  ghost?: boolean
  children: React.ReactNode
  className?: string
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-xs border px-2 py-[2.5px] font-mono text-[9.5px] uppercase tracking-[0.14em] ${
        BADGE_TONE[tone] ?? BADGE_TONE.default
      } ${ghost ? "border-dashed" : ""} ${className}`}
    >
      {children}
    </span>
  )
}

/** Mono section label: `LABEL  count ————` */
export function Label({
  children,
  count,
  rule = false,
}: {
  children: React.ReactNode
  count?: string | number
  rule?: boolean
}) {
  return (
    <div className="flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-[0.26em] text-os-dim">
      <span className="whitespace-nowrap">{children}</span>
      {count != null && <span className="text-os-muted">{count}</span>}
      {rule && <span className="h-px flex-1 bg-os-border" />}
    </div>
  )
}

export function SectionHead({
  label,
  count,
  link,
  href,
}: {
  label: string
  count?: string | number
  link?: string
  href?: string
}) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-3">
      <div className="min-w-0 flex-1">
        <Label count={count} rule>
          {label}
        </Label>
      </div>
      {link && href && (
        <a
          href={href}
          className="shrink-0 font-mono text-[11px] text-os-dim transition-colors hover:text-os-accent"
        >
          {link} →
        </a>
      )}
    </div>
  )
}

export function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded-xs border border-os-border bg-os-surface px-1.5 py-0.5 font-mono text-[10px] text-os-muted">
      {children}
    </kbd>
  )
}
