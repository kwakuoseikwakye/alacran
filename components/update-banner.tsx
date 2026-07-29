"use client"

import { useState } from "react"
import { ArrowUpCircle, X } from "lucide-react"
import { dismissUpdate } from "@/lib/updates/update-actions"
import { RELEASE_PAGE_URL } from "@/lib/updates/fetch-latest-release-impl"

/**
 * A quiet, dismissible "a newer version exists" strip.
 *
 * Deliberately not a modal and not a blocker: the app has no auto-installer,
 * so the most this can honestly do is tell you and link to the download. It
 * hides itself immediately on dismiss rather than waiting on the server round
 * trip, because nothing about the user's next action depends on that write.
 */
export function UpdateBanner({ latestVersion, currentVersion }: { latestVersion: string; currentVersion?: string }) {
  const [hidden, setHidden] = useState(false)
  if (hidden) return null

  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-b border-border bg-muted/40 px-4 py-2 text-sm"
    >
      <ArrowUpCircle className="size-4 shrink-0 text-primary" aria-hidden />
      <span>
        Version <span className="font-semibold">{latestVersion}</span> is available
        {currentVersion ? <span className="text-muted-foreground"> (you have {currentVersion})</span> : null}.
      </span>
      <a
        href={RELEASE_PAGE_URL}
        target="_blank"
        rel="noreferrer"
        className="font-semibold text-primary underline underline-offset-4 hover:no-underline"
      >
        Download it
      </a>
      <button
        type="button"
        aria-label="Dismiss update notice"
        title="Dismiss until the next version"
        onClick={() => {
          setHidden(true)
          void dismissUpdate(latestVersion)
        }}
        className="ml-1 rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        <X className="size-3.5" />
      </button>
    </div>
  )
}
