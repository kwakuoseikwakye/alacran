import { parse } from "yaml"
import { INITIAL_COMMIT_MESSAGE } from "@/lib/company-template-manifest"
import type { MemoryItem } from "@/lib/os/memory-items"
import type { SourcesState, StaleSection, UnfinishedItem } from "./types"

export const PROFILE_PATH = "definitions/ontology/company.yaml"
export const METADATA_KEYS = new Set(["meta", "created", "updated", "version", "schema_version", "status", "template_origin"])
export type Thresholds = { staleAfterDays: number; minNewerNotes: number }
export const DEFAULT_THRESHOLDS: Thresholds = { staleAfterDays: 90, minNewerNotes: 3 }

const DAY = 86400
const KEY = /^([A-Za-z_][\w-]*):/
const REC = "\x1e"
const FLD = "\x1f"

/** 1-based, inclusive. Sections come from the text lines, not a YAML parse, so a malformed file still gets dated. */
export type Section = { key: string; first: number; last: number }

export function parseSections(text: string): Section[] {
  const lines = text.split("\n")
  const all: Section[] = []
  lines.forEach((line, i) => {
    const m = KEY.exec(line)
    if (!m) return
    if (all.length) all[all.length - 1].last = i
    all.push({ key: m[1], first: i + 1, last: lines.length })
  })
  return all.filter((s) => !METADATA_KEYS.has(s.key))
}

export function labelOf(key: string): string {
  const words = key.replace(/[_-]+/g, " ").trim()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/** `git blame --line-porcelain` → final line number → author-time (unix seconds). */
export function parseBlameTimes(porcelain: string): Map<number, number> {
  const times = new Map<number, number>()
  let line = 0
  for (const l of porcelain.split("\n")) {
    const head = /^[0-9a-f]{40} \d+ (\d+)/.exec(l)
    if (head) {
      line = Number(head[1])
      continue
    }
    const t = /^author-time (\d+)$/.exec(l)
    if (t && line) times.set(line, Number(t[1]))
  }
  return times
}

function sectionDate(s: Section, lines: string[], times: Map<number, number>): number | null {
  let newest: number | null = null
  for (let n = s.first; n <= s.last; n++) {
    const text = lines[n - 1] ?? ""
    if (!text.trim() || /^\s*#/.test(text)) continue
    const t = times.get(n)
    if (t !== undefined && (newest === null || t > newest)) newest = t
  }
  return newest
}

export function findStale(a: { text: string; times: Map<number, number>; items: MemoryItem[]; nowSeconds: number; thresholds: Thresholds }): StaleSection[] {
  const lines = a.text.split("\n")
  const out: StaleSection[] = []
  for (const s of parseSections(a.text)) {
    const date = sectionDate(s, lines, a.times)
    if (date === null) continue
    const ageDays = Math.floor((a.nowSeconds - date) / DAY)
    const newer = a.items.filter((i) => i.changedAt > date)
    const newerNotes = newer.filter((i) => i.kind === "note").length
    const newerDecisions = newer.filter((i) => i.kind === "decision").length
    if (ageDays >= a.thresholds.staleAfterDays && newerNotes + newerDecisions >= a.thresholds.minNewerNotes) {
      out.push({ key: s.key, label: labelOf(s.key), ageDays, newerNotes, newerDecisions })
    }
  }
  return out
}

function isFactLine(added: string): boolean {
  if (!added.trim() || added.trim().startsWith("#")) return false
  const m = KEY.exec(added)
  if (m && METADATA_KEYS.has(m[1])) return false
  // -U0 patches carry no block context, so an indented `updated:` under `meta:` is exempted by key name.
  // `status` is not in this list: indented, it can be a real fact.
  return !/^\s*(updated|created|version|schema_version|template_origin)\s*:/.test(added)
}

/** Input: `git log --format=\x1e%H\x1f%s\x1f%B\x1f --patch -U0 -- company.yaml`, newest first. */
export function findSources(log: string): SourcesState {
  const sourced: boolean[] = []
  for (const chunk of log.split(REC)) {
    if (!chunk.trim()) continue
    const [, subject, body = "", patch = ""] = chunk.split(FLD)
    if (subject === INITIAL_COMMIT_MESSAGE) continue
    const added = patch.split("\n").filter((l) => l.startsWith("+") && !l.startsWith("+++")).map((l) => l.slice(1))
    if (!added.some(isFactLine)) continue
    sourced.push(added.some((l) => /#\s*source:/.test(l)) || body.includes("Applied facts from:"))
  }
  sourced.reverse() // oldest first
  const first = sourced.indexOf(true)
  if (first === -1) return { state: "not-tracked" }
  const range = sourced.slice(first)
  const yes = range.filter(Boolean).length
  return { state: "tracked", sourced: yes, unsourced: range.length - yes }
}

/** Input: `git grep -n -F "<<TODO" HEAD -- definitions` (READMEs excluded). */
export function findUnfinished(grep: string, profileText: string): UnfinishedItem[] {
  const sections = parseSections(profileText)
  const out: UnfinishedItem[] = []
  for (const l of grep.split("\n")) {
    const m = /^(?:HEAD:)?(.+?):(\d+):/.exec(l)
    if (!m) continue
    const [, file, num] = m
    const line = Number(num)
    if (file === PROFILE_PATH) {
      const s = sections.find((sec) => sec.first <= line && line <= sec.last)
      out.push({ where: s ? labelOf(s.key) : "Company profile", line })
    } else {
      const base = file.split("/").pop() ?? file
      out.push({ where: labelOf(base.replace(/\.[^.]+$/, "")), line })
    }
  }
  return out
}

function pick(v: unknown, lo: number, hi: number, fallback: number): number {
  return typeof v === "number" && Number.isInteger(v) && v >= lo && v <= hi ? v : fallback
}

export function parseThresholds(text: string | null): Thresholds {
  let raw: unknown = null
  try {
    raw = text === null ? null : parse(text)
  } catch {
    raw = null
  }
  const o = raw !== null && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {}
  return {
    staleAfterDays: pick(o.stale_after_days, 7, 730, DEFAULT_THRESHOLDS.staleAfterDays),
    minNewerNotes: pick(o.min_newer_notes, 1, 50, DEFAULT_THRESHOLDS.minNewerNotes),
  }
}
