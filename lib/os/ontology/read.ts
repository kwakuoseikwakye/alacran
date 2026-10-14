import path from "node:path"
import { parse } from "yaml"
import { memoizedReadFile } from "../file-memo"
import { ontologySchema, type Ontology } from "./schema"

export type ReadOntologyResult =
  | { ok: true; ontology: Ontology }
  | { ok: false; message: string }

export const ONTOLOGY_RELATIVE_PATH = path.join("definitions", "ontology", "company.yaml")

/**
 * Validated on the way OUT of the file, so a hand-edited ontology fails loud
 * with the field named rather than rendering as an empty graph. A company that
 * has never run /define-company is not an error — it is "not configured", and
 * the caller renders an empty state that says so.
 */
export async function readOntology(
  companyRoot: string,
  readFn?: (p: string) => Promise<string>,
  statFn?: (p: string) => Promise<{ mtimeMs: number }>
): Promise<ReadOntologyResult> {
  const file = path.join(companyRoot, ONTOLOGY_RELATIVE_PATH)

  let raw: string
  try {
    raw = await memoizedReadFile(file, readFn, statFn)
  } catch {
    return { ok: false, message: "No ontology yet — run /define-company for this company." }
  }

  let doc: unknown
  try {
    doc = parse(raw)
  } catch {
    return { ok: false, message: "Could not parse company.yaml as YAML." }
  }

  const parsed = ontologySchema.safeParse(doc)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return { ok: false, message: `company.yaml is invalid at ${issue.path.join(".") || "(root)"}: ${issue.message}` }
  }
  return { ok: true, ontology: parsed.data }
}
