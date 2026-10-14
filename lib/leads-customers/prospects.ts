import { readdir, readFile } from "node:fs/promises"
import path from "node:path"
import { parse } from "yaml"
import { PROSPECTS_DIR } from "./research-prospects-command"

export { PROSPECTS_DIR }

export type ProspectState = "waiting" | "ready" | "contacted"

export type Prospect = {
  id: string
  fileName: string
  relativePath: string
  state: ProspectState
  name: string
  role: string
  company: string
  url: string
  fitScore: number
  fitLevel: "high" | "medium" | "low"
  estimatedValue: number
  rationale: string
  painPoints: string
  pitch: string
  status: string
  created: string
  updated: string
  contactedOn?: string
  problems: string[]
}

export function isSafeProspectFileName(name: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._-]*\.md$/.test(name) && !name.includes("..")
}

function splitFrontmatter(text: string): { meta: Record<string, unknown>; body: string } {
  if (!text.startsWith("---")) return { meta: {}, body: text }
  const end = text.indexOf("\n---", 3)
  if (end === -1) return { meta: {}, body: text }
  let meta: Record<string, unknown> = {}
  try {
    const parsed = parse(text.slice(3, end))
    if (parsed && typeof parsed === "object") meta = parsed as Record<string, unknown>
  } catch {
    // Unparseable frontmatter results in empty meta
  }
  return { meta, body: text.slice(end + 4) }
}

function section(body: string, heading: string): string {
  const match = new RegExp(`^## ${heading}\\s*\\n([\\s\\S]*?)(?=^## |$(?![\\s\\S]))`, "m").exec(body)
  return match ? match[1].trim() : ""
}

const str = (v: unknown): string | undefined =>
  typeof v === "string" && v.trim() ? v.trim() : typeof v === "number" ? String(v) : undefined

const num = (v: unknown, fallback: number): number => {
  const n = typeof v === "number" ? v : Number.parseInt(String(v ?? ""), 10)
  return Number.isFinite(n) ? n : fallback
}

export function parseProspect(fileName: string, text: string, state: ProspectState): Prospect {
  const { meta, body } = splitFrontmatter(text)
  const rationale = section(body, "ICP Fit Rationale")
  const painPoints = section(body, "Company Background & Pain Points")
  const pitch = section(body, "Suggested Outreach Angle")
  const slug = fileName.replace(/\.md$/, "")

  const fitScore = num(meta.fit_score, 80)
  const fitLevel = (meta.fit_level === "high" || meta.fit_level === "medium" || meta.fit_level === "low")
    ? meta.fit_level
    : fitScore >= 85 ? "high" : fitScore >= 60 ? "medium" : "low"

  const problems: string[] = []
  if (!pitch && !rationale) {
    problems.push("This prospect is missing outreach details.")
  }

  return {
    id: str(meta.id) ?? `lead-${slug}`,
    fileName,
    relativePath: `${PROSPECTS_DIR}/${fileName}`,
    state,
    name: str(meta.name) ?? "Decision Maker",
    role: str(meta.role) ?? "Executive",
    company: str(meta.company) ?? slug,
    url: str(meta.url) ?? "",
    fitScore,
    fitLevel,
    estimatedValue: num(meta.estimated_value, 5000),
    rationale,
    painPoints,
    pitch,
    status: str(meta.status) ?? "draft",
    created: str(meta.created) ?? new Date().toISOString().slice(0, 10),
    updated: str(meta.updated) ?? new Date().toISOString().slice(0, 10),
    contactedOn: str(meta.contacted_on),
    problems,
  }
}

async function pendingBefore(runRecordPath: string): Promise<string[] | null> {
  try {
    const record = JSON.parse(await readFile(runRecordPath, "utf-8"))
    return Array.isArray(record.before) ? record.before : null
  } catch {
    return null
  }
}

export async function listProspects(rootPath: string, runRecordPath: string): Promise<Prospect[]> {
  const dir = path.join(rootPath, PROSPECTS_DIR)
  const names = (await readdir(dir).catch(() => [] as string[])).filter(isSafeProspectFileName).sort()
  const before = await pendingBefore(runRecordPath)

  return Promise.all(
    names.map(async (name) => {
      let text = ""
      try {
        text = await readFile(path.join(dir, name), "utf-8")
      } catch {
        const state: ProspectState = before && !before.includes(name) ? "waiting" : "ready"
        const p = parseProspect(name, "", state)
        return { ...p, problems: ["This prospect file could not be read."] }
      }
      const raw = parseProspect(name, text, "ready")
      const state: ProspectState =
        before && !before.includes(name)
          ? "waiting"
          : raw.status === "contacted"
          ? "contacted"
          : "ready"
      return { ...raw, state }
    })
  )
}
