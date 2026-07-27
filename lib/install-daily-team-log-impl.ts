import { writeFile, mkdir, cp, stat } from "node:fs/promises"
import path from "node:path"
import { getEffectiveAgents } from "./get-effective-agents"
import { AGENTS } from "./config"
import { DAILY_TEAM_LOG_MANIFEST, DAILY_TEAM_LOG_SETUP_MD, buildDailyTeamLogSkillMd } from "./daily-team-log-files"
import { commitFile } from "./git-commit-file"
import type { ExecFileFn } from "./git-commit-file"

async function pathExists(p: string): Promise<boolean> {
  try {
    await stat(p)
    return true
  } catch {
    return false
  }
}

export async function installDailyTeamLogImpl(
  agentId: string,
  execFn?: ExecFileFn
): Promise<{ ok: true } | { ok: false; message: string }> {
  const plhOpsAgent = AGENTS.find((a) => a.id === "plh-ops")
  if (!plhOpsAgent) {
    return { ok: false, message: "Source workflow (plh-ops) is not configured" }
  }

  const agents = await getEffectiveAgents()
  const agent = agents.find((a) => a.id === agentId)
  if (!agent) {
    return { ok: false, message: "Unknown company" }
  }

  const skillDir = path.join(agent.rootPath, ".claude", "skills", "daily-team-log")

  try {
    await mkdir(skillDir, { recursive: true })

    for (const relativePath of DAILY_TEAM_LOG_MANIFEST) {
      const source = path.join(plhOpsAgent.rootPath, relativePath)
      if (!(await pathExists(source))) continue
      const target = path.join(skillDir, path.basename(relativePath))
      await cp(source, target)
    }

    await writeFile(path.join(skillDir, "SKILL.md"), buildDailyTeamLogSkillMd(agent.name), "utf-8")
    await writeFile(path.join(skillDir, "Setup.md"), DAILY_TEAM_LOG_SETUP_MD, "utf-8")
  } catch (err) {
    return {
      ok: false,
      message: `Failed to install daily-team-log: ${err instanceof Error ? err.message : String(err)}`,
    }
  }

  const relativeSkillDir = path.join(".claude", "skills", "daily-team-log")
  await commitFile(agent.rootPath, relativeSkillDir, "Install daily-team-log via AI-Native control panel", execFn)

  return { ok: true }
}
