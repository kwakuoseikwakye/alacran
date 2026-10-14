import { describe, it, expect } from "vitest"
import { applyGuide, parseBlock, type RenderedGuide } from "./apply"
import { END_MARKER, START_PREFIX, sha256 } from "./markers"

function rendered(body = "## How this company works\n\nHello.\n"): RenderedGuide {
  const fingerprint = sha256("inputs-" + body)
  const bodyHash = sha256(body)
  return { block: `${START_PREFIX} version=1 fingerprint=${fingerprint} body=${bodyHash} -->\n${body}${END_MARKER}`, fingerprint, bodyHash }
}

describe("parseBlock", () => {
  it("no markers means none", () => {
    expect(parseBlock("# My agreement\n")).toEqual({ kind: "none" })
  })
  it("reads one well-formed pair and says whether the body is untouched", () => {
    const r = rendered()
    const p = parseBlock(`before\n${r.block}\nafter\n`)
    expect(p).toMatchObject({ kind: "ok", fingerprint: r.fingerprint, bodyHash: r.bodyHash, untouched: true })
    const edited = parseBlock(`before\n${r.block.replace("Hello.", "Hello!")}\nafter\n`)
    expect(edited).toMatchObject({ kind: "ok", untouched: false })
  })
  it.each([
    ["two pairs", () => `${rendered().block}\n${rendered().block}\n`, "duplicate"],
    ["nested start", () => `${START_PREFIX} version=1 -->\n${START_PREFIX} version=1 -->\n${END_MARKER}\n`, "nested"],
    ["start without end", () => `${START_PREFIX} version=1 -->\nbody\n`, "unclosed"],
    ["end without start", () => `body\n${END_MARKER}\n`, "unclosed"],
    ["end before start", () => `${END_MARKER}\n${START_PREFIX} version=1 -->\n`, "unclosed"],
    ["start marker never closes its comment", () => `${START_PREFIX} version=1\nbody\n${END_MARKER}\n`, "unclosed"],
  ])("%s is an error", (_label, make, error) => {
    expect(parseBlock(make())).toEqual({ kind: "error", error })
  })
})

describe("applyGuide", () => {
  it("replace keeps every byte outside the block", () => {
    const old = rendered("## old\n")
    const next = rendered("## new\n")
    const text = `# Agreement\n\nOwner text.\n\n${old.block}\n\nMore owner text, no trailing newline`
    const out = applyGuide(text, next, "replace")
    expect(out).toEqual({ ok: true, text: `# Agreement\n\nOwner text.\n\n${next.block}\n\nMore owner text, no trailing newline` })
  })
  it("uses the file's own line ending (CRLF in, CRLF out) and keeps Unicode", () => {
    const old = rendered("## old\n").block.replace(/\n/g, "\r\n")
    const text = `# Accord 法務\r\n\r\n${old}\r\n\r\nFin\r\n`
    const r = applyGuide(text, rendered("## new\n"), "replace")
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.text.startsWith("# Accord 法務\r\n\r\n")).toBe(true)
    expect(r.text.endsWith("\r\n\r\nFin\r\n")).toBe(true)
    expect(r.text).not.toMatch(/[^\r]\n/) // no bare LF anywhere
    expect(r.text).toContain("## new")
  })
  it("append adds one block after a blank line, whatever the file ends with", () => {
    const r = rendered()
    expect(applyGuide("# A\n", r, "append")).toEqual({ ok: true, text: `# A\n\n${r.block}\n` })
    expect(applyGuide("# A", r, "append")).toEqual({ ok: true, text: `# A\n\n${r.block}\n` })
    expect(applyGuide("# A\n\n", r, "append")).toEqual({ ok: true, text: `# A\n\n\n${r.block}\n` })
    expect(applyGuide("", r, "append")).toEqual({ ok: true, text: `${r.block}\n` })
  })
  it("replace with no block is missing; append over a block is exists; markers errors pass through", () => {
    const r = rendered()
    expect(applyGuide("# A\n", r, "replace")).toEqual({ ok: false, error: "missing" })
    expect(applyGuide(`${r.block}\n`, r, "append")).toEqual({ ok: false, error: "exists" })
    expect(applyGuide(`${r.block}\n${r.block}\n`, r, "replace")).toEqual({ ok: false, error: "duplicate" })
  })
  it("replace refuses prose mentioning both markers with no real block", () => {
    const text = `# Accord\n\nSee ${START_PREFIX} version=1 -->\nowner prose\n${END_MARKER}\n`
    const r = applyGuide(text, rendered(), "replace")
    expect(r).toEqual({ ok: false, error: "edited" })
  })
  it("replace refuses a real block whose body was hand-edited", () => {
    const r = rendered()
    const edited = r.block.replace("Hello.", "Hello!")
    const text = `before\n${edited}\nafter\n`
    const result = applyGuide(text, rendered(), "replace")
    expect(result).toEqual({ ok: false, error: "edited" })
  })
  it("CRLF-converted real block still reports untouched: true and replace succeeds", () => {
    const r = rendered()
    const crlfBlock = r.block.replace(/\n/g, "\r\n")
    const text = `# A\r\n\r\n${crlfBlock}\r\n\r\n# B\r\n`
    const parsed = parseBlock(text)
    expect(parsed).toMatchObject({ kind: "ok", untouched: true })
    const result = applyGuide(text, rendered("## new\n"), "replace")
    expect(result.ok).toBe(true)
  })
  it("mixed-ending file append keeps existing bytes and appends with LF", () => {
    const r = rendered()
    const text = "a\r\nb\nc\n"
    const result = applyGuide(text, r, "append")
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.text.startsWith("a\r\nb\nc\n\n")).toBe(true)
    expect(result.text).toContain("## How this company works")
  })
})
