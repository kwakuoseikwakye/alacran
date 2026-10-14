/**
 * Which coding-agent CLI runs this company's commands.
 *
 * The bar to be in here is a per-path edit scope the app controls, because
 * that allowlist is not a nuance — it is the layer that holds when a
 * prompt-injection payload gets past the fence (see
 * prefetch/untrusted-fence.ts). Codex, Aider and Google Antigravity CLI were
 * registered here until v99 with only their `--help` output verified; none had
 * ever been run end to end against a live account from this app, and each
 * one's "non-interactive" flag (`--sandbox workspace-write`, `--yes-always`,
 * `--dangerously-skip-permissions`) is the opposite of a path allowlist. They
 * were removed rather than left shipping untested: a company assigned to one
 * silently falls back to Claude Code, because `getAiExecutor` and
 * `getAiExecutorIdForAgent` both already treat an unknown id as the default.
 *
 * Kiro clears that bar and was added by meeting it, not by relaxing it — with
 * live runs, not a `--help` reading. An executor that CANNOT scope is still
 * addable as `enforcesToolScope: false`, and the guards that read it
 * (`runCompanyCommandImpl`'s untrusted-input refusal, `buildRepairPrompt`) are
 * deliberately still there so that day is safe.
 *
 * `buildInteractiveIntroArgs` is a second, optional capability: "start a real
 * interactive session, seeded with this first message, and stay open" —
 * different from `buildArgs`, which is always one-shot-and-exit. Claude Code
 * treats a bare positional prompt as the session's first turn and stays
 * interactive (`claude --help`: "starts an interactive session by default").
 * It stays optional because not every CLI has an equivalent — callers must
 * treat its absence as "this executor can't be seeded" and fall back to a
 * plain blank interactive session rather than inventing a flag.
 */

export type AiExecutorId = "claude-code" | "kiro" | "kimi" | "google-antigravity" | "codex"

/**
 * The agent config Kiro runs company commands under. A fixed literal — it
 * becomes both an argv value and a filename, so nothing user-supplied goes
 * near it.
 */
export const KIRO_AGENT_NAME = "alacran"

export type AiExecutorBuildArgsInput = {
  prompt: string
  editScopePattern: string
  /** More edit patterns beside `editScopePattern`, for a command that declares `alsoWrites`. Honoured exactly where `editScopePattern` is. */
  alsoEditScopePatterns?: string[]
  bashPatterns: string[]
  /** Exact MCP tool names to allow. Only claudeCodeArgs reads it. */
  mcpTools?: string[]
}

