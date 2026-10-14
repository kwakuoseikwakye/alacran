import path from "node:path"
import yaml from "yaml"
import { ZodError } from "zod"
import { memoizedReadFile } from "../file-memo"
import { WorkflowsFileSchema, type Workflow } from "../schemas/workflows"
import type { RecordResult } from "../records/read"

export async function readWorkflows(
  companyRoot: string,
  readFn?: (path: string) => Promise<string>,
  statFn?: (path: string) => Promise<{ mtimeMs: number }>
): Promise<RecordResult<Workflow>> {
  const filePath = path.join(companyRoot, "records", "workflows", "processes.yaml")
  try {
    const raw = await memoizedReadFile(filePath, readFn, statFn)
    const parsedYaml = yaml.parse(raw)
    if (!parsedYaml) {
      return { ok: true, records: [] }
    }
    const validated = WorkflowsFileSchema.parse(parsedYaml)
    return { ok: true, records: validated.records }
  } catch (err: unknown) {
    if (err && typeof err === "object" && "code" in err && err.code === "ENOENT") {
      return { ok: true, records: [] }
    }
    if (err instanceof Error && err.message.includes("ENOENT")) {
      return { ok: true, records: [] }
    }
    if (err instanceof ZodError) {
      const details = err.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")
      return {
        ok: false,
        error: `Invalid record format in ${path.basename(filePath)}: ${details}`,
        records: [],
      }
    }
    const message = err instanceof Error ? err.message : String(err)
    return {
      ok: false,
      error: `Failed to read ${path.basename(filePath)}: ${message}`,
      records: [],
    }
  }
}
