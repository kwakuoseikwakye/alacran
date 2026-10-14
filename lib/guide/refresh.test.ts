import { describe, it, expect, afterEach, afterAll, vi } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { addGuide, guideState, refreshGuide, refreshGuideIfUnchanged } from "./refresh"
import { parseBlock } from "./apply"
import { proposeGuide } from "./proposal"
import { makeRepo, cleanup } from "./test-repo"
import { defaultExecFile } from "@/lib/default-exec-file"
import { renderGuide } from "./render"
import { readGuideInputs } from "./inventory"
import { sha256 } from "./markers"

afterEach(() => { cleanup(); vi.restoreAllMocks() })
const PACKS = fs.mkdtempSync(path.join(os.tmpdir(), "guide-packs-"))
afterAll(() => fs.rmSync(PACKS, { recursive: true, force: true }))
const deps = (packsRoot = PACKS) => ({ exec: defaultExecFile, packsRoot })

const AGREEMENT = "# Working agreement\n\nOwner rules here.\n"
const dept = (name: string) => `departments:\n  - {slug: ${name.toLowerCase()}, name: ${name}, purpose: Handles ${name}., color: "#0369a1"}\n`

describe("addGuide", () => {
  it("appends the block to an existing agreement without touching the owner's text", async () => {
    const r = makeRepo(); r.write("AGENTS.md", AGREEMENT); r.commitAll()
    expect(await addGuide(r.dir, deps())).toEqual({ ok: true, paths: ["AGENTS.md"] })
    const text = r.read("AGENTS.md")
    expect(text.startsWith(AGREEMENT)).toBe(true)
    expect(text).toContain("## How this company works")
  })
  it("refuses a second add, malformed markers, an uncommitted AGENTS.md, and a symlinked AGENTS.md", async () => {
    const r = makeRepo(); r.write("AGENTS.md", AGREEMENT); r.commitAll()
    await addGuide(r.dir, deps()); r.commitAll()
    expect(await addGuide(r.dir, deps())).toMatchObject({ ok: false, code: "exists" })

    const m = makeRepo(); m.write("AGENTS.md", "<!-- alacran:operating-guide:start version=1 -->\nbroken\n"); m.commitAll()
    expect(await addGuide(m.dir, deps())).toMatchObject({ ok: false, code: "malformed" })

    const d = makeRepo(); d.write("AGENTS.md", AGREEMENT); d.commitAll(); d.write("AGENTS.md", AGREEMENT + "edited\n")
    expect(await addGuide(d.dir, deps())).toMatchObject({ ok: false, code: "dirty" })

    const s = makeRepo()
    const outside = path.join(os.tmpdir(), `guide-outside-${process.pid}.md`); fs.writeFileSync(outside, "outside\n")
    try {
      fs.symlinkSync(outside, path.join(s.dir, "AGENTS.md"))
      expect(await addGuide(s.dir, deps())).toMatchObject({ ok: false, code: "unsafe" })
      expect(fs.readFileSync(outside, "utf8")).toBe("outside\n")
    } finally { fs.rmSync(outside, { force: true }) }
  })
  it("with only CLAUDE.md present it points to the portable conversion instead of making a second agreement", async () => {
    const r = makeRepo(); r.write("CLAUDE.md", AGREEMENT); r.commitAll()
    expect(await addGuide(r.dir, deps())).toMatchObject({ ok: false, code: "portable" })
    expect(fs.existsSync(path.join(r.dir, "AGENTS.md"))).toBe(false)
  })
  it("a company with neither file gets an AGENTS.md holding only the block", async () => {
    const r = makeRepo()
    expect(await addGuide(r.dir, deps())).toEqual({ ok: true, paths: ["AGENTS.md"] })
    expect(r.read("AGENTS.md").startsWith("<!-- alacran:operating-guide:start")).toBe(true)
  })
})

