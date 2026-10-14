"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { CompanySetupWizard } from "@/components/company-setup-wizard"
import { FirstRunHeroView, type HeroStage } from "@/components/os/dashboard/first-run-hero-view"
import { runCompanyCommand } from "@/lib/company-commands/run-company-command"
import { getCompanyCommandStatus } from "@/lib/company-commands/company-command-status"
import { getCompanyCommandLogTail } from "@/lib/company-commands/company-command-log-tail"
import { dismissFirstRunGuide } from "@/lib/os/first-run-actions"
import { runEndedEmpty } from "@/lib/os/first-run"

const POLL_MS = 3000

export function FirstRunHero({
  stage,
  companyId,
  companyName,
  running,
  pendingTitle,
}: {
  stage: HeroStage
  companyId: string
  companyName: string
  running: boolean
  pendingTitle?: string
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  // A run is in flight now, or this hero started one: remembered, so that when
  // it ends with nothing to review the person is told, not shown the same paid
  // button again. This component stays mounted as the stage flips (Home keeps
  // it in one place), so the state survives the refreshes below.
  const [attempted, setAttempted] = useState(running)
  const [runLog, setRunLog] = useState("")
  useEffect(() => {
    if (running) setAttempted(true)
  }, [running])
  const endedEmpty = runEndedEmpty({ attempted, stage, running, busy })

  // What that run printed, for the fold under the message. Reads a log, spawns nothing.
  useEffect(() => {
    if (!endedEmpty) return
    let live = true
    void getCompanyCommandLogTail("orientation", companyId)
      .then((result) => {
        if (live) setRunLog(result.tail)
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [endedEmpty, companyId])

  // Home re-renders itself only every 15 seconds (AutoRefresh in the root
  // layout), so while a run is in flight this watches the run lock every 3 and
  // refreshes the moment it lets go: the hero then turns into "Ready for you"
  // (or, if nothing was left, says so). The effect is idempotent (a Strict Mode
  // double invoke clears the first interval), and it spawns nothing.
  useEffect(() => {
    if (stage !== "review" || !running) return
    const timer = setInterval(async () => {
      const status = await getCompanyCommandStatus(companyId).catch(() => ({ running: true }))
      if (!status.running) router.refresh()
    }, POLL_MS)
    return () => clearInterval(timer)
  }, [stage, running, companyId, router])

  // Only ever called from a click, never from an effect: it starts a real,
  // paid run, so it must not be reachable by a Strict Mode double invoke.
  async function start() {
    setBusy(true)
    setMessage(null)
    const response: { started: boolean; message: string } = await runCompanyCommand("orientation", {}, companyId).catch(
      (error: unknown) => ({ started: false, message: error instanceof Error ? error.message : String(error) })
    )
    if (response.started) {
      setAttempted(true)
      setRunLog("")
      router.refresh()
    } else setMessage(response.message)
    setBusy(false)
  }

  async function dismiss() {
    await dismissFirstRunGuide(companyId).catch(() => ({ ok: false }))
    router.refresh()
  }

  return (
    <FirstRunHeroView
      stage={stage}
      companyName={companyName}
      running={running}
      pendingTitle={pendingTitle}
      tasksHref={`/c/${companyId}/tasks`}
      busy={busy}
      message={message}
      endedEmpty={endedEmpty}
      runLog={runLog}
      describeAction={<CompanySetupWizard agentId={companyId} companyName={companyName} />}
      onStart={start}
      onDismiss={dismiss}
    />
  )
}
