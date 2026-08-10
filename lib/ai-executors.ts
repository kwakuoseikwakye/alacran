/**
 * Pluggable "which coding-agent CLI runs this company's commands" abstraction.
 *
 * Every executor here is a CLI the user installs and authenticates themselves
 * (their own Anthropic/OpenAI account, their own local Ollama server via
 * Aider's model config) — this app never stores a key or proxies a request.
 * "Bring your own key" just means "point this company at a different already-
 * authenticated CLI," the same shape Claude Code already used before this.
 *
 * Claude Code's flags are verified against real, previously-shipped behavior
 * (moved here unchanged from run-company-command-impl.ts). The OpenAI Codex
 * CLI and Aider flags were confirmed against the real installed CLIs'
 * `--help` output (`npx @openai/codex exec --help`, `uvx --from aider-chat
 * aider --help`) — notably, `codex exec`'s real non-interactive/no-approval
 * flag is `--sandbox workspace-write`, not the `--full-auto` this started
 * with, which doesn't exist on the installed version (0.146.0). Neither has
 * been run end-to-end against a live model account from this app yet —
 * only the flag names/shapes are confirmed real.
 *
 * Permission scoping is only as granular as each CLI's own model: Claude
 * Code's fine-grained `Edit(pattern)`/`Bash(pattern)` allowlist is unique to
 * it. Codex, Aider, and Google Antigravity CLI get their own coarser
 * non-interactive/auto-approve flags instead of an equivalent path/command
 * allowlist.
 *
 * Google Antigravity CLI's flags were confirmed against the real installed
 * binary's `agy --help` (v1.1.11) — same bar as Codex/Aider. `--mode
 * accept-edits` makes it actually apply edits instead of just proposing a
 * plan; `--dangerously-skip-permissions` is its one coarse auto-approve
 * flag (no human is present to click through prompts in headless mode) —
 * the same shape as Aider's `--yes-always`. Not run end-to-end against a
 * live model account from this app yet, per this project's standing rule
 * against triggering real spawns from an automated pass.
 *
 * `buildInteractiveIntroArgs` is a second, optional capability: "start a
 * real interactive session, seeded with this first message, and stay open"
 * — different from `buildArgs`, which is always one-shot-and-exit. Verified
 * per executor against the real installed `--help` (none of this from web
 * docs, same bar as above): Claude Code and Codex both treat a bare
 * positional prompt as the session's first turn and stay interactive
 * (`claude --help`: "starts an interactive session by default"; `codex
 * --help`: "[PROMPT] Optional user prompt to start the session"). Google
 * Antigravity CLI needs its own explicit flag for this, `-i` /
 * `--prompt-interactive`: "Run an initial prompt interactively and continue
 * the session" — a bare positional there is not documented to do this.
 * Aider has no equivalent at all: its only message flag, `--message`/`-m`,
 * is documented to "process reply then exit (disables chat mode)" — the
 * opposite of staying open — so aider deliberately has no
 * `buildInteractiveIntroArgs`; callers must treat its absence as "this
 * executor can't be seeded" and fall back to a plain blank interactive
 * session instead of inventing a flag that doesn't exist.
 */

export type AiExecutorId = "claude-code" | "openai-codex" | "aider" | "google-antigravity"

export type AiExecutorBuildArgsInput = {
  prompt: string
  editScopePattern: string
  bashPatterns: string[]
}

export type AiExecutor = {
  id: AiExecutorId
  label: string
  binaryName: string
  installHint: string
  installLink: string
  buildArgs: (input: AiExecutorBuildArgsInput) => string[]
  /** Absent means this executor has no supported way to seed an interactive
   *  session with a first message while staying open — see the file-level
   *  comment above (aider's case). */
  buildInteractiveIntroArgs?: (introPrompt: string) => string[]
}

export const DEFAULT_AI_EXECUTOR_ID: AiExecutorId = "claude-code"

export const AI_EXECUTORS: Record<AiExecutorId, AiExecutor> = {
  "claude-code": {
    id: "claude-code",
    label: "Claude Code",
    binaryName: "claude",
    installHint: "npm install -g @anthropic-ai/claude-code",
    installLink: "https://docs.claude.com/en/docs/claude-code/overview",
    buildArgs: ({ prompt, editScopePattern, bashPatterns }) => {
      const allowedTools =
        bashPatterns.length > 0
          ? `Read,Grep,Glob,Edit(${editScopePattern}),${bashPatterns.map((p) => `Bash(${p})`).join(",")}`
          : `Read,Grep,Glob,Edit(${editScopePattern})`
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
        "text",
      ]
    },
    buildInteractiveIntroArgs: (introPrompt) => [introPrompt],
  },
  "openai-codex": {
    id: "openai-codex",
    label: "OpenAI Codex CLI",
    binaryName: "codex",
    installHint: "npm install -g @openai/codex",
    installLink: "https://developers.openai.com/codex/cli",
    buildArgs: ({ prompt }) => ["exec", prompt, "--skip-git-repo-check", "--sandbox", "workspace-write"],
    buildInteractiveIntroArgs: (introPrompt) => [introPrompt],
  },
  aider: {
    id: "aider",
    label: "Aider (OpenAI, Anthropic, or a local/open-source model)",
    binaryName: "aider",
    installHint: "pipx install aider-chat",
    installLink: "https://aider.chat/docs/install.html",
    buildArgs: ({ prompt }) => ["--message", prompt, "--yes-always", "--no-auto-commits"],
    // No buildInteractiveIntroArgs — see file-level comment. Aider's only
    // message flag exits after one reply; there is no real flag to seed the
    // first turn and keep chatting.
  },
  "google-antigravity": {
    id: "google-antigravity",
    label: "Google Antigravity CLI",
    binaryName: "agy",
    installHint: "curl -fsSL https://antigravity.google/cli/install.sh | bash",
    installLink: "https://antigravity.google/cli",
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