describe("refreshGuide", () => {
  async function withGuide() {
    const r = makeRepo(); r.write("AGENTS.md", AGREEMENT); r.commitAll()
    await addGuide(r.dir, deps()); r.commitAll("guide")
    return r
  }
  it("no AGENTS.md or no block means nothing to do and no write", async () => {
    const r = makeRepo()
    expect(await refreshGuide(r.dir, deps())).toEqual({ status: "absent" })
    r.write("AGENTS.md", AGREEMENT); r.commitAll()
    expect(await refreshGuide(r.dir, deps())).toEqual({ status: "absent" })
    expect(r.read("AGENTS.md")).toBe(AGREEMENT)
  })
  it("unchanged inputs write nothing", async () => {
    const r = await withGuide()
    const before = r.read("AGENTS.md")
    expect(await refreshGuide(r.dir, deps())).toEqual({ status: "unchanged" })
    expect(r.read("AGENTS.md")).toBe(before)
  })
  it("changed inputs rewrite only the block and report AGENTS.md for the commit", async () => {
    const r = await withGuide()
    r.write("definitions/departments.yaml", dept("Legal")); r.commitAll("dept")
    expect(await refreshGuide(r.dir, deps())).toEqual({ status: "updated", paths: ["AGENTS.md"] })
    const text = r.read("AGENTS.md")
    expect(text.startsWith(AGREEMENT)).toBe(true)
    expect(text).toContain("- Legal: Handles Legal. (records/legal/)")
    expect(await refreshGuide(r.dir, deps())).toMatchObject({ status: "needs-attention", reason: "dirty" }) // the rewrite is not committed yet
  })
  it("a hand-edited block is left alone", async () => {
    const r = await withGuide()
    r.write("AGENTS.md", r.read("AGENTS.md").replace("Read the company's working agreement", "Read my own words")); r.commitAll("edit")
    r.write("definitions/departments.yaml", dept("Legal")); r.commitAll("dept")
    const before = r.read("AGENTS.md")
    expect(await refreshGuide(r.dir, deps())).toMatchObject({ status: "needs-attention", reason: "edited" })
    expect(r.read("AGENTS.md")).toBe(before)
  })
  it("uncommitted edits to AGENTS.md are refused", async () => {
    const r = await withGuide()
    r.write("definitions/departments.yaml", dept("Legal")); r.commitAll("dept")
    r.write("AGENTS.md", r.read("AGENTS.md") + "\nowner scribble\n")
    const scribbled = r.read("AGENTS.md")
    expect(await refreshGuide(r.dir, deps())).toMatchObject({ status: "needs-attention", reason: "dirty" })
    expect(r.read("AGENTS.md")).toBe(scribbled)
  })
  it("malformed markers are refused", async () => {
    const r = await withGuide()
    r.write("AGENTS.md", r.read("AGENTS.md") + "\n<!-- alacran:operating-guide:end -->\n"); r.commitAll("dup")
    expect(await refreshGuide(r.dir, deps())).toMatchObject({ status: "needs-attention", reason: "malformed" })
  })
  it("a malformed definitions file is refused instead of dropping custom departments", async () => {
    const r = await withGuide()
    r.write("definitions/departments.yaml", "departments: [\n"); r.commitAll("bad")
    const before = r.read("AGENTS.md")
    expect(await refreshGuide(r.dir, deps())).toMatchObject({ status: "needs-attention", reason: "unreadable-inputs" })
    expect(r.read("AGENTS.md")).toBe(before)
  })
  it("a symlinked AGENTS.md is never followed or replaced", async () => {
    const r = await withGuide()
    const real = r.read("AGENTS.md")
    fs.rmSync(path.join(r.dir, "AGENTS.md"))
    const outside = path.join(os.tmpdir(), `guide-outside2-${process.pid}.md`); fs.writeFileSync(outside, real)
    try {
      fs.symlinkSync(outside, path.join(r.dir, "AGENTS.md"))
      expect(await refreshGuide(r.dir, deps())).toMatchObject({ status: "needs-attention", reason: "unsafe" })
      expect(fs.readFileSync(outside, "utf8")).toBe(real)
    } finally { fs.rmSync(outside, { force: true }) }
  })
})

