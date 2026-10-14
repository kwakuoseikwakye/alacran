import { parseBlock } from "./apply"
import type { RenderedGuide } from "./apply"
import { toLf } from "./markers"
import { evaluate, PLAIN } from "./refresh"
import type { GuideDeps, GuideState } from "./refresh"

export type ChangeKind = "new" | "reworded" | "removed"
export type GuideChange = { kind: ChangeKind; name: string; before?: string; after?: string }
export type GuideChangeSection = "teams" | "commands" | "departments" | "wording"
export type GuideChangeGroup = { section: GuideChangeSection; items: GuideChange[]; more: number }
export type GuideChangeCounts = { new: number; reworded: number; removed: number }
export type GuideProposal = {
  /** The body hash of the block that would be written: one id, one exact before/after. */
  id: string
  /** The body hash of the block now on disk. */
  baseBodyHash: string
  groups: GuideChangeGroup[]
  counts: GuideChangeCounts
  oldBody: string
  newBody: string
}
export type ProposalResult =
  | { kind: "none"; state: GuideState }
  | { kind: "proposal"; proposal: GuideProposal }

export const GROUP_LIMIT = 20
export const WORDING_NAME = "The guide's standard wording was updated"

type ListSection = "departments" | "teams" | "commands"
const HEADINGS: Record<string, ListSection> = {
  "### Departments": "departments",
  "### Installed teams": "teams",
  "### Company commands": "commands",
}
const NONE_LINE = "- (none yet)"
const DEPARTMENT_TAIL = /^(.*) \(records\/(.+)\/\)$/
const TEAM_TAIL = " (skills in .agents/skills/)"

type Item = { key: string; name: string; text: string; rest: string; line: string }

function parseItem(section: ListSection, line: string): Item {
  const rest = line.slice(2)
  let body = rest
  let key: string | null = null
  if (section === "departments") {
    const match = DEPARTMENT_TAIL.exec(rest)
    if (match) {
      body = match[1]
      key = match[2]
    }
  } else if (section === "teams" && rest.endsWith(TEAM_TAIL)) {
    body = rest.slice(0, -TEAM_TAIL.length)
  }
  const colon = body.indexOf(": ")
  const name = colon >= 0 ? body.slice(0, colon) : body
  const text = colon >= 0 ? body.slice(colon + 2) : ""
  return { key: key ?? name, name, text, rest, line }
}

/** Splits a block body into its three lists and everything else (the fixed wording and headings). */
function splitBody(body: string): { lists: Record<ListSection, Item[]>; other: string } {
  const lists: Record<ListSection, Item[]> = { departments: [], teams: [], commands: [] }
  const other: string[] = []
  let current: ListSection | null = null
  for (const line of toLf(body).split("\n")) {
    // Own keys only: a bare "constructor" or "__proto__" line is ordinary text, not a heading found on Object.prototype.
    const heading = Object.hasOwn(HEADINGS, line) ? HEADINGS[line] : undefined
    if (heading) {
      current = heading
      other.push(line)
    } else if (current && line === NONE_LINE) {
      continue
    } else if (current && line.startsWith("- ")) {
      lists[current].push(parseItem(current, line))
    } else {
      other.push(line)
    }
  }
  return { lists, other: other.join("\n") }
}

const KIND_ORDER: Record<ChangeKind, number> = { new: 0, reworded: 1, removed: 2 }
const byCode = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

function groupByKey(items: Item[]): Map<string, Item[]> {
  const map = new Map<string, Item[]>()
  for (const item of items) map.set(item.key, [...(map.get(item.key) ?? []), item])
  return map
}

function diffSection(oldItems: Item[], newItems: Item[]): GuideChange[] {
  const before = groupByKey(oldItems)
  const after = groupByKey(newItems)
  const out: GuideChange[] = []
  for (const key of new Set([...before.keys(), ...after.keys()])) {
    const was = before.get(key) ?? []
    const now = after.get(key) ?? []
    if (was.length === 1 && now.length === 1) {
      const [b] = was
      const [a] = now
      if (b.line === a.line) continue
      // Same description but a different line means the name or the path part changed: show the whole line then.
      const same = b.text === a.text
      out.push({ kind: "reworded", name: a.name, before: same ? b.rest : b.text, after: same ? a.rest : a.text })
      continue
    }
    // Missing or duplicated keys: compare whole lines, so the worst case is one Removed plus one New, never a wrong claim.
    const oldLines = new Set(was.map((i) => i.line))
    const newLines = new Set(now.map((i) => i.line))
    for (const i of now) if (!oldLines.has(i.line)) out.push({ kind: "new", name: i.name, after: i.text })
    for (const i of was) if (!newLines.has(i.line)) out.push({ kind: "removed", name: i.name, before: i.text })
  }
  return out.sort((a, b) => byCode(a.name, b.name) || KIND_ORDER[a.kind] - KIND_ORDER[b.kind])
}

/** Pure: what would change if `rendered` replaced the block whose body is `oldBody`. */
export function buildProposal(oldBody: string, rendered: RenderedGuide, baseBodyHash: string): GuideProposal {
  const parsedNew = parseBlock(rendered.block)
  const newBody = toLf(parsedNew.kind === "ok" ? parsedNew.body : rendered.block)
  const before = splitBody(oldBody)
  const after = splitBody(newBody)
  const groups: GuideChangeGroup[] = []
  const counts: GuideChangeCounts = { new: 0, reworded: 0, removed: 0 }
  const add = (section: GuideChangeSection, changes: GuideChange[]) => {
    if (!changes.length) return
    for (const change of changes) counts[change.kind] += 1
    groups.push({ section, items: changes.slice(0, GROUP_LIMIT), more: Math.max(0, changes.length - GROUP_LIMIT) })
  }
  add("teams", diffSection(before.lists.teams, after.lists.teams))
  add("commands", diffSection(before.lists.commands, after.lists.commands))
  add("departments", diffSection(before.lists.departments, after.lists.departments))
  // The wording item also covers bodies that differ only by order or a repeated line, so a proposal is never "0 changes".
  if (before.other !== after.other || (!groups.length && toLf(oldBody) !== newBody)) add("wording", [{ kind: "reworded", name: WORDING_NAME }])
  return { id: rendered.bodyHash, baseBodyHash, groups, counts, oldBody: toLf(oldBody), newBody }
}

/** Read-only. Never throws: any failure is a "needs attention" state, never a proposal. */
export async function proposeGuide(root: string, deps: GuideDeps): Promise<ProposalResult> {
  const unreadable: ProposalResult = { kind: "none", state: { state: "needs-attention", reason: "unreadable", detail: PLAIN } }
  try {
    const found = await evaluate(root, deps)
    if (found.kind === "absent") return { kind: "none", state: { state: "not-added" } }
    if (found.kind === "attention") return { kind: "none", state: { state: "needs-attention", reason: found.reason, detail: found.detail } }
    if (found.kind === "current") return { kind: "none", state: { state: "up-to-date" } }
    const parsed = parseBlock(found.text)
    if (parsed.kind !== "ok" || !parsed.bodyHash) return unreadable
    // Only the hidden fingerprint differs (for example a pack id changed): the text people and AIs read is the
    // same, so there is nothing to show or approve.
    if (parsed.bodyHash === found.rendered.bodyHash) return { kind: "none", state: { state: "up-to-date" } }
    return { kind: "proposal", proposal: buildProposal(parsed.body, found.rendered, parsed.bodyHash) }
  } catch {
    return unreadable
  }
}
