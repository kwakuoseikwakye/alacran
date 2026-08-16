import { execFile as nodeExecFile } from "node:child_process"
import { promisify } from "node:util"
import { homedir } from "node:os"
import { clearExecMemo } from "./exec-memo"
import { AI_EXECUTORS } from "./ai-executors"
import { isClaudeCodeCli } from "./is-claude-code-cli"
import { fenceNotice, fenceUntrusted, newFenceNonce } from "./company-commands/prefetch/untrusted-fence"
import { isInstallableId } from "./install-tool-impl"
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

/**
 * Installer output is NOT ours. It is whatever `brew`, `curl` or a download
 * server printed, and it lands in a prompt whose Bash allowlist includes
 * `curl *`, `brew *` and `npm install -g *` — so a crafted error string is a
 * real instruction-injection surface, not a hypothetical one. It also arrives
 * through a public Server Action, so its size is whatever a caller sends.
 *
 * Two guards, the same two every other externally-sourced prompt input in this
 * app gets: a hard cap, and the nonce fence from prefetch/untrusted-fence.ts
 * (a fixed marker can be closed early by content that contains it; a per-run
 * nonce the author never saw cannot be forged).
 */
const MAX_FAILURE_LOG = 4000

/** Installing one CLI is a handful of tool calls. Anything past this is a
 *  loop, not progress. Raise it only with evidence of a real install that
 *  legitimately needed more. */
const REPAIR_BUDGET_USD = 0.5

export function buildRepairPrompt(id: InstallableId, failureLog: string): string {
  const tool = TOOLS[id]
  const trimmed = failureLog.trim().slice(0, MAX_FAILURE_LOG)
  const nonce = newFenceNonce()
  return [
    `Install the ${tool.label} on this machine, so that \`which ${tool.binary}\` succeeds.`,
    "",
    trimmed
      ? `The app already tried a standard install and it failed. ${fenceNotice(nonce, "output printed by a package manager or download server.")}\n\n${fenceUntrusted(trimmed, nonce)}`
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
  if (!isInstallableId(id)) return { ok: false, log: "", transcript: "Refused: unknown tool." }

  const claude = AI_EXECUTORS["claude-code"]
  if (!claude.enforcesToolScope) {
    // Unreachable today, and a tripwire rather than a guess: if this ever
    // flips, the sandbox below stops existing and this must refuse instead of
    // running an unscoped agent.
    return { ok: false, log: "", transcript: "Refused: the executor no longer enforces a tool scope." }
  }

  const args = [
    ...claude.buildArgs({
      prompt: buildRepairPrompt(id, failureLog),
      // No file edits are part of installing a CLI. Edit() takes a pattern, so
      // this points at a path nothing writes to rather than inventing a scope.
      editScopePattern: `${home}/.alacran-never-written/**`,
      bashPatterns: REPAIR_BASH_PATTERNS,
    }),
    // A hard ceiling, added after a real report: a gogcli repair ground on for
    // an HOUR. There is no --max-turns on the real CLI (checked against
    // `claude --help`, not docs), but --max-budget-usd is real and works with
    // --print, which this spawn already uses. An install that has burned this
    // much has not "nearly got there" — it is looping, and for this audience a
    // fast honest failure plus the manual steps beats an hour of nothing.
    //
    // Safe to cut a run off mid-flight precisely because success is re-probed
    // from the OS below and never read out of the transcript: a truncated run
    // that DID install still reports installed.
    "--max-budget-usd",
    String(REPAIR_BUDGET_USD),
  ]

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
