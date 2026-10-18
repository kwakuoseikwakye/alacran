import { describe, it, expect, beforeEach, vi } from "vitest"

// The registry is the only thing that may name a root; the exec seam stands in
// for git so no test touches a real process.
const exec = vi.fn()
vi.mock("@/lib/get-effective-agents", () => ({
  getEffectiveAgents: async () => [{ id: "co", rootPath: "/abs/secret/root" }],
}))
vi.mock("@/lib/default-exec-file", () => ({ defaultExecFile: (...a: unknown[]) => exec(...a) }))

const { GET, ...rest } = await import("./route")

function get(query: string, headers: Record<string, string> = {}): Request {
  return new Request(`http://127.0.0.1:4319/api/brain/note?${query}`, {
    headers: { host: "127.0.0.1:4319", ...headers },
  })
}
const q = (path: string, companyId = "co") =>
  `companyId=${encodeURIComponent(companyId)}&path=${encodeURIComponent(path)}`

describe("GET /api/brain/note", () => {
  beforeEach(() => exec.mockReset())

  it("exports only GET", () => {
    expect(Object.keys(rest).filter((k) => k !== "dynamic")).toEqual([])
  })

  it("refuses non-local requests", async () => {
    const res = await GET(get(q("notes/a.md"), { host: "evil.example" }))
    expect(res.status).toBe(403)
    expect(exec).not.toHaveBeenCalled()
  })

  it("unknown companyId is 404", async () => {
    const res = await GET(get(q("notes/a.md", "nope")))
    expect(res.status).toBe(404)
    expect(exec).not.toHaveBeenCalled()
  })

  it("missing companyId or path is 400", async () => {
    expect((await GET(get("path=notes/a.md"))).status).toBe(400)
    expect((await GET(get("companyId=co"))).status).toBe(400)
  })

  it.each([
    ["empty", ""],
    ["parent segment", "../x.md"],
    ["nested parent segment", "notes/../../x.md"],
    ["dot segment", "notes/./a.md"],
    ["absolute", "/etc/passwd"],
    ["backslash", "notes\\a.md"],
    ["NUL", "notes/a\0.md"],
    ["newline", "notes/a\n.md"],
    ["leading dash", "-notes/a.md"],
    ["option-looking", "--output=x"],
    ["not a memory path", "src/a.ts"],
    ["non-md skill file", ".claude/skills/x/run.sh"],
    ["dotfile outside skills", ".env"],
    ["git internals", ".git/config"],
    ["skill dir escape", ".claude/../secrets.md"],
  ])("rejects %s with 400, before touching git", async (_n, p) => {
    const res = await GET(get(q(p)))
    expect(res.status).toBe(400)
    expect(exec).not.toHaveBeenCalled()
  })

  it("allows .md skill files under .claude/ and .agents/", async () => {
    exec.mockResolvedValue({ stdout: "x", stderr: "" })
    expect((await GET(get(q(".claude/skills/a/SKILL.md")))).status).toBe(200)
    expect((await GET(get(q(".agents/skills/a/SKILL.md")))).status).toBe(200)
  })

  it("returns HEAD text for a tracked note, read via HEAD:./ inside the root", async () => {
    exec.mockResolvedValue({ stdout: "# Hello\n", stderr: "" })
    const res = await GET(get(q("notes/a.md")))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ path: "notes/a.md", text: "# Hello\n" })
    const [cmd, args] = exec.mock.calls[0]
    expect(cmd).toBe("git")
    expect(args).toEqual(expect.arrayContaining(["-C", "/abs/secret/root", "show", "HEAD:./notes/a.md"]))
  })

  it("untracked or missing file is 404 with a generic message", async () => {
    exec.mockRejectedValueOnce(new Error("fatal: path in /abs/secret/root"))
    const res = await GET(get(q("notes/missing.md")))
    expect(res.status).toBe(404)
    const body = JSON.stringify(await res.json())
    expect(body).not.toContain("/abs/secret/root")
    expect(body).not.toContain("fatal")
  })
})
