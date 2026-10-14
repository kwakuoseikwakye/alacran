import { describe, expect, it } from "vitest"
import { formatStreamLine } from "./format-stream"

const root = "/data/agent-worktrees/acme/r1"
const line = (event: object) => JSON.stringify(event)

describe("formatStreamLine", () => {
  it("announces the start", () => {
    expect(formatStreamLine(line({ type: "system", subtype: "init", model: "claude-opus" }), root).text).toContain("Started")
  })

  it("shows the agent's words with terminal line endings", () => {
    const out = formatStreamLine(
      line({ type: "assistant", message: { content: [{ type: "text", text: "First.\nSecond." }] } }),
      root
    )
    expect(out.text).toBe("First.\r\nSecond.\r\n")
  })

  it("names what a tool is doing, with paths relative to the worktree", () => {
    const tool = (name: string, input: object) =>
      formatStreamLine(line({ type: "assistant", message: { content: [{ type: "tool_use", name, input }] } }), root).text
    expect(tool("Read", { file_path: `${root}/definitions/ontology/company.yaml` })).toContain(
      "Reading definitions/ontology/company.yaml"
    )
    expect(tool("Edit", { file_path: `${root}/notes/pricing.md` })).toContain("✎ Editing notes/pricing.md")
    expect(tool("Write", { file_path: `${root}/docs/new.md` })).toContain("✎ Writing docs/new.md")
    expect(tool("Grep", { pattern: "Acme" })).toContain("Searching for “Acme”")
    expect(tool("SomethingNew", {})).toContain("SomethingNew")
  })

  it("shows a failed tool call, and stays quiet about successful ones", () => {
    const result = (is_error: boolean) =>
      formatStreamLine(
        line({ type: "user", message: { content: [{ type: "tool_result", is_error, content: "Permission denied\nmore" }] } }),
        root
      ).text
    expect(result(true)).toContain("✗ Permission denied")
    expect(result(true)).not.toContain("more")
    expect(result(false)).toBe("")
  })

  it("reports the final result without printing it", () => {
    expect(formatStreamLine(line({ type: "result", subtype: "success", is_error: false }), root)).toEqual({
      text: "",
      result: { ok: true, summary: null },
    })
    expect(formatStreamLine(line({ type: "result", subtype: "error_max_turns", is_error: true }), root).result?.ok).toBe(false)
  })

  it("shows a non-JSON line (the CLI's own error text) dimmed, and ignores blank lines", () => {
    expect(formatStreamLine("Error: not logged in", root).text).toContain("Error: not logged in")
    expect(formatStreamLine("   ", root).text).toBe("")
  })
})

describe("formatStreamLine summary", () => {
  it("keeps the agent's final message as the run's summary", () => {
    const out = formatStreamLine(
      JSON.stringify({ type: "result", subtype: "success", is_error: false, result: "  Tidied the pricing note.  " }),
      "/w"
    )
    expect(out.result).toEqual({ ok: true, summary: "Tidied the pricing note." })
  })
})
