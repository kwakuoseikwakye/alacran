"use client"

import { Button } from "@/components/ui/button"
import type { CompanyCommandResult, OwnedFile } from "@/lib/company-commands/company-command-result-impl"
import {
  isBrokenYaml, parseProposedFacts, removedLines, sourcedChanges, unsourcedChanges,
  type ProposedFact, type ProposedFacts,
} from "@/lib/company-commands/fact-changes"

export function applyLabel(n: number): string {
  return `Approve note and apply ${n} fact${n === 1 ? "" : "s"}`
}

/** Everything TaskCard needs to know about fact changes in one result. Pure, so it is safe above any hook. */
export function deriveFactState(commandId: string, result: CompanyCommandResult | null): {
  owned: OwnedFile[]
  ownedPaths: string[] | undefined
  proposed: ProposedFacts
  brokenYaml: boolean
} {
  if (!result || !result.changed) return { owned: [], ownedPaths: undefined, proposed: { state: "none" }, brokenYaml: false }
  const owned = result.ownedFiles ?? []
  return {
    owned,
    ownedPaths: result.ownedFiles?.map((f) => f.path),
    proposed: commandId === "session-note" && owned.length === 0 ? parseProposedFacts(result.newText) : { state: "none" },
    brokenYaml:
      owned.some((f) => f.path.endsWith("company.yaml") && isBrokenYaml(f.newText)) ||
      (result.outputPath.endsWith("company.yaml") && isBrokenYaml(result.newText)),
  }
}

export function ProposedFactsPanel({ facts, checked, onToggle }: { facts: ProposedFact[]; checked: boolean[]; onToggle: (i: number) => void }) {
  return (
    <section className="fact-panel" aria-label="Proposed fact changes">
      <p className="fact-panel-head">Proposed fact changes</p>
      <ul>
        {facts.map((f, i) => (
          <li key={i} className="fact-row">
            <label>
              <input type="checkbox" checked={checked[i] ?? false} onChange={() => onToggle(i)} aria-label={`${f.target}: ${f.value}`} />
              <span>
                <b>{f.kind === "decision" ? "New decision" : f.target}</b>
                {f.was !== "none" && <> · <span className="sr-only">was </span><s>{f.was}</s> →</>} <span className="sr-only">now </span><span>{f.value}</span>
                {f.kind === "unconfirmed" && <em className="fact-unconfirmed"> · not settled</em>}
                <small className="fact-src">“{f.quote}”</small>
              </span>
            </label>
          </li>
        ))}
      </ul>
      <p className="fact-panel-note">Facts you leave unticked stay in the note; you can ask your agent to apply them later.</p>
    </section>
  )
}

function LinesNotice({ lines, text, show }: { lines: string[]; text: string; show: string }) {
  return (
    <li className="fact-row">
      <span>{text}</span>
      <details>
        <summary>{show}</summary>
        <ul>{lines.map((l, i) => <li key={i}><code>{l}</code></li>)}</ul>
      </details>
    </li>
  )
}

const APPLY_COMMAND_ID = "apply-session-facts"

/** An apply review has no session and no note, so its heading and drop button say so (v234 I8). */
export function liveFactsHeading(commandId: string): string {
  return commandId === APPLY_COMMAND_ID ? "Changes to your company facts" : "Facts this session changed"
}

/** What happened to one owned decision file. Unknown (`isNew === null`) gets neutral wording. */
export function decisionLabel(f: OwnedFile): string {
  if (f.isNew === null) return "Decision"
  if (f.isNew) return "New decision"
  return f.newText === "" ? "Removed decision" : "Changed decision"
}

export function LiveFactsPanel({ ownedFiles, commandId }: { ownedFiles: OwnedFile[]; commandId: string }) {
  const yaml = ownedFiles.find((f) => f.path.endsWith("company.yaml"))
  const changes = yaml ? sourcedChanges(yaml.oldText, yaml.newText) : []
  const unsourced = yaml ? unsourcedChanges(yaml.oldText, yaml.newText) : []
  const removed = yaml ? removedLines(yaml.oldText, yaml.newText) : []
  const decisions = ownedFiles.filter((f) => f.path.startsWith("docs/decisions/"))
  const plural = (n: number, one: string, many: string) => (n === 1 ? one : many)
  const heading = liveFactsHeading(commandId)
  return (
    <section className="fact-panel" aria-label={heading}>
      <p className="fact-panel-head">{heading}</p>
      <ul>
        {changes.map((c, i) => (
          <li key={`${c.field}-${i}`} className="fact-row">
            <b>{c.field}</b>{c.was !== null && <> · <span className="sr-only">was </span><s>{c.was}</s> →</>} <span className="sr-only">now </span><span>{c.now}</span>
            <small className="fact-src">source: {c.source}</small>
          </li>
        ))}
        {decisions.map((d) => {
          const label = decisionLabel(d)
          return (
            <li key={d.path} className="fact-row">
              <b>{label}</b> <small className="fact-src">{d.path.split("/").pop()}</small>
              <details>
                <summary>Show the decision</summary>
                <pre className="whitespace-pre-wrap text-xs">{label === "Removed decision" ? d.oldText : d.newText}</pre>
              </details>
            </li>
          )
        })}
        {unsourced.length > 0 && (
          <LinesNotice lines={unsourced} show="Show those lines"
            text={`${unsourced.length} other ${plural(unsourced.length, "line", "lines")} changed without a source`} />
        )}
        {removed.length > 0 && (
          <LinesNotice lines={removed} show="Show those lines"
            text={`${removed.length} ${plural(removed.length, "line", "lines")} removed`} />
        )}
      </ul>
    </section>
  )
}

