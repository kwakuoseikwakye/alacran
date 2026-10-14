import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, it, expect, vi } from "vitest"
import type { ProposedFact } from "@/lib/company-commands/fact-changes"
import type { CompanyCommandResult } from "@/lib/company-commands/company-command-result-impl"
import { LiveFactsPanel, ProposedFactsPanel, decisionLabel, FactNotices, ApproveButtons, applyLabel, deriveFactState, tickedLines, approveButtonState, approveAndApply } from "./fact-changes-panel"

globalThis.React = React
const html = (el: React.ReactElement) => renderToStaticMarkup(el)

const facts: ProposedFact[] = [
  { kind: "fact", target: "pricing", value: "fixed-scope projects", was: "hourly", quote: "We quote per project.", line: "l1" },
  { kind: "unconfirmed", target: "segment", value: "hotels", was: "cafés", quote: "Maybe hotels.", line: "l2" },
]

function findInputs(node: unknown, out: { props: Record<string, unknown> }[] = []) {
  if (Array.isArray(node)) node.forEach((n) => findInputs(n, out))
  else if (node && typeof node === "object" && "props" in node) {
    const el = node as { type: unknown; props: Record<string, unknown> }
    if (el.type === "input") out.push(el)
    findInputs(el.props.children, out)
  }
  return out
}

describe("ProposedFactsPanel", () => {
  it("shows was and now with the quote, and a labelled checkbox per row", () => {
    const m = html(<ProposedFactsPanel facts={facts} checked={[true, false]} onToggle={() => {}} />)
    expect(m).toContain("<s>hourly</s>")
    expect(m).toContain("fixed-scope projects")
    expect(m).toContain("We quote per project.")
    expect(m).toContain('aria-label="pricing: fixed-scope projects"')
    expect(m).toContain("not settled")
    const inputs = findInputs(ProposedFactsPanel({ facts, checked: [true, false], onToggle: () => {} }))
    expect(inputs.map((i) => i.props.checked)).toEqual([true, false])
  })
  it("says unticked facts stay in the note, and renders two identical lines as two rows", () => {
    const twin = [facts[0], { ...facts[0] }]
    const m = html(<ProposedFactsPanel facts={twin} checked={[true, true]} onToggle={() => {}} />)
    expect(m).toContain("Facts you leave unticked stay in the note; you can ask your agent to apply them later.")
    expect(findInputs(ProposedFactsPanel({ facts: twin, checked: [true, true], onToggle: () => {} }))).toHaveLength(2)
  })
  it("reports toggles by row index", () => {
    const onToggle = vi.fn()
    const inputs = findInputs(ProposedFactsPanel({ facts, checked: [true, false], onToggle }))
    ;(inputs[1].props.onChange as () => void)()
    expect(onToggle).toHaveBeenCalledWith(1)
  })
})

describe("applyLabel", () => {
  it("counts ticked facts in the button phrase", () => {
    expect(applyLabel(2)).toBe("Approve note and apply 2 facts")
    expect(applyLabel(1)).toBe("Approve note and apply 1 fact")
  })
})

const yamlFile = (oldText: string, newText: string) => ({ path: "definitions/ontology/company.yaml", isNew: false, oldText, newText })

