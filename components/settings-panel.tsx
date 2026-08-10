"use client"

import { useState } from "react"
import { RefreshCw, ArrowUpCircle, ExternalLink, RotateCcw, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { BrandIcon } from "@/components/brand-icon"
import { CommandLine } from "@/components/copy-button"
import { ThemeToggle } from "@/components/theme-toggle"
import { GUIDE_SEEN_KEY } from "@/components/company-guide"
import { checkForUpdatesNow, performLinuxUpdate, restartApp } from "@/lib/updates/update-actions"
import { waitForServerThenReload } from "@/lib/updates/wait-for-server-then-reload"
import { RELEASE_PAGE_URL } from "@/lib/updates/fetch-latest-release-impl"
import type { ManualCheckResult } from "@/lib/updates/check-for-updates-now-impl"

const REPO_URL = "https://github.com/kwakuoseikwakye/alacran"
const CHANGELOG_URL = `${REPO_URL}/blob/master/CHANGELOG.md`

/** The card-order flag v50's drag-and-drop grid writes, and the guide-seen
 *  flag v39's company guide writes — both are one-time, per-browser
 *  localStorage hints with no other UI path to clear them. */
const CARD_ORDER_KEY = "alacran-card-order"

function UpdatesCard({ currentVersion, canAutoUpdate }: { currentVersion: string; canAutoUpdate: boolean }) {
  const [pending, setPending] = useState(false)
  const [result, setResult] = useState<ManualCheckResult | null>(null)
  const [updatePhase, setUpdatePhase] = useState<"idle" | "updating" | "restarting" | "error">("idle")
  const [updateError, setUpdateError] = useState<{ message: string; manualCommand?: string } | null>(null)

  async function check() {
    setPending(true)
    try {
      setResult(await checkForUpdatesNow())
    } finally {
      setPending(false)
    }
  }

  async function updateAndRestart() {
    setUpdatePhase("updating")
    setUpdateError(null)
    const outcome = await performLinuxUpdate()
    if (!outcome.ok) {
      setUpdatePhase("error")
      setUpdateError({ message: outcome.message, manualCommand: outcome.manualCommand })
      return
    }
    setUpdatePhase("restarting")
    void restartApp()
    void waitForServerThenReload()
  }

  return (
    <Card className="a-rise gap-4">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ArrowUpCircle className="size-4 text-primary" /> Updates
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          You&apos;re on version <span className="font-semibold text-foreground">{currentVersion}</span>.
        </p>

        <Button type="button" variant="outline" size="sm" onClick={check} disabled={pending}>
          <RefreshCw className={`size-3.5 ${pending ? "animate-spin" : ""}`} />
          {pending ? "Checking…" : "Check for updates"}
        </Button>

        {result?.checked === false && result.reason === "disabled" && (
          <p className="text-xs text-muted-foreground">
            Update checks only run in a packaged build, not this development server.
          </p>
        )}
        {result?.checked === false && result.reason === "offline" && (
          <p className="text-xs text-destructive">Couldn&apos;t reach the update server. Check your connection and try again.</p>
        )}
        {result?.checked === true && !result.available && (
          <p className="text-xs text-success">You&apos;re up to date.</p>
        )}
        {result?.checked === true && result.available && updatePhase !== "restarting" && (
          <div className="space-y-2 rounded-md border border-border bg-background/60 p-3 text-sm">
            <p>
              Version <span className="font-semibold">{result.latestVersion}</span> is available.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              {canAutoUpdate && (
                <Button type="button" size="sm" onClick={updateAndRestart} disabled={updatePhase === "updating"}>
                  {updatePhase === "updating" ? "Downloading & installing…" : "Update & Restart"}
                </Button>
              )}
              <a
                className="inline-flex items-center gap-1 text-xs text-primary underline-offset-4 hover:underline"
                href={RELEASE_PAGE_URL}
                target="_blank"
                rel="noreferrer"
              >
                Download it <ExternalLink className="size-3" />
              </a>
            </div>
            {updatePhase === "error" && updateError && (
              <div className="space-y-1.5 text-xs text-destructive">
                <span>{updateError.message}</span>
                {updateError.manualCommand && <CommandLine command={updateError.manualCommand} />}
              </div>
            )}
          </div>
        )}
        {updatePhase === "restarting" && (
          <p className="text-xs text-muted-foreground">Update installed, restarting…</p>
        )}
      </CardContent>
    </Card>
  )
}

function ResetButton({ storageKey, label, doneLabel }: { storageKey: string; label: string; doneLabel: string }) {
  const [done, setDone] = useState(false)
  return (
    <div className="flex items-center gap-3">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => {
          window.localStorage.removeItem(storageKey)
          setDone(true)
        }}
      >
        <RotateCcw className="size-3.5" /> {label}
      </Button>
      {done && <span className="text-xs text-success">{doneLabel}</span>}
    </div>
  )
}

export function SettingsPanel({ currentVersion, canAutoUpdate }: { currentVersion: string; canAutoUpdate: boolean }) {
  return (
    <div className="max-w-2xl space-y-4">
      <Card className="a-rise gap-4">
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">Switch between Alacrán&apos;s dark and light themes.</p>
          <ThemeToggle />
        </CardContent>
      </Card>

      <UpdatesCard currentVersion={currentVersion} canAutoUpdate={canAutoUpdate} />

      <Card className="a-rise gap-4">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="size-4 text-primary" /> Local preferences
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            A couple of one-time hints this browser remembers, in case you want to see them again.
          </p>
          <ResetButton
            storageKey={CARD_ORDER_KEY}
            label="Reset agent card order"
            doneLabel="Done — the Agents page uses its default order again."
          />
          <ResetButton
            storageKey={GUIDE_SEEN_KEY}
            label="Show the company guide again"
            doneLabel="Done — it reopens next time a company's info is filled in."
          />
        </CardContent>
      </Card>

      <Card className="a-rise gap-4">
        <CardHeader>
          <CardTitle>About Alacrán</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            Version {currentVersion} · MIT licensed · runs entirely on your own machine — no account, no
            telemetry, no phone-home.
          </p>
          <div className="flex flex-wrap gap-4 pt-1">
            <a
              className="inline-flex items-center gap-1.5 text-primary underline-offset-4 hover:underline"
              href={REPO_URL}
              target="_blank"
              rel="noreferrer"
            >
              <BrandIcon id="github" className="size-3.5" /> Source on GitHub
            </a>
            <a
              className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline"
              href={CHANGELOG_URL}
              target="_blank"
              rel="noreferrer"
            >
              Changelog <ExternalLink className="size-3" />
            </a>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
