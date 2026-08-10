"use client"

import { useState } from "react"
import { ArrowUpCircle, X } from "lucide-react"
import { dismissUpdate, performUpdate, restartApp } from "@/lib/updates/update-actions"
import { RELEASE_PAGE_URL } from "@/lib/updates/fetch-latest-release-impl"
import { waitForServerThenReload } from "@/lib/updates/wait-for-server-then-reload"
import { CommandLine } from "@/components/copy-button"

type Phase = "idle" | "updating" | "restarting" | "error"

/**
 * A quiet, dismissible "a newer version exists" strip.
 *
 * On Linux and macOS this can actually perform the update instead of only
 * linking out — Linux downloads the .deb and installs it via a native pkexec
 * password prompt; macOS swaps the running .app bundle in place (no prompt at
 * all). Windows has no packaged build, so it keeps the download link only.
 */
export function UpdateBanner({
  latestVersion,
  currentVersion,
  canAutoUpdate,
}: {
  latestVersion: string
  currentVersion?: string
  canAutoUpdate: boolean
}) {
  const [hidden, setHidden] = useState(false)
  const [phase, setPhase] = useState<Phase>("idle")
  const [error, setError] = useState<{ message: string; manualCommand?: string } | null>(null)
  if (hidden) return null

  async function handleUpdateAndRestart() {
    setPhase("updating")
    setError(null)
    const result = await performUpdate()
    if (!result.ok) {
      setPhase("error")
      setError({ message: result.message, manualCommand: result.manualCommand })
      return
    }
    setPhase("restarting")
    void restartApp()
    void waitForServerThenReload()
  }

  return (
    <div
      role="status"
      className="flex flex-col gap-1.5 border-b border-border bg-muted/40 px-4 py-2 text-sm"
    >
      <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
        <ArrowUpCircle className="size-4 shrink-0 text-primary" aria-hidden />
        <span>
          {phase === "restarting" ? (
            "Update installed, restarting…"
          ) : (
            <>
              Version <span className="font-semibold">{latestVersion}</span> is available
              {currentVersion ? <span className="text-muted-foreground"> (you have {currentVersion})</span> : null}.
            </>
          )}
        </span>
        {phase !== "restarting" && canAutoUpdate && (
          <button
            type="button"
            disabled={phase === "updating"}
            onClick={() => void handleUpdateAndRestart()}
            className="font-semibold text-primary underline underline-offset-4 hover:no-underline disabled:opacity-60 disabled:no-underline"
          >
            {phase === "updating" ? "Downloading & installing…" : "Update & Restart"}
          </button>
        )}
        {phase !== "restarting" && (
          <a
            href={RELEASE_PAGE_URL}
            target="_blank"
            rel="noreferrer"
            className="font-semibold text-primary underline underline-offset-4 hover:no-underline"
          >
            Download it
          </a>
        )}
        {phase === "idle" && (
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
        )}
      </div>
      {phase === "error" && error && (
        <div className="flex flex-col items-center gap-1.5 text-xs text-destructive">
          <span>{error.message}</span>
          {error.manualCommand && <CommandLine command={error.manualCommand} />}
        </div>
      )}
    </div>
  )
}