describe("refresh edge cases", () => {
  const tmps = (dir: string) => fs.readdirSync(dir).filter((f) => f.endsWith(".tmp"))
  it("a CRLF AGENTS.md keeps CRLF everywhere and bytes outside the block", async () => {
    const r = makeRepo(); r.write("AGENTS.md", "# Agreement\r\n\r\nOwner rules.\r\n"); r.commitAll()
    await addGuide(r.dir, deps()); r.commitAll("guide")
    const before = r.read("AGENTS.md")
    expect(before.replace(/\r\n/g, "")).not.toContain("\n")
    r.write("definitions/departments.yaml", dept("Legal")); r.commitAll("dept")
    expect(await refreshGuide(r.dir, deps())).toEqual({ status: "updated", paths: ["AGENTS.md"] })
    const after = r.read("AGENTS.md")
    expect(after.replace(/\r\n/g, "")).not.toContain("\n")
    expect(after).toContain("Legal")
    expect(after.startsWith("# Agreement\r\n\r\nOwner rules.\r\n")).toBe(true)
    expect(tmps(r.dir)).toEqual([])
  })
  it("prose that merely mentions both markers is never rewritten", async () => {
    const prose = "Notes: the start marker is <!-- alacran:operating-guide:start and the end is <!-- alacran:operating-guide:end -->.\n"
    const r = makeRepo(); r.write("AGENTS.md", prose); r.commitAll()
    const res = await refreshGuide(r.dir, deps())
    expect(res).toMatchObject({ status: "needs-attention" })
    expect(["edited", "malformed"]).toContain((res as { reason: string }).reason)
    expect(r.read("AGENTS.md")).toBe(prose)
    const add = await addGuide(r.dir, deps())
    expect(add).toMatchObject({ ok: false })
    expect(["exists", "malformed"]).toContain((add as { code: string }).code)
    expect(r.read("AGENTS.md")).toBe(prose)
    expect(tmps(r.dir)).toEqual([])
  })
  it("unchanged and refused outcomes write nothing and leave no temp file", async () => {
    const r = makeRepo(); r.write("AGENTS.md", AGREEMENT); r.commitAll()
    await addGuide(r.dir, deps()); r.commitAll("guide")
    const file = path.join(r.dir, "AGENTS.md")
    const m0 = fs.statSync(file).mtimeMs
    await new Promise((res) => setTimeout(res, 20))
    expect(await refreshGuide(r.dir, deps())).toEqual({ status: "unchanged" })
    expect(fs.statSync(file).mtimeMs).toBe(m0)
    r.write("definitions/departments.yaml", "departments: [\n"); r.commitAll("bad")
    await refreshGuide(r.dir, deps())
    expect(fs.statSync(file).mtimeMs).toBe(m0)
    expect(tmps(r.dir)).toEqual([])
  })
  it("a symlinked AGENTS.md to a file inside the company is also refused by add", async () => {
    const r = makeRepo(); r.write("real.md", AGREEMENT)
    fs.symlinkSync(path.join(r.dir, "real.md"), path.join(r.dir, "AGENTS.md"))
    expect(await addGuide(r.dir, deps())).toMatchObject({ ok: false, code: "unsafe" })
    expect(r.read("real.md")).toBe(AGREEMENT)
  })
})

