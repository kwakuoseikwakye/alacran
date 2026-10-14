import * as path from "node:path"
import { parse as parseYaml } from "yaml"
import { memoizedReadFile } from "../file-memo"
import { RoadmapFileSchema, type RoadmapFile } from "../schemas/roadmap"

export async function readRoadmap(
  companyRoot: string,
  readFn?: (path: string) => Promise<string>,
  statFn?: (path: string) => Promise<{ mtimeMs: number }>
): Promise<RoadmapFile> {
  const filePath = path.join(companyRoot, "records", "roadmap", "milestones.yaml")
  try {
    const raw = await memoizedReadFile(filePath, readFn, statFn)
    if (!raw.trim()) {
      return { phases: [], milestones: [] }
    }
    const parsed = parseYaml(raw)
    const validated = RoadmapFileSchema.safeParse(parsed)
    if (!validated.success) {
      console.warn(`[readRoadmap] Validation error in ${filePath}:`, validated.error.issues)
      return { phases: [], milestones: [] }
    }
    return validated.data
  } catch (err) {
    console.warn(`[readRoadmap] Error reading or parsing ${filePath}:`, err)
    return { phases: [], milestones: [] }
  }
}
