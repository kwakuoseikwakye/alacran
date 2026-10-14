import { readFile, writeFile, rename, unlink } from "node:fs/promises"
import { homedir } from "node:os"
import path from "node:path"

/**
 * Mark a company directory as trusted in Claude Code's own config, so the
 * company's `.claude/settings.json` actually applies the first time an agent
 * runs there.
 *
 * Without this, Claude Code opens a freshly scaffolded company and says
 * "Ignoring 5 permissions.allow entries from .claude/settings.json: this
 * workspace has not been trusted", then denies the very commands the template
 * ships to make the company work (`git status`, `git log`, `git diff`,
 * `python3 scripts/verify.py`). Reported from a real Ubuntu onboarding: the
 * user created their first company and the agent immediately hit permission
 * denials in it.
 *
 * **Why this is not simply auto-accepting a security prompt.** That dialog
 * exists so that opening SOMEONE ELSE'S directory can't silently activate a
 * `.claude/settings.json` they wrote. This is only ever called for a company
 * this app just scaffolded from its OWN bundled template, whose settings file
 * this repo ships and whose contents are four read-only git commands plus a
 * `deny` on `secrets/**` — there is no third-party content in it to trust.
 * It is deliberately NOT called for a registered or adopted directory, where
 * the files really did come from somewhere else and the prompt is doing its
 * job. Keep that boundary if this ever gets another caller.
 */
export function defaultClaudeConfigPath(
  env: Record<string, string | undefined> = process.env,
  home: string = homedir()
): string {
  // Claude Code keeps this beside the config dir when CLAUDE_CONFIG_DIR is set,
  // and at ~/.claude.json otherwise.
  const configDir = env.CLAUDE_CONFIG_DIR?.trim()
  return configDir ? path.join(configDir, ".claude.json") : path.join(home, ".claude.json")
}

/**
 * Best-effort by contract: every failure path returns false rather than
 * throwing, because a company that scaffolded fine must not be reported as
 * failed over a config file this app does not own. The cost of losing is one
 * trust prompt the user can still accept by hand.
 */
export async function trustCompanyDirImpl(
  rootPath: string,
  configPath: string = defaultClaudeConfigPath()
): Promise<boolean> {
  const projectKey = path.resolve(rootPath)

  let config: Record<string, unknown>
  try {
    const raw = await readFile(configPath, "utf-8")
    config = JSON.parse(raw) as Record<string, unknown>
    if (typeof config !== "object" || config === null || Array.isArray(config)) return false
  } catch (err) {
    // Missing is fine — Claude Code hasn't run yet, and it merges what it
    // finds. Unreadable or UNPARSEABLE is not: this file is the user's entire
    // Claude Code state (hundreds of KB, dozens of projects), and overwriting
    // one we failed to understand would destroy it to save a prompt.
    if ((err as NodeJS.ErrnoException)?.code !== "ENOENT") return false
    config = {}
  }

  const projects = (
    typeof config.projects === "object" && config.projects !== null && !Array.isArray(config.projects)
      ? config.projects
      : {}
  ) as Record<string, Record<string, unknown>>

  const existing =
    typeof projects[projectKey] === "object" && projects[projectKey] !== null ? projects[projectKey] : {}
  if (existing.hasTrustDialogAccepted === true) return true

  // Merge, never replace: this entry may already carry mcpServers, allowedTools
  // and history that belong to the user, and every OTHER project must survive.
  projects[projectKey] = { ...existing, hasTrustDialogAccepted: true }
  config.projects = projects

  // Write through a temp file in the same directory and rename. Claude Code
  // writes this file too, and a partial write here would corrupt all of it —
  // rename is atomic, so a reader sees either the old file or the new one.
  const tmpPath = `${configPath}.alacran-${process.pid}.tmp`
  try {
    await writeFile(tmpPath, `${JSON.stringify(config, null, 2)}\n`, "utf-8")
    await rename(tmpPath, configPath)
    return true
  } catch {
    await unlink(tmpPath).catch(() => {})
    return false
  }
}