export type AiExecutor = {
  id: AiExecutorId
  label: string
  binaryName: string
  installHint: string
  installLink: string
  /**
   * Extra flags that run routine upkeep (session notes) on the tool's cheapest
   * model, or null when the tool has no verified way to choose one. Required,
   * so a new executor has to answer the question: a note written by resuming a
   * long conversation on the user's biggest model was the costliest thing the
   * app did unasked.
   */
  routineModelArgs: string[] | null
  /**
   * Whether this executor actually honours `editScopePattern` and
   * `bashPatterns`, or only gets a coarse auto-approve flag instead.
   *
   * True for every registered executor today. Kept as a field, not assumed,
   * because it decides whether a command's sandbox exists at all:
   * `runCompanyCommandImpl` refuses to run a command carrying
   * attacker-authored text (an email body, a Notion page) on an executor
   * that reports false. That refusal is the reason a second executor can be
   * added later without re-deriving the security argument.
   */
  enforcesToolScope: boolean
  /**
   * Can this CLI be limited to a named list of MCP tools on a headless run?
   * Required so a new executor must answer. Only Claude Code's
   * `--allowedTools` was verified to take `mcp__server__tool` names (v199).
   */
  supportsMcpToolAllowlist: boolean
  /**
   * Where THIS executor reads a company's project-scoped MCP servers from,
   * relative to the company root — or `null` when it has none.
   *
   * Required and nullable, never optional, and that is the whole point. The
   * MCP writer used to loop over two hardcoded path constants while its own
   * comment claimed it wrote "every registered executor's config path": true
   * when two were registered, silently false once Kimi and Antigravity were
   * added, so a company on either was told "Added to .mcp.json and
   * .kiro/settings/mcp.json" while its agent read neither.
   *
   * The agent is the driver of this OS and a company switches executors from a
   * picker, so an MCP server belongs to the COMPANY and has to reach whichever
   * agent is driving. A field nobody can forget to fill in is what makes that
   * checkable; `summarize-network-access.ts` is the one per-executor surface
   * that never drifted, and it is the one whose table is a total
   * `Record<AiExecutorId, …>`.
   *
   * `null` means measured and absent, the same standard the two real paths
   * were held to — both came from the installed binaries, not their docs.
   */
  mcpConfigPath: string | null
  buildArgs: (input: AiExecutorBuildArgsInput) => string[]
  /**
   * argv for an UNATTENDED run that reports progress as it goes
   * (lib/agent-runs): headless and edit-scoped exactly like `buildArgs`, but
   * printing one JSON event per line instead of only a final answer. `null`
   * means this CLI has no streaming mode that has been run end to end here, and
   * the run engine refuses it by name rather than showing a pane that stays
   * blank until the run is over.
   */
  streamingRunArgs: ((input: AiExecutorBuildArgsInput) => string[]) | null
  /**
   * argv to CONTINUE an unattended run in its own worktree with a person's
   * feedback ("Ask for changes"): the same scope and streaming as
   * `streamingRunArgs`, resuming the conversation that worktree already holds.
   * `null` where no resume-plus-streaming combination has been run end to end.
   */
  streamingResumeArgs: ((input: AiExecutorBuildArgsInput) => string[]) | null
  /**
   * argv to open an INTERACTIVE session that continues the conversation a run
   * left in its worktree ("Take over"). `null` where that hasn't been run end
   * to end.
   */
  interactiveResumeArgs: string[] | null
  /** Absent means this executor has no supported way to seed an interactive
   *  session with a first message while staying open. */
  buildInteractiveIntroArgs?: (introPrompt: string) => string[]
  /**
   * How to hand a prompt back to a conversation that has already ended, so the
   * agent that was actually there can answer it. Powers automatic session
   * notes (lib/terminal/auto-session-note.ts).
   *
   * Absent means this executor cannot resume, the same convention
   * `buildInteractiveIntroArgs` uses — never a flag invented to make one look
   * supported (v64). Kimi carries none because it is not installed on the
   * machine this was verified against, and this repo does not ship a flag it
   * has not run.
   *
   * **`listSessions` is not optional decoration.** Both executors that DO
   * resume were measured doing the same dangerous thing: asked to resume in a
   * directory with no history, neither fails — `claude --continue -p` and
   * `kiro-cli chat -r` both silently start a NEW conversation and answer it.
   * A caller that trusted the resume flag would be asking an agent with no
   * session to describe a session, and would file the invention as company
   * memory. So a resumable executor must also say how to find out whether
   * there is anything to resume: either a CLI listing (`listSessions`) or, for
   * Claude which has no such command, its on-disk transcript store.
   */
  resume?: {
    /** `sessionId` names the conversation to reopen, where the caller knows
     *  it; an executor that cannot target one resumes its most recent. */
    buildArgs: (input: AiExecutorBuildArgsInput, sessionId?: string) => string[]
    /** How to ask the CLI what this directory already holds, plus the text it
     *  prints when the answer is "nothing". Absent means read the store. */
    listSessions?: { args: string[]; emptyOutput: string }
  }
  /**
   * Whether starting a bare session in a company's folder makes this executor
   * read that company's own files on its own.
   *
   * Claude Code loads CLAUDE.md and supports its import syntax (the company
   * CLAUDE.md points at AGENTS.md); its project skills are documented under
   * .claude/skills. Codex, Kimi Code, and Antigravity document project
   * AGENTS.md instructions and `.agents/skills`; Kiro documents AGENTS.md
   * steering and `.kiro/skills`. See the dated source table in
   * lib/guide/executor-coverage.ts (read 2026-10-04). Those documents do not
   * establish what every unattended app launch loads, so measured behaviour
   * remains separate. `openInteractiveTerminalImpl` seeds
   * COMPANY_CONTEXT_PRIMER unless this executor explicitly opts in below.
   *
   * ABSENCE MEANS FALSE, AND THAT DIRECTION IS THE POINT. A new executor added
   * to this registry without touching this field gets the primer, which costs
   * a few hundred tokens on open and is never wrong. Declaring it the other way
   * round — "needsPrimer" — would mean a forgotten field silently ships the
   * blind session this exists to fix, and the failure is invisible: the agent
   * answers confidently, just about nothing in particular. Set this to true
   * only after watching a real bare session on that CLI reference something it
   * could only know from the company's files.
   */
  autoLoadsCompanyContext?: true
  /**
   * Args for a one-time browser sign-in, run in a visible terminal.
   *
   * Absent means "this app has no verified sign-in command for it" and the
   * card must fall back to written instructions rather than a button — same
   * absence-is-a-supported-state convention as buildInteractiveIntroArgs.
   * Never render a sign-in button for an executor without this: the button
   * used to be hardcoded to `claude auth login`, so a second executor
   * inheriting it would open a terminal signing the user into the WRONG CLI.
   */
  buildSignInArgs?: (email?: string) => string[]
  /** Whether buildSignInArgs does anything with the email. Claude Code uses it
   *  to pre-populate the login page; Kiro has no equivalent and asks for the
   *  provider instead — so the card must not ask for an address it will drop,
   *  which is the "the card lies" shape v64/v72/v74 each fixed. */
  signInAcceptsEmail?: true
  /**
   * NOTE there is no `prepareScope` here, and that is not an omission.
   *
   * Kiro's edit scope lives in an agent config FILE rather than argv, so
   * something has to write it — but this module is imported by client
   * components (network-graph.tsx, company-ownership-sheet.tsx,
   * ai-executor-picker.tsx) for labels, and a `node:fs` import here fails
   * `next build` while passing both tsc and vitest. Keep this module
   * isomorphic; the writers live in lib/executor-scope.ts.
   */
}

