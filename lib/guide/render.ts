import type { RenderedGuide } from "./apply"
import { END_MARKER, START_PREFIX, sha256 } from "./markers"

export const GUIDE_VERSION = 2

export type GuideDepartment = { slug: string; name: string; purpose: string }
export type GuideTeam = { id: string; label: string; summary: string; commands: string[] }
export type GuideCommand = { name: string; description: string }
export type GuideInputs = { departments: GuideDepartment[]; teams: GuideTeam[]; commands: GuideCommand[] }

const MAX_DESCRIPTION = 200

/**
 * Every value is untrusted data inside one line. Collapse control characters and newlines so a value cannot
 * start a new line, and defuse comment delimiters so it cannot open or close a marker.
 */
function esc(value: string, max?: number): string {
  let s = value
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/<!--/g, "<!- -")
    .replace(/-->/g, "- ->")
    .replace(/alacran:operating-guide:start/g, "alacran: operating-guide: start")
    .replace(/alacran:operating-guide:end/g, "alacran: operating-guide: end")
    .replace(/\s+/g, " ")
    .trim()
  if (max && [...s].length > max) s = `${[...s].slice(0, max - 1).join("").trimEnd()}…`
  return s
}

// First sentence only: pack skill descriptions end in a long list of trigger phrases the skill file already carries.
// "e.g." / "i.e." / "etc." do not end a sentence.
const SENTENCE_END = /^.*?(?<!\be\.g|\bi\.e|\betc)[.!?](?=\s|$)/

/** Cap at `max` code points; cut at a word boundary when there is one, so a word is never split. */
function summarise(value: string, max: number): string {
  const s = SENTENCE_END.exec(value)?.[0] ?? value
  const chars = [...s]
  if (chars.length <= max) return s
  let cut = chars.slice(0, max - 1)
  if (!/\s/.test(chars[max - 1])) {
    const at = cut.findLastIndex((c) => /\s/.test(c))
    if (at > 0) cut = cut.slice(0, at)
  }
  return `${cut.join("").trimEnd()}…`
}

const byKey = <T>(key: (t: T) => string) => (a: T, b: T) => {
  const ka = key(a)
  const kb = key(b)
  return ka < kb ? -1 : ka > kb ? 1 : 0
}

function normalise(inputs: GuideInputs): GuideInputs {
  return {
    departments: inputs.departments
      .map((d) => ({ slug: esc(d.slug), name: esc(d.name), purpose: esc(d.purpose, MAX_DESCRIPTION) }))
      .sort(byKey((d) => d.slug)),
    teams: inputs.teams
      .map((t) => ({ id: esc(t.id), label: esc(t.label), summary: esc(t.summary, 140), commands: t.commands.map((c) => esc(c)).sort() }))
      .sort(byKey((t) => t.id)),
    commands: inputs.commands
      .map((c) => ({ name: esc(c.name), description: summarise(esc(c.description), MAX_DESCRIPTION) }))
      .sort(byKey((c) => c.name)),
  }
}

const ROUTING = [
  "## How this company works",
  "",
  "Read the company's working agreement and current handoff first.",
  "For a task, pick the most relevant installed skill below, name it briefly,",
  "read it and follow it. Read the relevant department records as needed.",
  "Ask one focused question if the task or best skill is ambiguous. If no skill",
  "fits, say so and use ordinary assistance within the user's instructions.",
  "Before drafting anything for the owner, read definitions/preferences.md if it exists and follow it.",
  "After changing company files, run the available /verify command and report",
  "failures. When a piece of work is complete, offer /handoff.",
  "The company's money, contract, irreversible-operation, publication and",
  "credential gates still apply. This generated guide does not waive them.",
]

const NONE = "- (none yet)"

function bodyText(n: GuideInputs): string {
  const departments = n.departments.map((d) => `- ${d.name}: ${d.purpose} (records/${d.slug}/)`)
  const teams = n.teams.map(
    (t) => `- ${t.label}: ${t.summary}${t.commands.length ? ` Commands: ${t.commands.map((c) => `/${c}`).join(", ")}.` : ""} (skills in .agents/skills/)`
  )
  const commands = n.commands.map((c) => (c.description ? `- /${c.name}: ${c.description}` : `- /${c.name}`))
  return [
    ...ROUTING,
    "",
    "### Departments",
    ...(departments.length ? departments : [NONE]),
    "",
    "### Installed teams",
    ...(teams.length ? teams : [NONE]),
    "",
    "### Company commands",
    ...(commands.length ? commands : [NONE]),
    "",
  ].join("\n")
}

export function renderGuide(inputs: GuideInputs): RenderedGuide {
  const n = normalise(inputs)
  const body = bodyText(n)
  const fingerprint = sha256(JSON.stringify({ v: GUIDE_VERSION, ...n }))
  const bodyHash = sha256(body)
  const block = `${START_PREFIX} version=${GUIDE_VERSION} fingerprint=${fingerprint} body=${bodyHash} -->\n${body}${END_MARKER}`
  return { block, fingerprint, bodyHash }
}
