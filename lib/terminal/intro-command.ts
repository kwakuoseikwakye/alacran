import { resolveAiExecutorForAgent } from "../ai-executor-registry"
import { buildGetStartedIntroPrompt } from "../company-summary"
import { memoizedExecFile } from "../exec-memo"
import { isBinaryPresent } from "../binary-present"
import { readFileUtf8 } from "../path-exists"
import type { ExecFileFn } from "../terminal-launch-command"
import type { AiExecutor } from "../ai-executors"
import { sharedKnowledgeForTerminal } from "../sharing/shared-for-company"
import { connectedToolsNote } from "../outlook/connected-tools"
import { hasLiveAssistant } from "./sessions"
import type { TerminalLaunch } from "./sessions"

export type AssistantLaunch =
  /** `executorId` travels back so the caller can record the session under the
   *  agent that is actually running in it — which is what makes the NEXT tab's
   *  "have we met?" question answerable. */
  | { ok: true; launch: TerminalLaunch; label: string; executorId: string }
  /** A sentence for the user, not an error code. Every failure here is
   *  something they can act on, so each one says what to do next. */
  | { ok: false; message: string }

/**
 * What to run for an "AI assistant" tab: the company's own executor, started
 * interactively with the same opening message the Get Started button uses.
 *
 * The prompt itself is `buildGetStartedIntroPrompt` unchanged, which is the
 * point — it already decides fresh-vs-stale from a plain `git log` (v47), so
 * opening a tab costs read-everything tokens only when something the summary
 * was derived from has actually changed. Reusing it also means the assistant
 * in a terminal and the assistant behind the button cannot describe the same
 * company two different ways.
 *
 * Returned as argv, never a command line: `sessions.ts` hands it straight to
 * the pty, so the opening prompt is never echoed and never quoted.
 *
 * The briefing is for the FIRST tab of one (company, executor) pair only. Ask
 * `hasLiveAssistant` — never a plain session count — because a company changes
 * which agent it runs from the picker at will, and the tabs already open may
 * all belong to the one it just switched away from.
 */
export async function buildAssistantLaunch(
  agentId: string,
  rootPath: string,
  resolveExecutor: (id: string) => Promise<AiExecutor> = resolveAiExecutorForAgent,
  isPresent: (execFn: ExecFileFn, name: string) => Promise<boolean> = isBinaryPresent,
  execFn: ExecFileFn = (command, args) => memoizedExecFile(command, args),
  readFileFn: (path: string) => Promise<string> = readFileUtf8,
  hasLiveAssistantFn: (agentId: string, executorId: string) => boolean = hasLiveAssistant,
  /** What other companies share with this one (lib/sharing). Tests pass a stub. */
  sharedKnowledgeFn: (agentId: string) => Promise<string> = sharedKnowledgeForTerminal,
  /** The tools connected on this computer that the assistant can run (lib/outlook). Tests pass a stub. */
  connectedToolsFn: () => Promise<string> = connectedToolsNote
): Promise<AssistantLaunch> {
  const executor = await resolveExecutor(agentId)

  if (!(await isPresent(execFn, executor.binaryName))) {
    return {
      ok: false,
      message: `${executor.label} isn't installed on this computer yet. Open Connectors in the menu to install it, then try again.`,
    }
  }

  // Asked AFTER the two refusals above, so a tab that never starts cannot be
  // mistaken for one that already introduced itself, and BEFORE `openSession`
  // — the pair's first tab must not find itself in the map.
  //
  // That ordering holds WITHIN one request and not across two: the check and
  // the insert are separated by every await below, so two opens that overlap
  // both see false and both get briefed. Left unlocked deliberately — the
  // failure is one extra greeting, which is the behaviour that shipped before
  // this, and a lock around a pty spawn costs more than it saves.
  //
  // The answer is handed to `buildGetStartedIntroPrompt` rather than used to
  // bypass it, because only that function knows whether the summary is still
  // current, and a stale one must be regenerated however many tabs are open.
  // Absence is a supported state, per ai-executors.ts: an executor with no way
  // to be seeded opens its own interactive session blank (`kimi` with no
  // arguments), rather than being refused or given an invented flag. The tab
  // says so (ExecutorGapNote "opening-message").
  if (!executor.buildInteractiveIntroArgs) {
    return { ok: true, launch: { file: executor.binaryName, args: [] }, label: executor.label, executorId: executor.id }
  }

  const returning = hasLiveAssistantFn(agentId, executor.id)
    ? { autoLoadsCompanyContext: executor.autoLoadsCompanyContext === true }
    : undefined
  // `undefined` for inventoryFn keeps its real default; only the 5th argument
  // is being supplied here.
  const basePrompt = await buildGetStartedIntroPrompt(rootPath, execFn, readFileFn, undefined, returning)
  // Every tab is its own conversation, so each one is handed what other
  // companies share — this is the only way into its context, since it runs in
  // this company's folder with no way to read another's. Nothing added when no
  // string points here.
  const shared = await sharedKnowledgeFn(agentId)
  const tools = await connectedToolsFn()
  const introPrompt = [basePrompt, shared, tools].filter(Boolean).join("\n\n")

  return {
    ok: true,
    launch: { file: executor.binaryName, args: executor.buildInteractiveIntroArgs(introPrompt) },
    label: executor.label,
    executorId: executor.id,
  }
}