describe("refresh safety fixes", () => {
  const tmps = (dir: string) => fs.readdirSync(dir).filter((f) => f.endsWith(".tmp"))
  /** exec that runs `after` once, right after the first git status call returns. */
  const hooked = (after: () => void) => {
    let fired = false
    return { ...deps(), exec: (async (c: string, a: string[]) => {
      const out = await defaultExecFile(c, a)
      if (!fired && a.includes("status")) { fired = true; after() }
      return out
    }) as typeof defaultExecFile }
  }
  it("an owner save during the update is never overwritten", async () => {
    const r = makeRepo(); r.write("AGENTS.md", AGREEMENT); r.commitAll()
    await addGuide(r.dir, deps()); r.commitAll("guide")
    r.write("definitions/departments.yaml", dept("Legal")); r.commitAll("dept")
    const file = path.join(r.dir, "AGENTS.md")
    const res = await refreshGuide(r.dir, hooked(() => fs.appendFileSync(file, "OWNER SAVED THIS\n")))
    expect(res).toMatchObject({ status: "needs-attention", reason: "dirty" })
    expect(r.read("AGENTS.md")).toContain("OWNER SAVED THIS\n")
    expect(r.read("AGENTS.md")).not.toContain("Legal")
    expect(tmps(r.dir)).toEqual([])
  })
  it("add on a company without AGENTS.md never clobbers a file created meanwhile", async () => {
    const r = makeRepo()
    const file = path.join(r.dir, "AGENTS.md")
    const res = await addGuide(r.dir, hooked(() => fs.writeFileSync(file, "owner made this\n")))
    expect(res).toMatchObject({ ok: false, code: "dirty" })
    expect(r.read("AGENTS.md")).toBe("owner made this\n")
    expect(tmps(r.dir)).toEqual([])
  })
  it("keeps the file mode on refresh and add", async () => {
    const r = makeRepo(); r.write("AGENTS.md", AGREEMENT); fs.chmodSync(path.join(r.dir, "AGENTS.md"), 0o600); r.commitAll()
    await addGuide(r.dir, deps())
    expect(fs.statSync(path.join(r.dir, "AGENTS.md")).mode & 0o777).toBe(0o600)
    r.commitAll("guide"); r.write("definitions/departments.yaml", dept("Legal")); r.commitAll("dept")
    expect(await refreshGuide(r.dir, deps())).toMatchObject({ status: "updated" })
    expect(fs.statSync(path.join(r.dir, "AGENTS.md")).mode & 0o777).toBe(0o600)
  })
  it("a stray AGENTS.md.*.tmp file is neither a problem nor deleted", async () => {
    const r = makeRepo(); r.write("AGENTS.md", AGREEMENT); r.commitAll()
    await addGuide(r.dir, deps()); r.commitAll("guide")
    r.write("AGENTS.md." + process.pid + ".tmp", "stray"); r.commitAll("stray")
    r.write("definitions/departments.yaml", dept("Legal")); r.commitAll("dept")
    expect(await refreshGuide(r.dir, deps())).toMatchObject({ status: "updated" })
    expect(r.read("AGENTS.md." + process.pid + ".tmp")).toBe("stray")
  })
  it("a directory at AGENTS.md reports a plain message without paths", async () => {
    const r = makeRepo(); fs.mkdirSync(path.join(r.dir, "AGENTS.md"))
    const f = await refreshGuide(r.dir, deps())
    expect(f).toMatchObject({ status: "failed", error: "AGENTS.md couldn't be read or written." })
    expect(await addGuide(r.dir, deps())).toMatchObject({ ok: false, code: "failed", error: "AGENTS.md couldn't be read or written." })
    expect(await guideState(r.dir, deps())).toMatchObject({ state: "needs-attention", reason: "unreadable", detail: "AGENTS.md couldn't be read or written." })
  })
})

