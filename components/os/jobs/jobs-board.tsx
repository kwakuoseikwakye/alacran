"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import {
  approvePolicyAction,
  removeMonthlyLimitAction,
  revokePolicyAction,
  runJobNowAction,
  sendTestAction,
  setJobEnabledAction,
  setJobModeAction,
  setMonthlyLimitAction,
} from "@/lib/jobs/actions"
import { jobMonthWords, SPENDING_COPY, spendingHeadline, usd, type SpendingView } from "@/lib/jobs/cost-words"
import type { JobsView, JobView, PolicyView } from "@/lib/jobs/view"
import { JobFlagList } from "./job-flag-list"
import { heldStatusWords, rowWords, shortDate } from "@/lib/jobs/held-words"

type Notice = { ok: boolean; message: string } | null
type Act = (fn: () => Promise<{ ok: boolean; message: string }>, done?: () => void) => void

function useAct(): [Act, boolean, Notice] {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [notice, setNotice] = useState<Notice>(null)
  const act: Act = (fn, done) =>
    start(async () => {
      setNotice(null)
      const result = await fn().catch(() => ({ ok: false, message: "That didn't work. Try again." }))
      setNotice(result)
      done?.()
      router.refresh()
    })
  return [act, pending, notice]
}

function NoticeLine({ notice }: { notice: Notice }) {
  if (!notice) return null
  return (
    <p role="status" className={`text-sm ${notice.ok ? "text-os-ok" : "text-os-err"}`}>
      {notice.message}
    </p>
  )
}

const EXAMPLE = `# definitions/jobs.yaml
jobs:
  - id: welcome-followup
    run: scripts/welcome_followup.py   # a script in your company's scripts folder
    at: "08:15"                        # every day, your local time
    note: Re-send the invite to anyone who hasn't joined yet`