export const DEFAULT_AI_EXECUTOR_ID: AiExecutorId = "claude-code"

/**
 * Claude Code's headless argv, defined once.
 *
 * Shared by `buildArgs` and `resume.buildArgs` deliberately: a resumed run and
 * a fresh one must get the SAME tool scope, and two copies of this list is two
 * places for that to drift apart — with the resumed one, which inherits a
 * conversation that had no allowlist at all, being the worse half to get wrong.
 */
function claudeCodeArgs(
  { prompt, editScopePattern, alsoEditScopePatterns = [], bashPatterns, mcpTools = [] }: AiExecutorBuildArgsInput,
  outputFormat: "text" | "stream-json" = "text"
): string[] {

    const fileTools = `Read,Grep,Glob,${[editScopePattern, ...alsoEditScopePatterns].map((p) => `Edit(${p})`).join(",")}`
    const withBash =
      bashPatterns.length > 0 ? `${fileTools},${bashPatterns.map((p) => `Bash(${p})`).join(",")}` : fileTools
    const allowedTools = mcpTools.length > 0 ? `${withBash},${mcpTools.join(",")}` : withBash
    return [
      "-p",
      prompt,
      "--allowedTools",
      allowedTools,
      // Only commands that declare no bashPatterns get a blanket Bash
      // disallow. A command with scoped Bash(...) patterns must NOT also
      // pass --disallowedTools Bash, which would override the allow.
      ...(bashPatterns.length > 0 ? [] : ["--disallowedTools", "Bash"]),
      "--permission-mode",
      "manual",
      "--output-format",
      outputFormat,
      // `-p` refuses stream-json without --verbose.
      ...(outputFormat === "stream-json" ? ["--verbose"] : []),
    ]
}

