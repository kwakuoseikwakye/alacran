import { readdir, readFile } from "node:fs/promises"
import path from "node:path"
import { resolveTemplatesDir } from "./template-paths"

/**
 * Is this company.yaml a starter pack's example, untouched?
 *
 * Every pack copies an example company file into a new company, so "the file
 * exists and parses" is true for a company nobody has described yet. Home used
 * that to say "Your company profile is ready". A file the setup wizard, the
 * define-company job, or a person has changed is no longer byte-identical to
 * any pack's example, which is the honest signal either way it was filled in.
 */
export async function isUntouchedStarterExample(
  companyYaml: string,
  templatesDir: () => string = resolveTemplatesDir
): Promise<boolean> {
  const text = companyYaml.trim()
  if (!text) return false
  try {
    const packsRoot = path.join(templatesDir(), "packs")
    const packs = await readdir(packsRoot)
    for (const pack of packs) {
      const example = await readFile(path.join(packsRoot, pack, "definitions", "ontology", "company.yaml"), "utf-8").catch(() => null)
      if (example !== null && example.trim() === text) return true
    }
  } catch {
    // Templates not found: can't tell, so don't claim it's an example.
  }
  return false
}