function JobCard({ companyId, job, now }: { companyId: string; job: JobView; now: number }) {
  const [act, pending, notice] = useAct()
  const [confirmLive, setConfirmLive] = useState(false)
  const last = job.lastRun
  return (
    <article className="rounded-lg border border-os-border bg-os-surface p-4 space-y-3">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-semibold text-os-text">{job.id}</h3>
          <p className="text-sm text-os-muted">
            Every day at {job.at}
            {job.note ? ` · ${job.note}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {!job.enabled && <span className="rounded border border-os-border px-2 py-0.5 text-os-dim">Off</span>}
          <span className={`rounded px-2 py-0.5 ${job.mode === "live" ? "bg-os-accent text-white" : "border border-os-border text-os-muted"}`}>
            {job.mode === "live" ? "Live" : "Practice"}
          </span>
        </div>
      </header>

      {job.missed && <p className="text-sm text-os-warn">Didn&apos;t run yesterday. Alacrán has to be open at {job.at} for a job to run.</p>}
      {last ? (
        <div className="text-sm space-y-1">
          <p className={last.status === "ok" ? "text-os-text" : "text-os-err"}>
            {last.date}: {last.message}
          </p>
          {last.outcome && (
            <p className="text-os-muted">
              {last.outcome.label}: <b className="text-os-text">{last.outcome.value}</b>
            </p>
          )}
        </div>
      ) : (
        <p className="text-sm text-os-muted">Hasn&apos;t run yet.</p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" disabled={pending} title="Run this job now, whatever the time. In practice mode it sends nothing." onClick={() => act(() => runJobNowAction(companyId, job.id))}>
          {pending ? "Working…" : "Run now"}
        </Button>
        {job.mode === "shadow" ? (
          confirmLive ? (
            <>
              <Button size="sm" disabled={pending} title="From the next run, this job may send messages under your approved send policies." onClick={() => act(() => setJobModeAction(companyId, job.id, "live"), () => setConfirmLive(false))}>
                Yes, go live
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirmLive(false)} title="Keep practising">
                Not yet
              </Button>
            </>
          ) : (
            <Button size="sm" variant="outline" disabled={pending} title="Let this job act for real. Check its practice runs below first." onClick={() => setConfirmLive(true)}>
              Go live…
            </Button>
          )
        ) : (
          <Button size="sm" variant="outline" disabled={pending} title="Keep running it, but send nothing." onClick={() => act(() => setJobModeAction(companyId, job.id, "shadow"))}>
            Back to practice
          </Button>
        )}
        <Button size="sm" variant="ghost" disabled={pending} title={job.enabled ? "Stop this job from running at all." : "Let this job run on its schedule again."} onClick={() => act(() => setJobEnabledAction(companyId, job.id, !job.enabled))}>
          {job.enabled ? "Turn off" : "Turn on"}
        </Button>
      </div>
      {confirmLive && <p className="text-sm text-os-warn">Going live lets this job send messages without you reading each one, but only under send policies you have approved.</p>}
      <NoticeLine notice={notice} />

      {job.recent.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-os-muted">Recent runs</summary>
          <ul className="mt-2 space-y-2">
            {job.recent.map((run) => (
              <li key={run.runId} className="border-l-2 border-os-border pl-3">
                <p className={run.status === "ok" ? "text-os-text" : "text-os-err"}>
                  {run.date} · {run.mode === "live" ? "Live" : "Practice"} · {run.message}
                </p>
                {run.did.length > 0 && <p className="text-os-muted">{run.did.join(" · ")}</p>}
                {run.sends.length > 0 && (
                  <p className="text-os-dim">
                    {run.sends.map((s) => `${s.to}: ${s.result === "would-send" ? "would send" : s.result}${s.reason ? ` (${s.reason})` : ""}`).join(" · ")}
                  </p>
                )}
                {run.stderrTail && <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap text-xs text-os-dim">{run.stderrTail}</pre>}
              </li>
            ))}
          </ul>
        </details>
      )}
      {job.held.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-os-muted">Held for your OK</summary>
          <ul className="mt-2 space-y-2">
            {job.held.map((h) => (
              <li key={h.id} className="border-l-2 border-os-border pl-3 [overflow-wrap:anywhere]">
                <p className="text-os-text">
                  {shortDate(h.createdAt)} · {rowWords(h)} · {h.title}
                </p>
                {h.mail && <p className="text-os-dim">To {h.mail.to}: {h.mail.subject}</p>}
                <p className={h.status === "failed" ? "text-os-err" : "text-os-muted"}>{heldStatusWords(h, now)}</p>
              </li>
            ))}
          </ul>
        </details>
      )}
    </article>
  )
}

function PolicyCard({ companyId, policy }: { companyId: string; policy: PolicyView }) {
  const [act, pending, notice] = useAct()
  const [confirm, setConfirm] = useState(false)
  const [testTo, setTestTo] = useState("")
  return (
    <article className="rounded-lg border border-os-border bg-os-surface p-4 space-y-3">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-semibold text-os-text">{policy.id}</h3>
          <p className="text-sm text-os-muted">
            Email through Outlook · message in {policy.template} · at most {policy.max_per_recipient} per person, {policy.min_days_between} days apart, {policy.max_per_run} per run
            {policy.stop_list ? ` · stop list ${policy.stop_list}` : ""}
          </p>
        </div>
        <span className={`rounded px-2 py-0.5 text-xs ${policy.approved ? "bg-os-ok text-white" : "border border-os-border text-os-muted"}`}>
          {policy.approved ? "Approved" : "Not approved"}
        </span>
      </header>
      {policy.reason && <p className="text-sm text-os-warn">{policy.reason}</p>}
      <p className="text-sm text-os-muted">Sent so far: {policy.sentTotal}</p>
      <div className="flex flex-wrap gap-2">
        {policy.approved ? (
          <Button size="sm" variant="outline" disabled={pending} title="Stop all sending under this policy at once." onClick={() => act(() => revokePolicyAction(companyId, policy.id))}>
            Stop sending
          </Button>
        ) : confirm ? (
          <>
            <Button size="sm" disabled={pending} title="Live jobs may send this exact message, within these limits, without asking each time." onClick={() => act(() => approvePolicyAction(companyId, policy.id), () => setConfirm(false))}>
              Yes, approve this message
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirm(false)} title="Don't approve it now">
              Not now
            </Button>
          </>
        ) : (
          <Button size="sm" variant="outline" disabled={pending} title="Read the message and its limits, then approve it once." onClick={() => setConfirm(true)}>
            Approve…
          </Button>
        )}
      </div>
      {confirm && (
        <p className="text-sm text-os-warn">
          This approves the message in {policy.template} exactly as it is now. Send yourself a test first. If the message or these limits change, sending stops until you approve again.
        </p>
      )}
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          act(() => sendTestAction(companyId, policy.id, testTo))
        }}
      >
        <input
          type="email"
          required
          value={testTo}
          onChange={(e) => setTestTo(e.target.value)}
          placeholder="you@example.com"
          aria-label="Address for a test message"
          className="h-8 min-w-0 flex-1 rounded-md border border-os-border bg-os-bg px-2 text-sm text-os-text"
        />
        <Button size="sm" variant="outline" type="submit" disabled={pending} title="Send this message once to one address, marked [TEST], with sample values. It doesn't count toward anyone's limit.">
          Send a test
        </Button>
      </form>
      <NoticeLine notice={notice} />
    </article>
  )
}

function SpendingSection({ companyId, spending, scriptIds }: { companyId: string; spending: SpendingView; scriptIds: string[] }) {
  const [act, pending, notice] = useAct()
  const [value, setValue] = useState("")
  const limit = spending.limit
  const headline = spendingHeadline(spending)
  const hasLimit = limit.ok && limit.usd !== null
  return (
    <section aria-labelledby="jobs-spending" className="space-y-3">
      <h2 id="jobs-spending" className="text-lg font-semibold text-os-text">What AI runs cost this month</h2>
      <div className="rounded-lg border border-os-border bg-os-surface p-4 space-y-3 text-sm">
        <p className="text-os-text">
          {headline.before}
          {headline.figure && <b className="text-base">{headline.figure}</b>}
          {headline.after}
        </p>
        {spending.reached && (
          // Mixed toward the text colour: the light theme's warning on this surface is just under AA at 14px.
          <p className="font-medium text-[color-mix(in_oklab,var(--color-os-warn)_80%,var(--color-os-text))]">
            Limit reached. Alacrán has stopped starting scheduled runs and session notes on its own until next month or until you raise it. You can still press Run yourself.
          </p>
        )}
        <p className="text-os-muted">{SPENDING_COPY.estimate} {SPENDING_COPY.scope}</p>
        {spending.unknownRuns > 0 && (
          <p className="text-os-muted">
            {spending.unknownRuns} {spending.unknownRuns === 1 ? "run" : "runs"} this month with a cost Alacrán couldn&apos;t see.
          </p>
        )}
        {!limit.ok && <p className="text-os-err">The monthly limit in definitions/budget.yaml can&apos;t be read: {limit.reason} Until it&apos;s fixed, Alacrán won&apos;t start AI runs on its own.</p>}

        {spending.jobs.length > 0 ? (
          <ul className="divide-y divide-os-border">
            {spending.jobs.map((j) => (
              <li key={j.job} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2">
                <span className="min-w-0 text-os-text [overflow-wrap:anywhere]">{j.label}</span>
                <span className="text-os-muted">
                  {jobMonthWords(j)} · last run {j.lastCostUsd === null ? "cost not known" : usd(j.lastCostUsd)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-os-muted">No AI runs this month yet.</p>
        )}

        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            act(() => setMonthlyLimitAction(companyId, value), () => setValue(""))
          }}
        >
          <label htmlFor="jobs-monthly-limit" className="text-os-muted">Monthly limit in US dollars</label>
          <input
            id="jobs-monthly-limit"
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            required
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={hasLimit ? String(limit.usd) : "e.g. 25"}
            className="h-8 w-28 rounded-md border border-os-border bg-os-bg px-2 text-sm text-os-text outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
          />
          <Button size="sm" variant="outline" type="submit" disabled={pending} title="Save this amount in the company's definitions. Once this month's estimated cost reaches it, Alacrán stops starting AI runs on its own.">
            Set monthly limit
          </Button>
          {(hasLimit || !limit.ok) && (
            <Button size="sm" variant="ghost" type="button" disabled={pending} title="Take the limit away. Scheduled runs and session notes start whatever they cost." onClick={() => act(() => removeMonthlyLimitAction(companyId))}>
              Remove limit
            </Button>
          )}
        </form>
        <p className="text-os-muted">{hasLimit ? SPENDING_COPY.softLimit : SPENDING_COPY.noLimit}</p>
        {scriptIds.length > 0 && (
          <p className="text-os-dim">
            Your scripts ({scriptIds.join(", ")}) {SPENDING_COPY.scripts}
          </p>
        )}
        <NoticeLine notice={notice} />
      </div>
    </section>
  )
}

export function JobsBoard({ companyId, view, spending, now }: { companyId: string; view: JobsView; spending: SpendingView; now: number }) {
  const spendingSection = <SpendingSection companyId={companyId} spending={spending} scriptIds={view.ok ? view.jobs.map((j) => j.id) : []} />
  if (!view.ok) {
    return (
      <div className="space-y-8">
        <p className="text-sm text-os-err">The jobs file needs fixing: {view.reason}</p>
        {spendingSection}
      </div>
    )
  }
  const invalid = [...view.invalidJobs.map((i) => ({ ...i, file: "jobs" })), ...view.invalidPolicies.map((i) => ({ ...i, file: "send policies" }))]
  return (
    <div className="space-y-8">
      {view.heldError && <p className="text-sm text-os-err">The list of steps jobs held for your OK can&apos;t be read right now, so their history is missing.</p>}
      {view.flags.length > 0 && (
        <section aria-labelledby="jobs-need-you" className="space-y-3">
          <h2 id="jobs-need-you" className="text-lg font-semibold text-os-text">Needs you</h2>
          <JobFlagList companyId={companyId} flags={view.flags} />
        </section>
      )}

      <section aria-labelledby="jobs-list" className="space-y-3">
        <h2 id="jobs-list" className="text-lg font-semibold text-os-text">Jobs</h2>
        {view.jobs.length === 0 ? (
          <div className="rounded-lg border border-dashed border-os-border p-4 text-sm text-os-muted space-y-2">
            <p>No jobs yet. A job is a script in your company&apos;s scripts folder, listed in definitions/jobs.yaml. Ask your AI to write one, or add it yourself:</p>
            <pre className="overflow-auto rounded bg-os-bg p-3 text-xs text-os-text">{EXAMPLE}</pre>
            <p>Each new job practises first: it runs, shows what it would have done, and sends nothing until you put it live.</p>
          </div>
        ) : (
          view.jobs.map((job) => <JobCard key={job.id} companyId={companyId} job={job} now={now} />)
        )}
      </section>

      <section aria-labelledby="jobs-policies" className="space-y-3">
        <h2 id="jobs-policies" className="text-lg font-semibold text-os-text">Messages jobs may send</h2>
        {view.policiesError && <p className="text-sm text-os-err">The send policies file needs fixing: {view.policiesError}</p>}
        {view.policies.length === 0 ? (
          <p className="text-sm text-os-muted">
            None. Without an approved send policy in definitions/send-policies.yaml, no job can send anything, live or not.
          </p>
        ) : (
          view.policies.map((p) => <PolicyCard key={p.id} companyId={companyId} policy={p} />)
        )}
      </section>

      {spendingSection}

      {invalid.length > 0 && (
        <section aria-labelledby="jobs-invalid" className="space-y-2">
          <h2 id="jobs-invalid" className="text-lg font-semibold text-os-text">Not valid</h2>
          <ul className="text-sm text-os-err space-y-1">
            {invalid.map((i) => (
              <li key={`${i.file}-${i.index}`}>
                In {i.file}, entry {i.index + 1}
                {i.id ? ` (${i.id})` : ""}: {i.reason}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
