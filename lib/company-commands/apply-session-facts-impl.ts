import path from "node:path"
import { getEffectiveAgents } from "../get-effective-agents"
import { resolveWithinAgentRoot } from "../path-guard"
import { defaultExecFile } from "../default-exec-file"
import type { ExecFileFn } from "../git-commit-file"
import { parseProposedFacts } from "./fact-changes"
import { runCompanyCommandImpl } from "./run-company-command-impl"
import { getCompanyCommandResultImpl } from "./company-command-result-impl"
import { COMPANY_COMMANDS_DATA_DIR } from "./paths"
import { defaultCwdExecFile, type ExecFileFn as CwdExecFileFn } from "./repo-changes"

const NOTE_SHAPE = /^notes\/company\/sessions\/[^/]+\.md$/
// runCompanyCommandImpl caps a field at 4000 characters; stop a little short with a friendly message.
const MAX_LINES_LENGTH = 3800

export async function hasAppliedFacts(root: string, note: string, execFn: ExecFileFn): Promise<boolean> {
  const { stdout } = await execFn("git", ["-C", root, "log", "-F", "--grep", `Applied facts from: ${note}`, "--format=%H", "-n", "1"])
  return stdout.trim() !== ""
}

/**
 * Start `apply-session-facts` for the rows the owner ticked. The lines come from the browser, so each
 * one must appear verbatim in the committed note's "Proposed fact changes" section; anything else is
 * refused before it can become part of a prompt. Never throws: the action would turn it into a digest.
 */
export async function applySessionFactsImpl(
  agentId: string,
  note: string,
  lines: string[],
  deps: { execFn?: ExecFileFn; run?: typeof runCompanyCommandImpl; dataDir?: string } = {}
): Promise<{ started: boolean; message: string }> {
  try {
    const execFn = deps.execFn ?? defaultExecFile
    const run = deps.run ?? runCompanyCommandImpl
    // The note path ends up in the commit trailer, so a control character (newline) could inject trailer lines.
    // eslint-disable-next-line no-control-regex
    if (/[\x00-\x1f\x7f]/.test(note) || !NOTE_SHAPE.test(note) || note.includes("..")) return { started: false, message: "That isn't a session note." }
    if (lines.length === 0) return { started: false, message: "Tick at least one change to apply." }
    if (lines.join("\n").length > MAX_LINES_LENGTH) return { started: false, message: "That's too many changes to apply at once. Untick some and apply again." }
    const agent = (await getEffectiveAgents()).find((a) => a.id === agentId)
    if (!agent) return { started: false, message: `Unknown company "${agentId}"` }
    const guard = await resolveWithinAgentRoot(path.join(agent.rootPath, note))
    if (!guard) return { started: false, message: "That isn't a session note." }

    const tracked = (await execFn("git", ["-C", agent.rootPath, "ls-files", "--", note])).stdout.trim() !== ""
    const dirty = (await execFn("git", ["-C", agent.rootPath, "status", "--porcelain", "--", note])).stdout.trim() !== ""
    if (!tracked || dirty) return { started: false, message: "Approve the note first, then apply its facts." }
    if (await hasAppliedFacts(agent.rootPath, note, execFn)) return { started: false, message: "These facts were already applied." }

    // Starting a run re-snapshots the baseline; an earlier apply still awaiting review would be folded in and lost from Approvals.
    // The result reader runs git with `{ cwd }`; an injected exec has no cwd, so it is told the repo with -C.
    const injected = deps.execFn
    const cwdExec: CwdExecFileFn = injected ? (file, args, { cwd }) => injected(file, ["-C", cwd, ...args]) : defaultCwdExecFile
    const earlier = await getCompanyCommandResultImpl("apply-session-facts", deps.dataDir ?? path.join(COMPANY_COMMANDS_DATA_DIR, agentId), agent.rootPath, cwdExec)
    if (earlier.changed) return { started: false, message: "Finish reviewing the earlier fact changes first, then apply these." }

    // Read the committed blob, so the lines are checked against exactly what is committed.
    const parsed = parseProposedFacts((await execFn("git", ["-C", agent.rootPath, "show", `HEAD:${note}`])).stdout)
    const known = new Set(parsed.state === "ok" ? parsed.facts.map((f) => f.line) : [])
    if (!lines.every((l) => known.has(l))) return { started: false, message: "Those changes aren't in the note. Open the note again and retry." }

    return await run("apply-session-facts", { note, lines: lines.join("\n") }, agentId)
  } catch {
    return { started: false, message: "Couldn't start applying those changes. Try again in a moment." }
  }
}
