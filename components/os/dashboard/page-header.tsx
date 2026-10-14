import React from "react"

/**
 * A page's own heading: its name in sentence case, an optional line under it,
 * and an optional slot on the right for the page's actions. The toolbar takes
 * the name over once this scrolls away.
 */
export function PageHeader({
  title,
  right,
  rightWide = false,
  subtext,
}: {
  title: string
  right?: React.ReactNode
  rightWide?: boolean
  subtext?: React.ReactNode
}) {
  return (
    <header className="flex flex-col gap-2 pb-5">
      <div className="flex items-start justify-between gap-4">
        <h1 className="min-w-0 text-[26px] font-semibold leading-[1.15] text-os-text">{title}</h1>
        {right ? (
          <div className={rightWide ? "flex min-w-0 max-w-xl flex-1 items-start justify-end" : "shrink-0"}>{right}</div>
        ) : null}
      </div>
      {subtext ? <div className="text-sm text-os-muted">{subtext}</div> : null}
    </header>
  )
}