describe("fix wave", () => {
  it("a failed write leaves no temp file", async () => {
    const r = makeRepo(); r.write("AGENTS.md", AGREEMENT); r.commitAll()
    await addGuide(r.dir, deps()); r.commitAll("guide")
    r.write("definitions/departments.yaml", dept("Legal")); r.commitAll("dept")
    const real = fs.promises.writeFile
    vi.spyOn(fs.promises, "writeFile").mockImplementation(async (f, ...rest) => {
      await real(f, "partial", { flag: "wx" }) // temp now exists, then the disk "fills up"
      void rest
      throw new Error("ENOSPC")
    })
    expect(await refreshGuide(r.dir, deps())).toMatchObject({ status: "failed" })
    vi.restoreAllMocks()
    expect(fs.readdirSync(r.dir).filter((f) => f.endsWith(".tmp"))).toEqual([])
  })
  it("an untouched block rendered from older template text is stale and gets rewritten", async () => {
    const r = makeRepo(); r.write("AGENTS.md", AGREEMENT); r.commitAll()
    const { inputs } = await readGuideInputs(r.dir, PACKS)
    const g = renderGuide(inputs)
    const body = g.block.slice(g.block.indexOf("-->\n") + 4, g.block.lastIndexOf("<!-- alacran:operating-guide:end"))
    const oldBody = body.replace("Read the company's working agreement", "Read the agreement")
    expect(oldBody).not.toBe(body)
    const old = g.block.replace(/body=[0-9a-f]{64}/, `body=${sha256(oldBody)}`).replace(body, oldBody)
    r.write("AGENTS.md", AGREEMENT + "\n" + old + "\n"); r.commitAll("old guide")
    expect(await guideState(r.dir, deps())).toEqual({ state: "stale" })
    expect(await refreshGuide(r.dir, deps())).toEqual({ status: "updated", paths: ["AGENTS.md"] })
    expect(r.read("AGENTS.md")).toContain("Read the company's working agreement")
  })
})

describe("guideState", () => {
  it("not-added, up-to-date, stale and needs-attention, without writing", async () => {
    const r = makeRepo(); r.write("AGENTS.md", AGREEMENT); r.commitAll()
    expect(await guideState(r.dir, deps())).toEqual({ state: "not-added" })
    await addGuide(r.dir, deps()); r.commitAll("guide")
    expect(await guideState(r.dir, deps())).toEqual({ state: "up-to-date" })
    r.write("definitions/departments.yaml", dept("Legal")); r.commitAll("dept")
    const before = r.read("AGENTS.md")
    expect(await guideState(r.dir, deps())).toEqual({ state: "stale" })
    expect(r.read("AGENTS.md")).toBe(before)
    r.write("AGENTS.md", before.replace("Read the company's", "Read my")); r.commitAll("edit")
    expect(await guideState(r.dir, deps())).toMatchObject({ state: "needs-attention", reason: "edited" })
  })
})