export const AI_EXECUTORS: Record<AiExecutorId, AiExecutor> = {
  "claude-code": {
    id: "claude-code",
    streamingRunArgs: (input) => claudeCodeArgs(input, "stream-json"),
    streamingResumeArgs: (input) => ["--continue", ...claudeCodeArgs(input, "stream-json")],
    interactiveResumeArgs: ["--continue"],
    label: "Claude Code",
    // Verified live: a hand-written .mcp.json is reported by `claude mcp get`
    // as "Scope: Project config (shared via .mcp.json)".
    mcpConfigPath: ".mcp.json",
    binaryName: "claude",
    installHint: "curl -fsSL https://claude.ai/install.sh | bash",
    routineModelArgs: ["--model", "haiku"],
    installLink: "https://docs.claude.com/en/docs/claude-code/overview",
    enforcesToolScope: true,
    supportsMcpToolAllowlist: true,
    buildArgs: claudeCodeArgs,
    buildInteractiveIntroArgs: (introPrompt) => [introPrompt],
    // `--resume <id>` (or `--continue`, which means "whichever transcript was
    // touched last" and so can land in a days-old one) leads, then the SAME
    // buildArgs every other headless run uses, so the tool scope cannot drift. No `listSessions`:
    // `claude --help` offers no way to list a directory's conversations
    // (`--resume` with no value opens an interactive picker, which is useless
    // headlessly), so detection reads the transcript store instead.
    resume: {
      buildArgs: (input, sessionId) => [...(sessionId ? ["--resume", sessionId] : ["--continue"]), ...claudeCodeArgs(input)],
    },
    // Documented Claude Code project context: CLAUDE.md (→ AGENTS.md via its
    // import directive), plus .claude/commands and .claude/skills. This flag
    // remains a separate runtime decision; coverage behaviour is recorded in
    // lib/guide/executor-coverage.ts. Vendor docs read 2026-10-04:
    // https://code.claude.com/docs/en/memory
    autoLoadsCompanyContext: true,
    buildSignInArgs: (email) => (email ? ["auth", "login", "--email", email] : ["auth", "login"]),
    signInAcceptsEmail: true,
  },
  kiro: {
    id: "kiro",
    streamingRunArgs: null,
    streamingResumeArgs: null,
    interactiveResumeArgs: null,
    label: "Kiro",
    // Verified against the installed kiro-cli 2.19.1 binary's own path table,
    // not its docs (which describe a 3.0 that stable does not ship).
    mcpConfigPath: ".kiro/settings/mcp.json",
    binaryName: "kiro-cli",
    installHint: "curl -fsSL https://cli.kiro.dev/install | bash",
    routineModelArgs: null,
    installLink: "https://kiro.dev/docs/cli/",
    // Earned, not assumed. Measured against a real installed kiro-cli 2.19.1
    // with five live runs against a throwaway repo — see prepareScope below
    // for the exact conditions, which are the whole reason this is true.
    enforcesToolScope: true,
    supportsMcpToolAllowlist: false,
    // NOTE the two things deliberately absent: `-a` / `--trust-all-tools`, and
    // `fs_write` in the agent's `allowedTools`. Either one silently discards
    // the path scope — verified, and `--trust-all-tools` does it with no
    // warning at all. Adding either to make a run "just work" removes the
    // sandbox entirely; `ai-executors.test.ts` fails if they reappear.
    buildArgs: ({ prompt }) => ["chat", "--no-interactive", "--agent", KIRO_AGENT_NAME, prompt],
    // Verified against a real kiro-cli: `-r` resumes the most recent
    // conversation from the current directory, and combines with
    // `--no-interactive`, `--agent` and a positional prompt.
    //
    // WATCH THIS: an unknown --agent does NOT fail, it prints "Falling back to
    // user specified default" and runs anyway — unscoped. So the caller must
    // let a failed prepareExecutorScope abort the run rather than spawn.
    resume: {
      buildArgs: ({ prompt }) => ["chat", "-r", "--no-interactive", "--agent", KIRO_AGENT_NAME, prompt],
      // Measured output in a directory with none: "No saved chat sessions for <path>".
      listSessions: { args: ["chat", "--list-sessions"], emptyOutput: "No saved chat sessions" },
    },
    // `kiro-cli chat "<prompt>"` takes the first question as a positional and
    // stays interactive, same shape as Claude Code. Verified against 2.19.1's
    // own `chat --help` ("[INPUT]  The first question to ask"). No --agent
    // here on purpose: an interactive session the user drives is not the
    // command sandbox, and passing the scoped agent would silently narrow it.
    buildInteractiveIntroArgs: (introPrompt) => ["chat", introPrompt],
    // `--license free` covers Builder ID, Google and GitHub; the CLI then asks
    // which and opens the browser. Verified against 2.19.1's `login --help`.
    // The email argument is ignored on purpose — there is no prefill flag, so
    // signInAcceptsEmail is absent and the card shows no address field.
    buildSignInArgs: () => ["login", "--license", "free"],
    // Measured against the installed 2.19.1, not inferred. Its built-in tools
    // are fs_read, fs_write, execute_bash, use_aws, knowledge, thinking and
    // introspect — there is no browser tool at all (the `browser_*` strings in
    // the binary are user-agent parsing), and it discovers `.kiro/skills` but
    // has no `.claude/commands` equivalent: `.kiro/workflows` and
    // `.kiro/specs` are different concepts, not slash commands.
  },
  kimi: {
    id: "kimi",
    streamingRunArgs: null,
    streamingResumeArgs: null,
    interactiveResumeArgs: null,
    label: "Kimi Code",
    // NOT measured on a machine with Kimi installed, so it declares no support
    // rather than a guessed path — the same standard that produced the two
    // paths above. Writing a file this CLI may not read, and reporting success
    // for it, is the failure this field exists to stop. Fill it in by reading
    // the real binary, never its documentation.
    mcpConfigPath: null,
    binaryName: "kimi",
    // The official installer. It lands in ~/.kimi-code/bin, needs no sudo, and
    // sha256-verifies its download; it also renames any older Python
    // `kimi-cli` to `kimi-legacy`, which is why the binary here is `kimi`.
    installHint: "curl -fsSL https://code.kimi.ai/kimi-code/install.sh | bash",
    routineModelArgs: null,
    installLink: "https://www.kimi.com/code/docs/en/",
    /**
     * FALSE, and this is the load-bearing field on this entry.
     *
     * Established two ways rather than assumed. The agent-profile schema read
     * out of the real 0.39.0 binary is `tools: array(string())` plus
     * `disallowedTools: array(string()).optional()` — tool NAMES, with no path
     * field of any kind and no equivalent of Kiro's
     * `toolsSettings.fs_write.allowedPaths`. Kimi's own documentation says the
     * same thing in words: "Tool access is binary (allowed/disallowed), not
     * scoped to specific directories or files." There is nowhere to put this
     * app's `editScopePattern`.
     *
     * Worse in the same direction: Write/Edit/Bash require approval per call,
     * so a headless run needs `--yolo` to write anything at all, which
     * auto-approves everything. No scope, and blanket approval to reach it.
     *
     * The consequence is automatic and wanted: `runCompanyCommandImpl` refuses
     * to run any command carrying attacker-authored text on this executor, so
     * `refresh` — the one command with `untrustedInput` — will not run here.
     * What makes the remaining five survivable is the stray-file check
     * (lib/company-commands/repo-changes.ts): the approval diff reports
     * anything a run touched outside its own folder, and unattended
     * auto-commit refuses when there is anything it cannot account for.
     *
     * Kimi DOES have a blockable `PreToolUse` hook that could enforce a real
     * scope. It is not used, and a scope writer was not built, because hooks
     * live only in the machine-global ~/.kimi-code/config.toml — the fifth
     * instance of the per-machine-global-config shape after gog,
     * `codex mcp` and Kiro's own store, and on a real machine
     * another tool may already own that file.
     */
    enforcesToolScope: false,
    supportsMcpToolAllowlist: false,
    // Not run end to end from this app. The flags below were
    // each accepted by the real 0.39.0 binary (argument errors fire before any
    // model call, so this much is verified without a live account); what has
    // NOT been proven is a completed run producing a diff.
    // `-p` is one-shot non-interactive and ALREADY unattended: Kimi's own
    // reference (kimi-command, "Flag Conflict Rules") says "`--prompt` cannot be
    // used with `--yolo`, `--auto`, or `--plan` — non-interactive mode uses
    // `auto` permission by default". So no permission flag is passed, and none
    // can be: 0.39.0 refuses both ("Cannot combine --prompt with --yolo",
    // "... with --auto"), measured. This line sent `--yolo` until v222, which
    // made every headless Kimi job and every Kimi answer in Ask fail at startup.
    // The consequence is unchanged in kind: `auto` approves every tool call,
    // which is exactly why `enforcesToolScope` is false above.
    buildArgs: ({ prompt }) => ["-p", prompt, "--output-format", "text"],
    // NOTE the absence of buildInteractiveIntroArgs, which is measured rather
    // than an oversight: `kimi "say hi"` answers `unknown command 'say hi'` —
    // there is no positional first-message form, and no flag that starts an
    // interactive session seeded with one. Callers already treat absence as
    // "cannot be seeded" and fall back to a blank session that says so.
    //
    // And note the absence of autoLoadsCompanyContext. Kimi genuinely reads
    // AGENTS.md unprompted (32 references in the binary; CLAUDE.md appears
    // zero times, so v86's move to a vendor-neutral filename is what makes
    // that work) — but it discovers skills in .kimi-code/skills and .kimi/skills,
    // never .claude/commands. Three of the four things COMPANY_CONTEXT_PRIMER
    // names would be missed, so the honest answer for a partial is to omit the
    // flag and let the primer run.
    buildSignInArgs: () => ["login"],
  },
  codex: {
    id: "codex",
    streamingRunArgs: null,
    streamingResumeArgs: null,
    interactiveResumeArgs: null,
    label: "Codex CLI",
    binaryName: "codex",
    installHint: "npm install -g @openai/codex",
    routineModelArgs: null,
    installLink: "https://developers.openai.com/codex/cli",
    /**
     * Every claim below was measured against the installed codex-cli 0.147.0 on
     * 2026-09-16, not read from its docs — the standard the other four were
     * held to. Argument errors fire before any model call, so flags are
     * verified without spending a request: `codex exec --sandbox bogus-value`
     * answers "invalid value ... [possible values: read-only, workspace-write,
     * danger-full-access]".
     *
     * FALSE, and this is the one that matters. Codex's `-s/--sandbox` is a
     * coarse MODE (read-only / workspace-write / danger-full-access), not a
     * path pattern: there is no equivalent of Claude's `--allowedTools
     * Edit(<glob>)`, and nothing that takes a list of permitted bash commands.
     * `workspace-write` does confine writes to the workspace, which is real,
     * but `editScopePattern` and `bashPatterns` would be silently discarded —
     * and reporting true while a scope never reaches the CLI is the exact lie
     * this field exists to prevent. Consequence: `runCompanyCommandImpl`
     * refuses to run an `untrustedInput` command on Codex, which is correct.
     */
    enforcesToolScope: false,
    supportsMcpToolAllowlist: false,
    /**
     * No project-scoped MCP config. `codex mcp add` takes no scope flag and
     * config resolves from `~/.codex/config.toml` — machine-global, measured
     * again here rather than inherited from v99's note, and still true at
     * 0.147.0. So an MCP server wired up for this company cannot be handed to
     * Codex by writing a file into the company folder, and `null` says so
     * instead of writing one it will never read.
     */
    mcpConfigPath: null,
    /**
     * Registered, and NOT yet run end to end from this app — v99's narrow,
     * labelled exception rather than a repeal of "either run it or don't offer
     * it". `codex exec` is the documented non-interactive form and its flags
     * parse, but no complete job has produced a diff through this app yet.
     */
    // `exec` is the non-interactive subcommand; `workspace-write` is what lets
    // it write at all, and confines those writes to the company folder the pty
    // is already spawned in. `--skip-git-repo-check` allows execution in
    // uninitialized workspace folders (such as assistantWorkspaceDir).
    buildArgs: ({ prompt }) => ["exec", "--skip-git-repo-check", "--sandbox", "workspace-write", prompt],
    // `codex [OPTIONS] [PROMPT]` — a bare positional starts the interactive TUI
    // already seeded, which is what the assistant tab and Get Started need.
    buildInteractiveIntroArgs: (introPrompt) => [introPrompt],
    buildSignInArgs: () => ["login"],
    /**
     * NOTE the absence of `resume`, which is a decision rather than an
     * oversight. `codex resume --last` and `codex exec resume --last` both
     * exist, but this registry's rule is that a resumable executor must ALSO
     * say how to find out whether there is anything to resume — because
     * `claude --continue -p` and `kiro-cli chat -r` were both measured silently
     * starting a NEW conversation in a directory with no history, and answering
     * it. Codex's behaviour on an empty history has not been measured, so
     * claiming resume here would risk filing an invented session as company
     * memory. Absence means "cannot resume", which every caller already
     * handles.
     *
     * And note the absence of autoLoadsCompanyContext. Codex genuinely reads
     * AGENTS.md unprompted — 55 references in the 220MB binary against 1 for
     * CLAUDE.md, so v86's move to a vendor-neutral filename is what makes that
     * work at all. But it discovers skills in `.codex/skills` (3 references)
     * and `.claude/commands` / `.claude/skills` zero times each. Same partial
     * as Kimi, same honest answer: omit the flag and let COMPANY_CONTEXT_PRIMER
     * run, rather than claim context it only half has.
     */
  },
  "google-antigravity": {
    id: "google-antigravity",
    streamingRunArgs: null,
    streamingResumeArgs: null,
    interactiveResumeArgs: null,
    label: "Google Antigravity",
    // Antigravity had no MCP support at all when it was last measured (v99).
    // It was re-registered in v151 without that being re-checked, so this stays
    // null until someone runs the real binary.
    mcpConfigPath: null,
    binaryName: "agy",
    installHint: "curl -fsSL https://antigravity.google/cli/install.sh | bash",
    routineModelArgs: null,
    installLink: "https://antigravity.google/cli",
    // Antigravity does not have fine-grained path allowlists for tool use.
    // `--dangerously-skip-permissions` auto-approves all tools in headless runs.
    enforcesToolScope: false,
    supportsMcpToolAllowlist: false,
    buildArgs: ({ prompt }) => [
      "-p",
      prompt,
      "--output-format",
      "text",
      "--mode",
      "accept-edits",
      "--dangerously-skip-permissions",
    ],
    buildInteractiveIntroArgs: (introPrompt) => ["-i", introPrompt],
  },
}

export function getAiExecutor(id: string | undefined): AiExecutor {
  if (id && id in AI_EXECUTORS) return AI_EXECUTORS[id as AiExecutorId]
  return AI_EXECUTORS[DEFAULT_AI_EXECUTOR_ID]
}

export function listAiExecutors(): AiExecutor[] {
  return Object.values(AI_EXECUTORS)
}

/**
 * The agents that actually read a company's project-scoped MCP config.
 *
 * Derived from `mcpConfigPath` so it cannot disagree with what
 * `saveMcpServersImpl` writes. UI that names files instead of agents is how
 * "Added to .mcp.json and .kiro/settings/mcp.json" kept being shown to
 * companies running Kimi or Antigravity, neither of which reads either file.
 */
export const MCP_READER_LABELS: string[] = Object.values(AI_EXECUTORS)
  .filter((e) => e.mcpConfigPath !== null)
  .map((e) => e.label)
