import { execFile as nodeExecFile } from "node:child_process"
import { promisify } from "node:util"
import { homedir } from "node:os"
import { clearExecMemo } from "./exec-memo"
import { AI_EXECUTORS } from "./ai-executors"
import { isClaudeCodeCli } from "./is-claude-code-cli"
import type { ExecFileFn, InstallableId, InstallResult } from "./install-tool-impl"

const execFileAsync = promisify(nodeExecFile)

async function defaultExecFile(command: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  return execFileAsync(command, args, { timeout: 15 * 60_000, maxBuffer: 4 * 1024 * 1024 })
}

/**
 * The commands the repair agent is allowed to run. This is the whole security
 * boundary, so it is a fixed list, not a pattern the model can widen.
 *
 * `sudo` is deliberately absent and must stay absent. An install needing root
 * is the one place human aid is correct: a password prompt in a headless spawn
 * either hangs forever or is answered by nobody, and an agent that could
 * acquire root to fix a CLI install is a far larger grant than this feature is
 * worth. When the repair needs root, it reports that instead.
 */
const REPAIR_BASH_PATTERNS = [
  "brew *",
  "curl *",
  "tar *",
  "unzip *",
  "mkdir *",
  "mv *",
  "cp *",
  "chmod *",
  "which *",
  "uname *",
  "npm install -g *",
]

/** The tool the agent is being asked to install, in the user's own words, plus
 *  the binary the app will look for afterwards. Nothing here is user-supplied:
 *  `id` is a typed union, and everything else is a literal. */
const TOOLS: Record<InstallableId, { label: string; binary: string }> = {
  "claude-code": { label: "Claude Code CLI", binary: "claude" },
  gh: { label: "GitHub CLI", binary: "gh" },
  gog: { label: "gogcli (the Google CLI, gogcli.sh)", binary: "gog" },
  "google-antigravity": { label: "Google Antigravity CLI", binary: "agy" },
}

export function buildRepairPrompt(id: InstallableId, failureLog: string): string {
  const tool = TOOLS[id]
  return [
    `Install the ${tool.label} on this machine, so that \`which ${tool.binary}\` succeeds.`,
    "",
    failureLog.trim()
      ? `The app already tried a standard install and it failed. Here is exactly what it ran and what came back:\n\n${failureLog.trim()}`
      : "The app has no verified install command for this tool, so nothing has been tried yet.",
    "",
    "Rules:",
    `- Install into a directory already on PATH. $HOME/.local/bin is a good default and is always searched by this app.`,
    "- Do NOT use sudo, and do not attempt anything needing an administrator password. If the only way forward needs one, stop and say so.",
    "- Do not modify any file outside the install itself.",
    "- Prefer the tool's official installer or release download.",
    `- When you are done, run \`which ${tool.binary}\` and report the result.`,
  ].join("\n")
}

export type RepairResult = InstallResult & { transcript: string }

/**
 * Last resort when a verified install command fails or doesn't exist.
 *
 * Deliberately NOT the primary path: `brew install gh` is one deterministic
 * line, and spawning an agent to run a command we already know costs tokens,
 * takes ~40s instead of ~8, and is non-deterministic — which for this app's
 * audience means a support ticket nobody can reproduce. The agent earns its
 * place only on the failure branch, which is un-scriptable by definition (no
 * Homebrew, unexpected arch, distro variance, a proxy).
 *
 * Scoped, never blanket: this uses Claude Code's own `--allowedTools` with a
 * fixed Bash allowlist and `--permission-mode manual`, the same machinery
 * every registry command uses. It never passes
 * `--dangerously-skip-permissions`. Claude Code is the only executor this can
 * run on at all, because it is the only one that honours a tool scope
 * (`enforcesToolScope`) — v56 exists because the other three silently ignore
 * it, and an unscoped "install whatever you like" agent is not something to
 * ship.
 */
export async function installRepairImpl(
  id: InstallableId,
  failureLog: string,
  execFn: ExecFileFn = defaultExecFile,
  home: string = homedir()
): Promise<RepairResult> {
  const claude = AI_EXECUTORS["claude-code"]
  if (!claude.enforcesToolScope) {
    // Unreachable today, and a tripwire rather than a guess: if this ever
    // flips, the sandbox below stops existing and this must refuse instead of
    // running an unscoped agent.
    return { ok: false, log: "", transcript: "Refused: the executor no longer enforces a tool scope." }
  }

  const args = claude.buildArgs({
    prompt: buildRepairPrompt(id, failureLog),
    // No file edits are part of installing a CLI. Edit() takes a pattern, so
    // this points at a path nothing writes to rather than inventing a scope.
    editScopePattern: `${home}/.alacran-never-written/**`,
    bashPatterns: REPAIR_BASH_PATTERNS,
  })

  let transcript = ""
  try {
    const { stdout, stderr } = await execFn("claude", args)
    transcript = stdout + stderr
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; message?: string }
    transcript = (e.stdout ?? "") + (e.stderr ?? "") + (e.message ?? "")
  }

  // Same rule as installToolImpl: the agent's own account of what it did is
  // not evidence. Re-probe the machine and let that be the answer.
  clearExecMemo()
  const ok = await isNowInstalled(execFn, id)
  return { ok, log: "", transcript, needsAgent: ok ? undefined : true }
}

async function isNowInstalled(execFn: ExecFileFn, id: InstallableId): Promise<boolean> {
  // Claude Code gets its version signature, not a bare `which` — a Homebrew
  // Cask shim for the desktop app satisfies `which claude` (the real v53
  // false positive), and an agent that "succeeded" against a shim would be
  // reported to the user as installed.
  if (id === "claude-code") return isClaudeCodeCli(execFn)
  try {
    await execFn("which", [TOOLS[id].binary])
    return true
  } catch {
    return false
  }
}
