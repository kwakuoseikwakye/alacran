import React from "react"
import Link from "next/link"
import { SparkIcon } from "./spark-icon"

export function SystemCard({
  href,
  title,
  caption,
}: {
  href: string
  title: string
  caption: string
}) {
  return (
    <Link
      href={href}
      className="group block w-44 rounded-xl border border-os-border bg-os-surface p-3 text-center transition-colors hover:border-os-border-strong hover:bg-os-surface2"
    >
      <div className="flex justify-center">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-os-border-bright bg-os-bg">
          <SparkIcon size={20} shade="#a3a3a3" />
        </div>
      </div>
      <div className="mt-1.5 text-xs font-bold text-os-text group-hover:text-os-accent">{title}</div>
      <div className="text-[10px] leading-snug text-os-dim">{caption}</div>
    </Link>
  )
}