export function FactNotices({ proposedState, brokenYaml }: { proposedState: ProposedFacts["state"]; brokenYaml: boolean }) {
  return (
    <>
      {proposedState === "unreadable" && (
        <p className="fact-panel-note" role="status">Couldn&apos;t read the proposed changes. You can still approve the note on its own.</p>
      )}
      {brokenYaml && (
        <p className="fact-panel-note" role="alert">This would break the company file, so it can&apos;t be approved. Ask for changes instead.</p>
      )}
    </>
  )
}

export function tickedLines(proposed: ProposedFacts, ticks: boolean[]): string[] {
  return proposed.state === "ok" ? proposed.facts.filter((_, i) => ticks[i]).map((f) => f.line) : []
}

export type ButtonSpec = { id: "apply" | "approve" | "approve-all" | "drop"; label: string; disabled: boolean }

/** Which buttons the review shows, and which are disabled. */
export function approveButtonState({ proposedState, hasOwned, tickedCount, busy, brokenYaml, commandId }: {
  proposedState: ProposedFacts["state"]; hasOwned: boolean; tickedCount: number; busy: boolean; brokenYaml: boolean; commandId: string
}): ButtonSpec[] {
  const off = busy || brokenYaml
  if (proposedState === "ok") {
    return [
      { id: "apply", label: applyLabel(tickedCount), disabled: tickedCount === 0 || off },
      { id: "approve", label: "Approve note only", disabled: off },
    ]
  }
  if (proposedState === "unreadable") return [{ id: "approve", label: "Approve note only", disabled: off }]
  if (hasOwned) {
    return [
      { id: "approve-all", label: "Approve all", disabled: off },
      { id: "drop", label: commandId === APPLY_COMMAND_ID ? "Drop these changes" : "Keep note, drop fact changes", disabled: busy },
    ]
  }
  return [{ id: "approve", label: "Review & approve", disabled: off }]
}

export type ApplyOutcome =
  | { kind: "save-failed"; message: string }
  | { kind: "saved-and-started" }
  | { kind: "saved-apply-failed"; message: string }

export const APPLY_FAILED = "The note was saved, but the fact changes couldn't be started."

/** Commit the note, then start the apply run. Apply is never attempted if the commit failed. */
export async function approveAndApply({ commit, apply, note, lines }: {
  commit: () => Promise<{ committed: boolean; message: string }>
  apply: (note: string, lines: string[]) => Promise<{ started: boolean; message: string }>
  note: string
  lines: string[]
}): Promise<ApplyOutcome> {
  const saved = await commit()
  if (!saved.committed) return { kind: "save-failed", message: saved.message }
  try {
    const applied = await apply(note, lines)
    return applied.started
      ? { kind: "saved-and-started" }
      : { kind: "saved-apply-failed", message: `${APPLY_FAILED} ${applied.message}`.trim() }
  } catch {
    return { kind: "saved-apply-failed", message: APPLY_FAILED }
  }
}

export function ApproveButtons({ commandId, proposedState, hasOwned, tickedCount, brokenYaml, busy, onApproveAndApply, onApprove, onDropFacts }: {
  commandId: string
  proposedState: ProposedFacts["state"]
  hasOwned: boolean
  tickedCount: number
  brokenYaml: boolean
  busy: boolean
  onApproveAndApply: () => void
  onApprove: () => void
  onDropFacts: () => void
}) {
  const onClick = { apply: onApproveAndApply, approve: onApprove, "approve-all": onApprove, drop: onDropFacts }
  return (
    <>
      {approveButtonState({ proposedState, hasOwned, tickedCount, busy, brokenYaml, commandId }).map((b) => (
        <Button key={b.id} size="sm" variant={b.id === "apply" || b.id === "approve-all" || (b.id === "approve" && proposedState === "none") ? "default" : "outline"}
          onClick={onClick[b.id]} disabled={b.disabled}>{b.label}</Button>
      ))}
    </>
  )
}
