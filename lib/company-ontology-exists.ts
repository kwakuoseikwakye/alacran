import { stat } from "node:fs/promises"
import path from "node:path"

export async function companyOntologyExists(rootPath: string): Promise<boolean> {
  try {
    await stat(path.join(rootPath, "definitions", "ontology", "company.yaml"))
    return true
  } catch {
    return false
  }
}