describe("LiveFactsPanel", () => {
  it("lists sourced company.yaml changes and new decisions by file name only", () => {
    const m = html(<LiveFactsPanel commandId="session-note" ownedFiles={[
      yamlFile("pricing: hourly\n", "pricing: fixed  # source: notes/company/sessions/a.md, 2026-10-14\n"),
      { path: "docs/decisions/2026-10-14-minimum-length.md", isNew: true, oldText: "", newText: "# Minimum length\n" },
    ]} />)
    expect(m).toContain("Facts this session changed")
    expect(m).toContain("<s>hourly</s>")
    expect(m).toContain("2026-10-14-minimum-length.md")
    expect(m).not.toContain("docs/decisions")
    expect(m).not.toContain("other line")
    expect(m).not.toContain("removed")
  })
  it("tells the owner about unsourced changes and removed lines", () => {
    const m = html(<LiveFactsPanel commandId="session-note" ownedFiles={[yamlFile("a: 1\nb: 2\nc: 3\n", "a: 1\nc: 3\nd: 4\ne: 5\n")]} />)
    expect(m).toContain("2 other lines changed without a source")
    expect(m).toContain("1 line removed")
    expect(m).toContain("Show those lines")
    expect(m).toContain("d: 4")
    expect(m).toContain("b: 2")
  })
  it("shows each decision's text behind a toggle, labelled by what happened to it", () => {
    const dec = (isNew: boolean | null, oldText: string, newText: string) => ({ path: "docs/decisions/2026-10-14-x.md", isNew, oldText, newText })
    const m = html(<LiveFactsPanel commandId="session-note" ownedFiles={[dec(true, "", "# We charge per project\n")]} />)
    expect(m).toContain("<b>New decision</b>")
    expect(m).toContain("<summary>Show the decision</summary>")
    expect(m).toContain("# We charge per project")
    const removed = html(<LiveFactsPanel commandId="session-note" ownedFiles={[dec(false, "# Old call\n", "")]} />)
    expect(removed).toContain("<b>Removed decision</b>")
    expect(removed).toContain("# Old call")
    expect(decisionLabel(dec(false, "a", "b"))).toBe("Changed decision")
    expect(decisionLabel(dec(null, "", "b"))).toBe("Decision")
    expect(decisionLabel(dec(null, "", ""))).toBe("Decision")
  })
  it("titles an apply review for company facts, not a session", () => {
    const m = html(<LiveFactsPanel commandId="apply-session-facts" ownedFiles={[{ path: "docs/decisions/x.md", isNew: true, oldText: "", newText: "d" }]} />)
    expect(m).toContain("Changes to your company facts")
    expect(m).not.toContain("this session")
  })
  it("uses the singular for one unsourced line", () => {
    expect(html(<LiveFactsPanel commandId="session-note" ownedFiles={[yamlFile("", "d: 4\n")]} />)).toContain("1 other line changed without a source")
  })
})

const NOTE = "# S\n\n## Proposed fact changes\n"
const note = (tail: string): CompanyCommandResult => ({
  changed: true, outputPath: "notes/company/sessions/a.md", oldText: "", newText: NOTE + tail, extraFiles: [], strays: null,
})
const FACT = '- fact | pricing | fixed | was: hourly | "q"\n- unconfirmed | segment | hotels | was: cafés | "m"'

describe("TaskCard cases", () => {
  const btn = (el: React.ReactElement) => html(el)
  it("offers approve-and-apply for an automatic note with proposed facts (unconfirmed starts unticked)", () => {
    const s = deriveFactState("session-note", note(FACT))
    expect(s.proposed.state).toBe("ok")
    if (s.proposed.state !== "ok") return
    expect(s.proposed.facts.filter((f) => f.kind !== "unconfirmed")).toHaveLength(1)
    const m = btn(<ApproveButtons commandId="session-note" proposedState="ok" hasOwned={false} tickedCount={1} brokenYaml={false} busy={false} onApproveAndApply={() => {}} onApprove={() => {}} onDropFacts={() => {}} />)
    expect(m).toContain("Approve note and apply 1 fact<")
    expect(m).toContain("Approve note only")
  })
  it("says it couldn't read a malformed section and offers no apply button", () => {
    const s = deriveFactState("session-note", note("- something improvised"))
    expect(s.proposed.state).toBe("unreadable")
    const m = html(<FactNotices proposedState="unreadable" brokenYaml={false} />)
    expect(m).toContain("Couldn&#x27;t read the proposed changes")
    expect(m).toContain('role="status"')
    const b = btn(<ApproveButtons commandId="session-note" proposedState="unreadable" hasOwned={false} tickedCount={0} brokenYaml={false} busy={false} onApproveAndApply={() => {}} onApprove={() => {}} onDropFacts={() => {}} />)
    expect(b).not.toContain("apply")
    expect(b).toContain("Approve note only")
    expect(b).not.toContain("Review &amp; approve")
    expect(b).not.toContain("Approve all")
  })
  it("shows owned paths for High risk, plus Approve all and the drop button, when the result has owned files", () => {
    const r = { ...note(""), ownedFiles: [yamlFile("pricing: hourly\n", "pricing: fixed  # source: s\n")] }
    const s = deriveFactState("session-note", r)
    expect(s.ownedPaths).toEqual(["definitions/ontology/company.yaml"])
    expect(s.proposed.state).toBe("none")
    const m = btn(<ApproveButtons commandId="session-note" proposedState="none" hasOwned tickedCount={0} brokenYaml={false} busy={false} onApproveAndApply={() => {}} onApprove={() => {}} onDropFacts={() => {}} />)
    expect(m).toContain("Approve all")
    expect(m).toContain("Keep note, drop fact changes")
  })
  it("disables approval when the company file would break", () => {
    const r = { ...note(""), ownedFiles: [yamlFile("a: 1\n", "a: [1, 2\n")] }
    const s = deriveFactState("session-note", r)
    expect(s.brokenYaml).toBe(true)
    expect(html(<FactNotices proposedState="none" brokenYaml />)).toContain("This would break the company file")
    const m = btn(<ApproveButtons commandId="session-note" proposedState="none" hasOwned tickedCount={0} brokenYaml busy={false} onApproveAndApply={() => {}} onApprove={() => {}} onDropFacts={() => {}} />)
    expect(m).toMatch(/<button[^>]*disabled[^>]*>Approve all/)
  })
})

