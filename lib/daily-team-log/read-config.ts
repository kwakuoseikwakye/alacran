import { readFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

export type DailyTeamLogConfig = {
  person: string
  outputRepo: string
  clone: string
  gatherPath: string
  skillMdPath: string
}

export type ReadConfigResult =
  | { ok: true; config: DailyTeamLogConfig }
  | { ok: false; reason: "not-found" | "not-bootstrapped" | "invalid" }

const DEFAULT_CONFIG_PATH = path.join(os.homedir(), ".claude", "daily-team-log", "config.json")

export async function readDailyTeamLogConfig(
  configPath: string = DEFAULT_CONFIG_PATH
): Promise<ReadConfigResult> {
  let raw: string
  try {
    raw = await readFile(configPath, "utf-8")
  } catch {
    return { ok: false, reason: "not-found" }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { ok: false, reason: "invalid" }
  }

  if (typeof parsed !== "object" || parsed === null) {
    return { ok: false, reason: "invalid" }
  }
  const obj = parsed as Record<string, unknown>

  if (obj.bootstrapped !== true) {
    return { ok: false, reason: "not-bootstrapped" }
  }
  if (typeof obj.person !== "string" || obj.person.trim() === "") {
    return { ok: false, reason: "invalid" }
  }
  if (typeof obj.output_repo !== "string" || obj.output_repo.trim() === "") {
    return { ok: false, reason: "invalid" }
  }

  const outputRepo = obj.output_repo
  const clone = path.dirname(outputRepo)

  return {
    ok: true,
    config: {
      person: obj.person,
      outputRepo,
      clone,
      gatherPath: path.join(clone, "workflow", "daily-team-log", "gather.py"),
      skillMdPath: path.join(clone, "workflow", "daily-team-log", "SKILL.md"),
    },
  }
}
