import { describe, it, expect } from "vitest"
import { AI_EXECUTORS, DEFAULT_AI_EXECUTOR_ID, getAiExecutor, listAiExecutors } from "./ai-executors"

describe("ai-executors", () => {
  it("every executor has a unique id matching its key and a non-empty binary/label/install hint", () => {
    for (const [key, executor] of Object.entries(AI_EXECUTORS)) {
      expect(executor.id).toBe(key)
      expect(executor.binaryName.length).toBeGreaterThan(0)
      expect(executor.label.length).toBeGreaterThan(0)
      expect(executor.installHint.length).toBeGreaterThan(0)
      expect(executor.installLink.startsWith("https://")).toBe(true)
    }
  })

  it("default id resolves to a real, present executor", () => {
    expect(AI_EXECUTORS[DEFAULT_AI_EXECUTOR_ID]).toBeDefined()
  })

  it("getAiExecutor falls back to the default for an unknown id", () => {
    expect(getAiExecutor("something-made-up").id).toBe(DEFAULT_AI_EXECUTOR_ID)
    expect(getAiExecutor(undefined).id).toBe(DEFAULT_AI_EXECUTOR_ID)
  })

  it("getAiExecutor returns the matching executor for a known id", () => {
    expect(getAiExecutor("aider").id).toBe("aider")
    expect(getAiExecutor("openai-codex").id).toBe("openai-codex")
  })

  it("listAiExecutors returns all registered executors", () => {
    expect(listAiExecutors().map((e) => e.id).sort()).toEqual(Object.keys(AI_EXECUTORS).sort())
  })

  describe("claude-code buildArgs — must stay byte-identical to the pre-existing spawn behavior", () => {
    const executor = AI_EXECUTORS["claude-code"]

    it("with no bashPatterns: adds --disallowedTools Bash", () => {
      const args = executor.buildArgs({ prompt: "do the thing", editScopePattern: "notes/company/**", bashPatterns: [] })
      expect(args).toEqual([
        "-p",
        "do the thing",
        "--allowedTools",
        "Read,Grep,Glob,Edit(notes/company/**)",
        "--disallowedTools",
        "Bash",
        "--permission-mode",
        "manual",
        "--output-format",
        "text",
      ])
    })

    it("with bashPatterns: omits --disallowedTools Bash and appends scoped Bash(...) entries", () => {
      const args = executor.buildArgs({
        prompt: "check inbox",
        editScopePattern: "notes/company/email-checks/**",
        bashPatterns: ["gog -a auto gmail search*", "gog -a auto gmail get*"],
      })
      expect(args).toEqual([
        "-p",
        "check inbox",
        "--allowedTools",
        "Read,Grep,Glob,Edit(notes/company/email-checks/**),Bash(gog -a auto gmail search*),Bash(gog -a auto gmail get*)",
        "--permission-mode",
        "manual",
        "--output-format",
        "text",
      ])
    })
  })

  it("openai-codex buildArgs uses non-interactive exec mode", () => {
    const args = AI_EXECUTORS["openai-codex"].buildArgs({ prompt: "do the thing", editScopePattern: "x/**", bashPatterns: [] })
    expect(args).toEqual(["exec", "do the thing", "--skip-git-repo-check", "--sandbox", "workspace-write"])
  })

  it("aider buildArgs uses non-interactive one-shot message mode", () => {
    const args = AI_EXECUTORS.aider.buildArgs({ prompt: "do the thing", editScopePattern: "x/**", bashPatterns: [] })
    expect(args).toEqual(["--message", "do the thing", "--yes-always", "--no-auto-commits"])
  })
})
