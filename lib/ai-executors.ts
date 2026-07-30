/**
 * Pluggable "which coding-agent CLI runs this company's commands" abstraction.
 *
 * Every executor here is a CLI the user installs and authenticates themselves
 * (their own Anthropic/OpenAI account, their own local Ollama server via
 * Aider's model config) — this app never stores a key or proxies a request.
 * "Bring your own key" just means "point this company at a different already-
 * authenticated CLI," the same shape Claude Code already used before this.
 *
 * Only Claude Code's flags below are verified against real, previously-shipped
 * behavior (moved here unchanged from run-company-command-impl.ts). The
 * OpenAI Codex CLI and Aider invocations are best-effort from their public
 * non-interactive/scripted-mode docs — this repo has neither installed to
 * test against, so treat their exact flags as unverified until a live run
 * confirms them (see LAUNCH.md).
 *
 * Permission scoping is only as granular as each CLI's own model: Claude
 * Code's fine-grained `Edit(pattern)`/`Bash(pattern)` allowlist is unique to
 * it. Codex and Aider get their own coarser non-interactive/auto-approve
 * flags instead of an equivalent path/command allowlist.
 */

export type AiExecutorId = "claude-code" | "openai-codex" | "aider"

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
        "default",
        "--output-format",
        "text",
      ]
    },
  },
  "openai-codex": {
    id: "openai-codex",
    label: "OpenAI Codex CLI",
    binaryName: "codex",
    installHint: "npm install -g @openai/codex",
    installLink: "https://developers.openai.com/codex/cli",
    buildArgs: ({ prompt }) => ["exec", prompt, "--full-auto", "--skip-git-repo-check"],
  },
  aider: {
    id: "aider",
    label: "Aider (OpenAI, Anthropic, or a local/open-source model)",
    binaryName: "aider",
    installHint: "pipx install aider-chat",
    installLink: "https://aider.chat/docs/install.html",
    buildArgs: ({ prompt }) => ["--message", prompt, "--yes-always", "--no-auto-commits"],
  },
}

export function getAiExecutor(id: string | undefined): AiExecutor {
  if (id && id in AI_EXECUTORS) return AI_EXECUTORS[id as AiExecutorId]
  return AI_EXECUTORS[DEFAULT_AI_EXECUTOR_ID]
}

export function listAiExecutors(): AiExecutor[] {
  return Object.values(AI_EXECUTORS)
}
