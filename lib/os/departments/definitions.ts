import crypto from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import yaml from "yaml"
import { z } from "zod"
import { MAX_NAME, MAX_PURPOSE, RESERVED_SLUGS, SLUG_PATTERN } from "./rules"

export const DEFINITIONS_REL = "definitions/departments.yaml"

export type DepartmentDefinition = { slug: string; name: string; purpose: string; color: string }

export type DefinitionsRead =
  | { ok: true; departments: DepartmentDefinition[]; revision: string; text: string | null }
  | { ok: false; error: string; revision: string }

const entry = z.object({
  slug: z.string().regex(SLUG_PATTERN, "slug must be lowercase letters, digits and hyphens").refine((s) => !RESERVED_SLUGS.has(s), "slug is reserved"),
  name: z.string().trim().min(1).max(MAX_NAME),
  purpose: z.string().trim().max(MAX_PURPOSE),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "colour must be #rrggbb"),
})
// Loose: other top-level keys are the owner's and must survive a rewrite.
const file = z.looseObject({ departments: z.array(entry).nullish() })

export const revisionOf = (text: string | null): string =>
  text === null ? "absent" : crypto.createHash("sha1").update(text).digest("hex")

/** Read-only and synchronous (the registry is). Never throws; a bad file is a visible error. */
export function readDefinitions(companyRoot: string): DefinitionsRead {
  let text: string | null = null
  try {
    text = fs.readFileSync(path.join(companyRoot, DEFINITIONS_REL), "utf8")
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      return { ok: false, error: `${DEFINITIONS_REL} can't be read.`, revision: "unreadable" }
    }
  }
  const revision = revisionOf(text)
  if (text === null) return { ok: true, departments: [], revision, text }
  let raw: unknown
  try {
    raw = yaml.parse(text)
  } catch {
    return { ok: false, error: `${DEFINITIONS_REL} isn't valid YAML. Fix it by hand before changing departments.`, revision }
  }
  if (raw === null || raw === undefined) return { ok: true, departments: [], revision, text }
  const parsed = file.safeParse(raw)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return { ok: false, error: `${DEFINITIONS_REL} has an entry that isn't valid (${issue.path.join(".")}: ${issue.message}).`, revision }
  }
  const departments = parsed.data.departments ?? []
  const slugs = departments.map((d) => d.slug)
  const dup = slugs.find((s, i) => slugs.indexOf(s) !== i)
  if (dup) return { ok: false, error: `${DEFINITIONS_REL} lists "${dup}" twice.`, revision }
  return { ok: true, departments, revision, text }
}
