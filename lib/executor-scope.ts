import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { KIRO_AGENT_NAME, type AiExecutorBuildArgsInput, type AiExecutorId } from "./ai-executors"

/**
 * The server-only half of an executor: writing whatever it needs on disk
 * before it is spawned, for the executors whose edit scope is NOT expressible
 * in argv.
 *
 * This lives here rather than as a `prepareScope` field on AiExecutor for a
 * reason that is easy to rediscover the hard way: `lib/ai-executors.ts` is
 * imported by CLIENT components (network-graph.tsx, company-ownership-sheet.tsx,
 * ai-executor-picker.tsx) for labels, so it must stay free of `node:fs` and
 * `node:path` or `next build` fails to bundle it — tsc and vitest both pass
 * regardless, so the build is the only thing that catches it. Keep that module
 * isomorphic; put anything that touches the filesystem in here.
 *
 * Claude Code needs no entry: its scope is `--allowedTools Edit(pattern)`, so
 * buildArgs says everything.
 */
export type ExecutorScopeWriter = (input: AiExecutorBuildArgsInput, agentRootPath: string) => Promise<void>

/** Where Kiro discovers a project-level agent. Verified against 2.19.1:
 *  `kiro-cli agent list` reports "alacran  Workspace" and names
 *  `<cwd>/.kiro/agents` as the workspace source — and runCompanyCommandImpl
 *  already spawns with cwd set to the company root, so nothing extra is
 *  needed to make discovery happen. */
export const KIRO_AGENT_DIR_SEGMENTS = [".kiro", "agents"] as const

/**
 * Kiro's edit scope lives in an agent config file, not in argv.
 *
 * The exact shape matters, and every part of it was measured against a real
 * installed kiro-cli 2.19.1 rather than read from docs (which describe a 3.0
 * `permissions.yaml` that stable does not ship):
 *
 *   allowedTools MUST NOT contain fs_write. Trusting the tool DISCARDS the
 *   path restriction, and Kiro says so itself: "You have trusted fs_write
 *   tool, which overrides the toolsSettings: allowedPaths". Measured both
 *   ways — with fs_write trusted, a write to notes/private.md outside
 *   allowedPaths SUCCEEDED; with it untrusted, the same write was refused
 *   with "Command fs_write is rejected because it matches one or more rules
 *   on the denied list: non-interactive mode (no user to approve)" while an
 *   in-scope write still went through. That asymmetry IS the sandbox.
 *
 * `kiro-cli agent validate` is not a useful gate on any of this: it exits 0
 * even for malformed JSON, and it accepted an unknown tool name and an
 * invented toolsSettings field without complaint. Only a live run answers it.
 *
 * bashPatterns map to `toolsSettings.execute_bash.allowedCommands`, verified
 * the same way and with the same rule: `execute_bash` goes in `tools` but NOT
 * in `allowedTools`, because trusting it discards allowedCommands exactly as
 * trusting fs_write discards allowedPaths. Measured live — with the tool
 * untrusted, `git status --short` under `allowedCommands: ["^git status.*$"]`
 * ran, and `whoami` was refused with "Command execute_bash is rejected because
 * it matches one or more rules on the denied list".
 *
 * `execute_bash` is added ONLY when a command actually declares patterns.
 * Handing a shell tool to a run that never needs one is privilege for free.
 */

/**
 * Claude Code's bashPatterns are prefix GLOBS (`git -C /x pull*`); Kiro 2.x
 * allowedCommands are REGEXES. Passing them through unchanged would be a
 * security bug rather than a cosmetic mismatch, in two ways at once: `get*` as
 * a regex means "ge" followed by any number of "t", and an unanchored pattern
 * matches a substring, so `rm -rf ~ # git pull` would satisfy `git pull.*`.
 *
 * So: escape every regex metacharacter, turn each `*` into `.*`, and anchor
 * both ends.
 *
 * Kiro's own matcher turned out to be stricter than anchoring alone — it
 * rejected `git status --short && whoami` under `git status.*`, which an
 * anchored regex would have accepted, so it evidently validates chained
 * commands individually. That is a bonus, not something to rely on: this
 * function still has to be correct on its own.
 */
export function globToAnchoredRegex(glob: string): string {
  const escaped = glob
    .split("*")
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*")
  return `^${escaped}$`
}
const writeKiroAgentScope: ExecutorScopeWriter = async ({ editScopePattern, alsoEditScopePatterns = [], bashPatterns }, agentRootPath) => {
  const dir = path.join(agentRootPath, ...KIRO_AGENT_DIR_SEGMENTS)
  await mkdir(dir, { recursive: true })
  await writeFile(
    path.join(dir, `${KIRO_AGENT_NAME}.json`),
    `${JSON.stringify(
      {
        name: KIRO_AGENT_NAME,
        description: "Scoped run created by Alacran. Rewritten on every run.",
        tools: bashPatterns.length > 0 ? ["fs_read", "fs_write", "execute_bash"] : ["fs_read", "fs_write"],
        // fs_read only, always. See the note above: adding fs_write or
        // execute_bash here removes the sandbox this whole file exists to
        // create, and does it silently.
        allowedTools: ["fs_read"],
        toolsSettings: {
          fs_write: { allowedPaths: [editScopePattern, ...alsoEditScopePatterns] },
          ...(bashPatterns.length > 0
            ? { execute_bash: { allowedCommands: bashPatterns.map(globToAnchoredRegex) } }
            : {}),
        },
      },
      null,
      2
    )}\n`,
    "utf-8"
  )
}

const SCOPE_WRITERS: Partial<Record<AiExecutorId, ExecutorScopeWriter>> = {
  kiro: writeKiroAgentScope,
}

/**
 * Called by runCompanyCommandImpl AFTER the run lock is held (so two runs on
 * one company can never race on the file) and BEFORE the spawn. It may throw:
 * a scope that cannot be written is a run that must not start.
 *
 * Deliberately no cleanup counterpart. The file is rewritten on every run, so
 * a stale one is only ever the previous scope for the same company, and
 * deleting it would race a concurrent interactive session the user opened from
 * the same directory.
 */
export async function prepareExecutorScope(
  executorId: AiExecutorId,
  input: AiExecutorBuildArgsInput,
  agentRootPath: string
): Promise<void> {
  await SCOPE_WRITERS[executorId]?.(input, agentRootPath)
}

/** Which executors convey their scope by file rather than by argv. Exported so
 *  ai-executors.test.ts can prove enforcesToolScope against whichever
 *  mechanism an executor really uses. */
export function hasScopeWriter(executorId: AiExecutorId): boolean {
  return executorId in SCOPE_WRITERS
}
