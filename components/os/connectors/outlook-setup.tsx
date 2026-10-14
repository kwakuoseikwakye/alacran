"use client"

import { useEffect, useRef, useState } from "react"
import { AlertCircle, CheckCircle2, ExternalLink, Shield } from "lucide-react"
import { checkOutlookSignIn, disconnectOutlook, startOutlookSignIn } from "@/lib/outlook/actions"
import type { ConnectStatus } from "@/lib/connect/connect-status-impl"

/** The command every AI runs. Spelled here rather than imported from
 *  lib/outlook/outlook.ts, which reads files and cannot enter a browser bundle. */
const OUTLOOK_COMMAND = "alacran-outlook"

type Pending = { userCode: string; verificationUri: string; deviceCode: string; expiresAt: number; interval: number }

/**
 * The Outlook card's setup: sign in with a code, or sign out.
 *
 * Sign-in is Microsoft's device-code flow, so there is nothing to create or
 * paste: the person opens Microsoft's own page, types the short code shown here
 * and approves. This component only shows the code and asks, every few seconds,
 * whether it has been approved yet. No password or token ever passes through the
 * page; the sign-in is stored by the command itself.
 */
export function OutlookSetup({ connectStatus, onRecheck }: { connectStatus?: ConnectStatus; onRecheck?: () => Promise<void> }) {
  const [pending, setPending] = useState<Pending | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const recheck = useRef(onRecheck)
  recheck.current = onRecheck
  const connected = connectStatus?.outlook.connected === true

  // While a code is showing, ask whether it has been approved. Stops by itself
  // when the code expires or is refused.
  useEffect(() => {
    if (!pending) return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout>
    let wait = pending.interval * 1000
    const poll = async () => {
      if (cancelled) return
      if (Date.now() > pending.expiresAt) {
        setPending(null)
        setMessage("That code ran out of time. Press Sign in to get a new one.")
        return
      }
      const result = await checkOutlookSignIn(pending.deviceCode)
      if (cancelled) return
      if (result.status === "pending") {
        if (result.slowDown) wait += 5000
        timer = setTimeout(poll, wait)
        return
      }
      setPending(null)
      if (result.status === "ok") {
        setMessage(null)
        await recheck.current?.()
      } else if (result.status === "error") setMessage(result.message)
      else if (result.status === "denied") setMessage("The sign-in was declined on the Microsoft page.")
      else setMessage("That code ran out of time. Press Sign in to get a new one.")
    }
    timer = setTimeout(poll, wait)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [pending])

  async function signIn() {
    setBusy(true)
    setMessage(null)
    const started = await startOutlookSignIn()
    setBusy(false)
    if (!started.ok) {
      setMessage(started.message)
      return
    }
    setPending({ userCode: started.userCode, verificationUri: started.verificationUri, deviceCode: started.deviceCode, expiresAt: Date.now() + started.expiresIn * 1000, interval: started.interval })
  }

  async function signOut() {
    setBusy(true)
    setMessage(null)
    const result = await disconnectOutlook()
    setBusy(false)
    if (!result.ok) setMessage("Couldn't sign out. Try again.")
    await recheck.current?.()
  }

  return (
    <div className="space-y-4 text-xs">
      <div className="rounded-xl border border-os-border bg-os-surface2 p-3">
        <div className="flex items-center justify-between">
          <span className="font-mono text-os-dim uppercase tracking-wider text-[11px]">Account</span>
          {connected ? (
            <span className="flex items-center gap-1.5 font-mono text-os-ok">
              <CheckCircle2 className="h-3.5 w-3.5" />
              {connectStatus?.outlook.accounts?.[0] ?? "Connected"}
            </span>
          ) : (
            <span className="flex items-center gap-1.5 font-mono text-os-dim">
              <AlertCircle className="h-3.5 w-3.5" />
              Not signed in
            </span>
          )}
        </div>
      </div>

      <p className="text-os-dim">
        Outlook.com and Microsoft 365 mail and calendar. Once connected, every AI on this computer can read and search your mail, see your calendar, and
        send or reply, by running <code className="font-mono text-os-text">{OUTLOOK_COMMAND}</code>.
      </p>

      {pending ? (
        <div className="space-y-3 rounded-xl border border-os-border bg-os-surface2/60 p-3.5">
          <p className="font-semibold text-os-text">1. Open the Microsoft page and enter this code</p>
          <p className="select-all text-center font-mono text-xl tracking-[0.25em] text-os-text">{pending.userCode}</p>
          <a
            href={pending.verificationUri}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg border border-os-border bg-os-surface px-3 py-1.5 font-medium text-os-text hover:border-os-border-strong"
            title="Opens Microsoft's own sign-in page in your browser. You sign in there, never here."
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Open the Microsoft sign-in page
          </a>
          <p className="text-os-dim">2. Sign in and approve. This connects on its own a few seconds after you do.</p>
          <button type="button" className="text-os-dim underline underline-offset-2 hover:text-os-text" onClick={() => setPending(null)}>
            Cancel this sign-in
          </button>
        </div>
      ) : connected ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => void signOut()}
          title="Forget this sign-in on this computer. The AIs can no longer reach your mail until you sign in again."
          className="rounded-lg border border-os-border bg-os-surface px-3 py-1.5 font-medium text-os-text hover:border-os-border-strong disabled:opacity-50"
        >
          Sign out of Outlook
        </button>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={() => void signIn()}
          title="Shows a short code to type on Microsoft's own page. Nothing is entered here."
          className="rounded-lg bg-os-accent px-3 py-1.5 font-medium text-os-accent-ink hover:opacity-90 disabled:opacity-50"
        >
          {busy ? "Starting…" : "Sign in with Microsoft"}
        </button>
      )}

      {message ? (
        <p className="text-os-err" role="alert">
          {message}
        </p>
      ) : null}

      <div className="rounded-xl border border-os-border bg-os-surface2/40 p-3 text-[11px] text-os-dim space-y-1">
        <span className="font-semibold text-os-text flex items-center gap-1">
          <Shield className="h-3 w-3 text-os-accent" /> Standing Safety Agreement (AGENTS.md &sect;6)
        </span>
        <p>
          Sending mail, replying, and inviting people are shown to you as a draft first. The command refuses to send until it is told you approved, and
          agents are told never to add that themselves. Mail text is labelled as written by other people, so it is read as data, never as instructions.
        </p>
        <p>
          Personal Outlook.com accounts and work or school accounts both work, although some organisations need an administrator to approve the sign-in.
          The sign-in is kept in a file only you can read on this computer.
        </p>
      </div>
    </div>
  )
}
