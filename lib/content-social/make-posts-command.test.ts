import { describe, it, expect } from "vitest"
import { MAKE_POSTS_COMMAND, POSTS_DIR } from "./make-posts-command"
import { CANVA_DESIGN_TOOLS } from "./canva-tools"
import { getCompanyCommand } from "../company-commands/registry"

describe("make-posts", () => {
  it("is registered and writes only new files into the posts folder", () => {
    expect(getCompanyCommand("make-posts")).toBe(MAKE_POSTS_COMMAND)
    expect(MAKE_POSTS_COMMAND.outputKind).toBe("new-file-in-dir")
    expect(MAKE_POSTS_COMMAND.outputPath).toBe(POSTS_DIR)
    expect(POSTS_DIR).toBe("notes/content/posts")
  })

  it("asks only for a topic; count and timing are optional", () => {
    expect(MAKE_POSTS_COMMAND.fields.filter((f) => f.required).map((f) => f.key)).toEqual(["topic"])
    expect(MAKE_POSTS_COMMAND.fields.map((f) => f.key)).toEqual(["topic", "count", "when"])
  })

  it("is marked untrusted because Canva's replies enter the AI's context", () => {
    expect(MAKE_POSTS_COMMAND.untrustedInput).toBe(true)
  })

  it("allows exactly Canva's design tools, or none in the fallback", () => {
    expect(MAKE_POSTS_COMMAND.mcpTools ?? []).toEqual(CANVA_DESIGN_TOOLS)
  })

  it("clamps the post count to 1–5 and defaults to 3", () => {
    const p = (count: string) => MAKE_POSTS_COMMAND.buildPrompt({ topic: "brunch", count, when: "" }, "2026-09-25", "")
    expect(p("")).toContain("Write exactly 3 posts")
    expect(p("9")).toContain("Write exactly 5 posts")
    expect(p("0")).toContain("Write exactly 1 post")
    expect(p("abc")).toContain("Write exactly 3 posts")
  })

  it("tells the AI the file format, the gate, and never to publish", () => {
    const prompt = MAKE_POSTS_COMMAND.buildPrompt({ topic: "brunch", count: "2", when: "next week" }, "2026-09-25", "")
    expect(prompt).toContain("notes/content/posts/2026-09-25-")
    expect(prompt).toContain("status: draft")
    expect(prompt).toContain("## Caption")
    expect(prompt).toContain("## Alt text")
    expect(prompt).toContain("next week")
    expect(prompt).toMatch(/never share, publish or delete/i)
  })
})
