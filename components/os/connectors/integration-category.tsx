"use client"

import React, { useState } from "react"

function useSafeState<T>(initial: T | (() => T)): [T, React.Dispatch<React.SetStateAction<T>>] {
  try {
    return useState<T>(initial)
  } catch {
    const val = typeof initial === "function" ? (initial as () => T)() : initial
    return [val, () => {}]
  }
}

export function IntegrationCategory({
  label,
  count,
  defaultOpen = false,
  children,
}: {
  label: string
  count: number
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useSafeState(defaultOpen)
  return (
    <div className="rounded-2xl border border-os-border bg-os-surface/40">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-3.5 text-left"
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          className={`shrink-0 text-os-dim transition-transform duration-200 ${open ? "rotate-90" : ""}`}
          aria-hidden="true"
        >
          <path
            d="M9 6l6 6-6 6"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <span className="flex-1 text-[13px] font-semibold text-os-text">{label}</span>
        <span className="grid h-5 min-w-5 place-items-center rounded-full border border-os-border px-1.5 font-mono text-[10px] text-os-dim">
          {count}
        </span>
      </button>
      {open && <div className="px-4 pb-4 pt-1">{children}</div>}
    </div>
  )
}