describe("refreshGuideIfUnchanged", () => {
  const OPS = `  - {slug: ops, name: Ops, purpose: Runs ops., color: "#0369a1"}\n`
  /** A guide that went stale because a department was added outside the app, plus what the owner was shown. */
  async function stale() {
    const r = makeRepo(); r.write("AGENTS.md", AGREEMENT); r.commitAll()
    await addGuide(r.dir, deps()); r.commitAll("guide")
    r.write("definitions/departments.yaml", dept("Legal")); r.commitAll("dept")
    const res = await proposeGuide(r.dir, deps())
    if (res.kind !== "proposal") throw new Error("expected a proposal")
    return { r, expected: { id: res.proposal.id, baseBodyHash: res.proposal.baseBodyHash } }
  }
  const bodyHashOf = (text: string) => {
    const parsed = parseBlock(text)
    if (parsed.kind !== "ok") throw new Error("expected a block")
    return parsed.bodyHash
  }
  /** What refreshGuide and the guarded form say about the same repo. Neither writes in the states this is used for. */
  const both = async (r: ReturnType<typeof makeRepo>) => ({
    plain: await refreshGuide(r.dir, deps()),
    guarded: await refreshGuideIfUnchanged(r.dir, deps(), { id: "a".repeat(64), baseBodyHash: "b".repeat(64) }),
  })

  it("writes exactly the block the owner was shown when the id and the base still match", async () => {
    const { r, expected } = await stale()
    const before = r.read("AGENTS.md")
    expect(await refreshGuideIfUnchanged(r.dir, deps(), expected)).toEqual({ status: "updated", paths: ["AGENTS.md"] })
    const after = r.read("AGENTS.md")
    expect(after.startsWith(AGREEMENT)).toBe(true)
    expect(after).toContain("- Legal: Handles Legal. (records/legal/)")
    expect(bodyHashOf(before)).toBe(expected.baseBodyHash)
    expect(bodyHashOf(after)).toBe(expected.id)
  })

  it("writes the same bytes refreshGuide writes, through the same path", async () => {
    const a = await stale()
    const b = await stale()
    expect(await refreshGuide(b.r.dir, deps())).toEqual({ status: "updated", paths: ["AGENTS.md"] })
    expect(await refreshGuideIfUnchanged(a.r.dir, deps(), a.expected)).toEqual({ status: "updated", paths: ["AGENTS.md"] })
    expect(a.r.read("AGENTS.md")).toBe(b.r.read("AGENTS.md"))
  })

  it("a proposal id that no longer matches writes nothing", async () => {
    const { r, expected } = await stale()
    const before = r.read("AGENTS.md")
    expect(await refreshGuideIfUnchanged(r.dir, deps(), { ...expected, id: "a".repeat(64) })).toEqual({ status: "changed" })
    expect(r.read("AGENTS.md")).toBe(before)
    expect(r.git("status", "--porcelain").trim()).toBe("")
  })

  it("a base that no longer matches writes nothing", async () => {
    const { r, expected } = await stale()
    const before = r.read("AGENTS.md")
    expect(await refreshGuideIfUnchanged(r.dir, deps(), { ...expected, baseBodyHash: "a".repeat(64) })).toEqual({ status: "changed" })
    expect(r.read("AGENTS.md")).toBe(before)
    expect(r.git("status", "--porcelain").trim()).toBe("")
  })

  it("a department added after the owner looked is not written under the old approval", async () => {
    const { r, expected } = await stale()
    r.write("definitions/departments.yaml", dept("Legal") + OPS); r.commitAll("more")
    const before = r.read("AGENTS.md")
    expect(await refreshGuideIfUnchanged(r.dir, deps(), expected)).toEqual({ status: "changed" })
    expect(r.read("AGENTS.md")).toBe(before)
  })

  it("writes the rendering it checked even when an input changes right after the check", async () => {
    const { r, expected } = await stale()
    const real = fs.promises.writeFile
    vi.spyOn(fs.promises, "writeFile").mockImplementation(async (f, ...rest) => {
      // the company's inputs move after the one reading, just before the new file is put in place
      fs.writeFileSync(path.join(r.dir, "definitions/departments.yaml"), dept("Legal") + OPS)
      return real(f, ...rest)
    })
    const res = await refreshGuideIfUnchanged(r.dir, deps(), expected)
    vi.restoreAllMocks()
    expect(res).toEqual({ status: "updated", paths: ["AGENTS.md"] })
    const after = r.read("AGENTS.md")
    expect(bodyHashOf(after)).toBe(expected.id)
    expect(after).toContain("Legal")
    expect(after).not.toContain("Ops")
    expect(r.read("definitions/departments.yaml")).toContain("Ops")
  })

  it("no block: absent, as refreshGuide says, and nothing is written", async () => {
    const r = makeRepo(); r.write("AGENTS.md", AGREEMENT); r.commitAll()
    const { plain, guarded } = await both(r)
    expect(guarded).toEqual({ status: "absent" })
    expect(guarded).toEqual(plain)
    expect(r.read("AGENTS.md")).toBe(AGREEMENT)
  })

  it("a current guide: unchanged, as refreshGuide says, whatever the expected values are", async () => {
    const r = makeRepo(); r.write("AGENTS.md", AGREEMENT); r.commitAll()
    await addGuide(r.dir, deps()); r.commitAll("guide")
    const before = r.read("AGENTS.md")
    const { plain, guarded } = await both(r)
    expect(guarded).toEqual({ status: "unchanged" })
    expect(guarded).toEqual(plain)
    expect(r.read("AGENTS.md")).toBe(before)
  })

  it("a hand-edited block: needs attention, as refreshGuide says, and the file is left alone", async () => {
    const r = makeRepo(); r.write("AGENTS.md", AGREEMENT); r.commitAll()
    await addGuide(r.dir, deps()); r.commitAll("guide")
    r.write("AGENTS.md", r.read("AGENTS.md").replace("Read the company's working agreement", "Read my own words")); r.commitAll("edit")
    r.write("definitions/departments.yaml", dept("Legal")); r.commitAll("dept")
    const before = r.read("AGENTS.md")
    const { plain, guarded } = await both(r)
    expect(guarded).toMatchObject({ status: "needs-attention", reason: "edited" })
    expect(guarded).toEqual(plain)
    expect(r.read("AGENTS.md")).toBe(before)
  })

  it("unsaved changes in AGENTS.md: needs attention, as refreshGuide says, and the file is left alone", async () => {
    const r = makeRepo(); r.write("AGENTS.md", AGREEMENT); r.commitAll()
    await addGuide(r.dir, deps()); r.commitAll("guide")
    r.write("definitions/departments.yaml", dept("Legal")); r.commitAll("dept")
    r.write("AGENTS.md", r.read("AGENTS.md") + "\nowner scribble\n")
    const scribbled = r.read("AGENTS.md")
    const { plain, guarded } = await both(r)
    expect(guarded).toMatchObject({ status: "needs-attention", reason: "dirty" })
    expect(guarded).toEqual(plain)
    expect(r.read("AGENTS.md")).toBe(scribbled)
  })

  it("a block that differs only in its hidden fingerprint is rewritten with the current one, as refreshGuide does", async () => {
    const r = makeRepo(); r.write("AGENTS.md", AGREEMENT); r.commitAll()
    await addGuide(r.dir, deps()); r.commitAll("guide")
    const was = parseBlock(r.read("AGENTS.md"))
    if (was.kind !== "ok" || !was.bodyHash || !was.fingerprint) throw new Error("expected a block")
    r.write("AGENTS.md", r.read("AGENTS.md").replace(/fingerprint=[0-9a-f]{64}/, `fingerprint=${"c".repeat(64)}`)); r.commitAll("stamp")
    const expected = { id: was.bodyHash, baseBodyHash: was.bodyHash }
    expect(await refreshGuideIfUnchanged(r.dir, deps(), { ...expected, id: "a".repeat(64) })).toEqual({ status: "changed" })
    expect(await refreshGuideIfUnchanged(r.dir, deps(), expected)).toEqual({ status: "updated", paths: ["AGENTS.md"] })
    const now = parseBlock(r.read("AGENTS.md"))
    if (now.kind !== "ok") throw new Error("expected a block")
    expect(now.bodyHash).toBe(was.bodyHash)
    expect(now.fingerprint).toBe(was.fingerprint)
  })

  it("never throws: a directory at AGENTS.md and a failed write both come back as failed, with no temp file left", async () => {
    const d = makeRepo(); fs.mkdirSync(path.join(d.dir, "AGENTS.md"))
    expect(await refreshGuideIfUnchanged(d.dir, deps(), { id: "a".repeat(64), baseBodyHash: "b".repeat(64) }))
      .toEqual({ status: "failed", error: "AGENTS.md couldn't be read or written." })

    const { r, expected } = await stale()
    const real = fs.promises.writeFile
    vi.spyOn(fs.promises, "writeFile").mockImplementation(async (f, ...rest) => {
      await real(f, "partial", { flag: "wx" }) // temp now exists, then the disk "fills up"
      void rest
      throw new Error("ENOSPC")
    })
    const res = await refreshGuideIfUnchanged(r.dir, deps(), expected)
    vi.restoreAllMocks()
    expect(res).toMatchObject({ status: "failed" })
    expect(fs.readdirSync(r.dir).filter((f) => f.endsWith(".tmp"))).toEqual([])
  })
})
