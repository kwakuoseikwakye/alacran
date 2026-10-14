import { describe, it, expect } from "vitest"
import { cleanAssistantStderr, explainAssistantFailure } from "./clean-stderr"

describe("cleanAssistantStderr", () => {
  it("returns empty string for empty input", () => {
    expect(cleanAssistantStderr("")).toBe("")
    expect(cleanAssistantStderr("   \n\n  ")).toBe("")
  })

  it("filters out 'Reading additional input from stdin...'", () => {
    const raw = `Reading additional input from stdin...
Not inside a trusted directory and --skip-git-repo-check was not specified.`
    expect(cleanAssistantStderr(raw)).toBe(
      "Not inside a trusted directory and --skip-git-repo-check was not specified."
    )
  })

  it("filters out Codex startup banners, metadata headers, and hook debug lines", () => {
    const raw = `Reading additional input from stdin...
OpenAI Codex v0.147.0
--------
workdir: /private/tmp/assistant-workspace-test
model: gpt-5.6-terra
provider: openai
approval: never
sandbox: workspace-write [workdir, /tmp, $TMPDIR]
reasoning effort: low
reasoning summaries: none
session id: 01a0c3d2-f794-7211-aabf-25f8a7bb188a
--------
user
hi
hook: SessionStart
hook: SessionStart Completed
hook: UserPromptSubmit
hook: UserPromptSubmit Completed
codex
Hi! What can I help you with?
hook: Stop
hook: Stop Completed
tokens used
17,336`
    // Since this is just benign banner/session noise with no real error, all noise is stripped
    expect(cleanAssistantStderr(raw)).toBe("Hi! What can I help you with?")
  })

  it("preserves genuine error messages even if surrounded by noise", () => {
    const raw = `Reading additional input from stdin...
OpenAI Codex v0.147.0
--------
workdir: /foo
model: gpt-5.6-terra
2026-09-21T11:56:17.826575Z ERROR codex_models_manager::manager: failed to load models cache: missing field
Error: Rate limit exceeded for organization
tokens used
123`
    expect(cleanAssistantStderr(raw)).toBe("Error: Rate limit exceeded for organization")
  })
})

describe("explainAssistantFailure", () => {
  const name = "Claude Code"

  it("says the AI isn't installed instead of a raw spawn error", () => {
    expect(explainAssistantFailure("spawn claude ENOENT", name)).toBe(
      "Claude Code isn't installed on this computer yet. Install it from Connected tools, then ask again."
    )
  })

  it("asks the user to sign in when the CLI is signed out", () => {
    expect(explainAssistantFailure("Invalid API key · Please run /login", name)).toMatch(/needs you to sign in/)
  })

  it("names a usage limit as a limit, not an error", () => {
    expect(explainAssistantFailure("Claude AI usage limit reached|1790000000", name)).toMatch(/usage limit/)
  })

  it("points at the connection when the network is down", () => {
    expect(explainAssistantFailure("getaddrinfo ENOTFOUND api.anthropic.com", name)).toMatch(/internet connection/)
  })

  it("replaces a bare exit code with a sentence", () => {
    expect(explainAssistantFailure("Process exited with code 1", name)).toMatch(/stopped before answering/)
  })

  it("leaves a message it doesn't recognise alone", () => {
    expect(explainAssistantFailure("Error: Rate limit exceeded for organization", name)).toMatch(/usage limit/)
    expect(explainAssistantFailure("The file was too large to read.", name)).toBe("The file was too large to read.")
  })
})