describe("tickedLines", () => {
  it("returns the exact line of ticked rows, in order", () => {
    expect(tickedLines({ state: "ok", facts }, [true, true])).toEqual(["l1", "l2"])
    expect(tickedLines({ state: "ok", facts }, [false, true])).toEqual(["l2"])
    expect(tickedLines({ state: "none" }, [true])).toEqual([])
  })
})

describe("approveButtonState", () => {
  const base = { commandId: "session-note", hasOwned: false, tickedCount: 0, busy: false, brokenYaml: false }
  it("unreadable offers only the note-only button", () => {
    expect(approveButtonState({ ...base, proposedState: "unreadable" })).toEqual([{ id: "approve", label: "Approve note only", disabled: false }])
  })
  it("ok with none ticked disables apply; with two ticked labels it", () => {
    const zero = approveButtonState({ ...base, proposedState: "ok" })
    expect(zero[0]).toMatchObject({ id: "apply", disabled: true })
    const two = approveButtonState({ ...base, proposedState: "ok", tickedCount: 2 })
    expect(two[0]).toEqual({ id: "apply", label: "Approve note and apply 2 facts", disabled: false })
    expect(two[1]).toMatchObject({ id: "approve", label: "Approve note only" })
  })
  it("owned offers Approve all and drop", () => {
    expect(approveButtonState({ ...base, proposedState: "none", hasOwned: true }).map((b) => b.label)).toEqual(["Approve all", "Keep note, drop fact changes"])
  })
  it("labels the drop button for an apply review without mentioning a note", () => {
    expect(approveButtonState({ ...base, commandId: "apply-session-facts", proposedState: "none", hasOwned: true }).map((b) => b.label)).toEqual(["Approve all", "Drop these changes"])
  })
  it("brokenYaml disables every approve button but not drop; busy disables all", () => {
    const broken = approveButtonState({ ...base, proposedState: "none", hasOwned: true, brokenYaml: true })
    expect(broken.map((b) => b.disabled)).toEqual([true, false])
    for (const ps of ["ok", "unreadable", "none"] as const) {
      expect(approveButtonState({ ...base, proposedState: ps, tickedCount: 1, brokenYaml: true }).every((b) => b.id === "drop" || b.disabled)).toBe(true)
      expect(approveButtonState({ ...base, proposedState: ps, tickedCount: 1, busy: true }).every((b) => b.disabled)).toBe(true)
    }
  })
})

describe("approveAndApply", () => {
  const args = (over: Partial<Parameters<typeof approveAndApply>[0]> = {}) => ({
    commit: vi.fn(async () => ({ committed: true, message: "ok" })),
    apply: vi.fn(async () => ({ started: true, message: "started" })),
    note: "notes/company/sessions/a.md", lines: ["l1"], ...over,
  })
  it("does not apply when the commit fails", async () => {
    const a = args({ commit: vi.fn(async () => ({ committed: false, message: "nope" })) })
    expect(await approveAndApply(a)).toEqual({ kind: "save-failed", message: "nope" })
    expect(a.apply).not.toHaveBeenCalled()
  })
  it("applies with the note path as given and reports started", async () => {
    const a = args()
    expect(await approveAndApply(a)).toEqual({ kind: "saved-and-started" })
    expect(a.apply).toHaveBeenCalledWith("notes/company/sessions/a.md", ["l1"])
  })
  it("reports started:false with the apply message", async () => {
    const a = args({ apply: vi.fn(async () => ({ started: false, message: "Another job is running." })) })
    expect(await approveAndApply(a)).toEqual({ kind: "saved-apply-failed", message: "The note was saved, but the fact changes couldn't be started. Another job is running." })
  })
  it("never leaks a thrown error's text", async () => {
    const a = args({ apply: vi.fn(async () => { throw new Error("secret /path stack") }) })
    const out = await approveAndApply(a)
    expect(out).toEqual({ kind: "saved-apply-failed", message: "The note was saved, but the fact changes couldn't be started." })
  })
})

describe("screen reader text", () => {
  it("labels was and now", () => {
    const m = html(<ProposedFactsPanel facts={facts} checked={[true, false]} onToggle={() => {}} />)
    expect(m).toContain('<span class="sr-only">was </span>')
    expect(m).toContain('<span class="sr-only">now </span>')
  })
})
