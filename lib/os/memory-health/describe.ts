import type { MemoryHealth } from "./types"

export type HealthFix = { kind: "refresh" | "finish"; label: string }
export type HealthRow = { id: string; title: string; why: string; fix: HealthFix | null }
export type HealthGroup = { heading: string; rows: HealthRow[] }
export type HealthView =
  | { kind: "hidden" }
  | { kind: "unknown"; text: string }
  | { kind: "clean"; score: number; text: string; note: string | null }
  | { kind: "card"; score: number; pill: string; groups: HealthGroup[] }

const REFRESH: HealthFix = { kind: "refresh", label: "Check it with refresh" }
const FINISH: HealthFix = { kind: "finish", label: "Finish company setup" }
const NOT_TRACKED = `Sources aren't tracked yet. New facts get a source automatically when you press "Save what we learned".`
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

export function describeMemoryHealth(h: MemoryHealth): HealthView {
  if (h.state === "none") return { kind: "hidden" }
  if (h.state === "unknown") return { kind: "unknown", text: "Couldn't check memory health." }

  const stale: HealthRow[] = h.stale.map((s) => {
    const saved = [s.newerNotes > 0 && plural(s.newerNotes, "note"), s.newerDecisions > 0 && plural(s.newerDecisions, "decision")].filter(Boolean).join(" and ")
    return { id: `stale-${s.key}`, title: s.label, why: `Last changed ${plural(s.ageDays, "day")} ago. ${saved} saved since.`, fix: REFRESH }
  })

  const places = new Map<string, number>()
  for (const u of h.unfinished) places.set(u.where, (places.get(u.where) ?? 0) + 1)
  const unfinished: HealthRow[] = [...places].map(([where, count]) => ({
    id: `unfinished-${where}`,
    title: where,
    why: count === 1 ? "Still has a placeholder to fill in." : `Still has ${count} placeholders to fill in.`,
    fix: FINISH,
  }))

  const sources: HealthRow[] = []
  let sourcesProblem = 0
  if (h.sources.state === "not-tracked") {
    sources.push({ id: "sources-not-tracked", title: "Sources aren't tracked yet", why: `New facts get a source automatically when you press "Save what we learned".`, fix: null })
  } else if (h.sources.unsourced > 0) {
    const total = h.sources.sourced + h.sources.unsourced
    sourcesProblem = 1
    sources.push({ id: "sources-missing", title: "Some changes have no source", why: `${h.sources.unsourced} of ${total} recent fact changes have no recorded source.`, fix: REFRESH })
  }

  const count = stale.length + unfinished.length + sourcesProblem
  if (count === 0) {
    return { kind: "clean", score: h.score, text: `Memory health ${h.score} · Nothing out of date that Alacrán can see.`, note: h.sources.state === "not-tracked" ? NOT_TRACKED : null }
  }
  const groups: HealthGroup[] = [
    { heading: "Might be out of date", rows: stale },
    { heading: "Not finished", rows: unfinished },
    { heading: "Sources", rows: sources },
  ].filter((g) => g.rows.length > 0)
  return { kind: "card", score: h.score, pill: `${plural(count, "thing")} to look at`, groups }
}

/** Home's one extra line: only when there is a score below 100 and something to look at. */
export function describeHomeLine(h: MemoryHealth): string | null {
  const v = describeMemoryHealth(h)
  return v.kind === "card" && v.score < 100 ? `Memory health ${v.score} · ${v.pill}` : null
}
