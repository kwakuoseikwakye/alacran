import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { chmod, mkdir, mkdtemp, readFile, readdir, rm, stat, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { MIRROR_MANIFEST, readGeneratedMirrors, syncAgentSkills } from "./sync-agent-skills"

let root: string
beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "sync-skills-"))
})
afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

async function put(rel: string, text: string) {
  const file = path.join(root, ...rel.split("/"))
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(file, text)
}
const get = (rel: string) => readFile(path.join(root, ...rel.split("/")), "utf-8")
const SKILL = "---\nname: probe\ndescription: A probe.\n---\nBody line.\n"
const MARKER = "<!-- generated from .agents/skills/probe: edit there, not here -->"

describe("syncAgentSkills", () => {
  it("copies a shared skill into each agent's folder with a marker and its supporting files", async () => {
    await put(".agents/skills/probe/SKILL.md", SKILL)
    await put(".agents/skills/probe/scripts/run.sh", "#!/bin/sh\necho hi\n")
    await chmod(path.join(root, ".agents/skills/probe/scripts/run.sh"), 0o755)

    const report = await syncAgentSkills(root)

    for (const mirror of [".claude/skills", ".kiro/skills"]) {
      expect(await get(`${mirror}/probe/SKILL.md`)).toBe(`---\nname: probe\ndescription: A probe.\n---\n${MARKER}\nBody line.\n`)
      expect(await get(`${mirror}/probe/scripts/run.sh`)).toBe("#!/bin/sh\necho hi\n")
      if (process.platform !== "win32") {
        expect((await stat(path.join(root, mirror, "probe/scripts/run.sh"))).mode & 0o111).not.toBe(0)
      }
    }
    expect(report.written).toEqual([".claude/skills/probe", ".kiro/skills/probe", MIRROR_MANIFEST])
    expect(report.conflicts).toEqual([])
  })

  it("puts the marker after CRLF frontmatter, and at the top when there is no frontmatter", async () => {
    await put(".agents/skills/crlf/SKILL.md", "---\r\nname: crlf\r\n---\r\nBody\r\n")
    await put(".agents/skills/plain/SKILL.md", "Just text\n")
    await syncAgentSkills(root)
    expect(await get(".claude/skills/crlf/SKILL.md")).toBe(
      "---\r\nname: crlf\r\n---\r\n<!-- generated from .agents/skills/crlf: edit there, not here -->\nBody\r\n"
    )
    expect(await get(".claude/skills/plain/SKILL.md")).toBe(
      "<!-- generated from .agents/skills/plain: edit there, not here -->\nJust text\n"
    )
  })

  it("does nothing the second time", async () => {
    await put(".agents/skills/probe/SKILL.md", SKILL)
    await syncAgentSkills(root)
    const again = await syncAgentSkills(root)
    expect(again).toEqual({ written: [], removed: [], conflicts: [], unchanged: 2 })
  })

  it("carries a change to the shared skill into the mirrors", async () => {
    await put(".agents/skills/probe/SKILL.md", SKILL)
    await syncAgentSkills(root)
    await put(".agents/skills/probe/SKILL.md", SKILL.replace("Body line.", "New body."))

    const report = await syncAgentSkills(root)

    expect(await get(".claude/skills/probe/SKILL.md")).toContain("New body.")
    // The manifest records the new hashes, so it is rewritten too.
    expect(report.written).toEqual([".claude/skills/probe", ".kiro/skills/probe", MIRROR_MANIFEST])
  })

  it("never overwrites a generated mirror someone edited, and says so", async () => {
    await put(".agents/skills/probe/SKILL.md", SKILL)
    await syncAgentSkills(root)
    await put(".claude/skills/probe/SKILL.md", "my hand edit")
    await put(".agents/skills/probe/SKILL.md", SKILL.replace("Body line.", "New body."))

    const report = await syncAgentSkills(root)

    expect(await get(".claude/skills/probe/SKILL.md")).toBe("my hand edit")
    expect(report.conflicts).toEqual([{ path: ".claude/skills/probe", reason: "edited" }])
    expect(await get(".kiro/skills/probe/SKILL.md")).toContain("New body.")
  })

  it("never touches a hand-written skill of the same name, and still fills the other mirror", async () => {
    await put(".agents/skills/probe/SKILL.md", SKILL)
    await put(".kiro/skills/probe/SKILL.md", "written by hand")

    const report = await syncAgentSkills(root)

    expect(await get(".kiro/skills/probe/SKILL.md")).toBe("written by hand")
    expect(report.conflicts).toEqual([{ path: ".kiro/skills/probe", reason: "not-generated" }])
    expect(await get(".claude/skills/probe/SKILL.md")).toContain(MARKER)
    expect(await readGeneratedMirrors(root)).toEqual(new Map([[".claude/skills", new Set(["probe"])]]))
  })

  it("adopts a mirror that is already identical after the manifest was lost or corrupted", async () => {
    await put(".agents/skills/probe/SKILL.md", SKILL)
    await syncAgentSkills(root)
    await put(MIRROR_MANIFEST, "{nope")

    const report = await syncAgentSkills(root)

    expect(report.conflicts).toEqual([])
    expect(report.written).toEqual([MIRROR_MANIFEST])
    expect((await readGeneratedMirrors(root)).get(".claude/skills")).toEqual(new Set(["probe"]))
  })

  it("removes the mirrors of a deleted shared skill only when they are unedited", async () => {
    await put(".agents/skills/gone/SKILL.md", "---\nname: gone\n---\n")
    await put(".agents/skills/kept/SKILL.md", "---\nname: kept\n---\n")
    await syncAgentSkills(root)
    await rm(path.join(root, ".agents/skills/gone"), { recursive: true })
    await rm(path.join(root, ".agents/skills/kept"), { recursive: true })
    await put(".kiro/skills/kept/SKILL.md", "edited after generation")

    const report = await syncAgentSkills(root)

    await expect(stat(path.join(root, ".claude/skills/gone"))).rejects.toThrow()
    await expect(stat(path.join(root, ".kiro/skills/gone"))).rejects.toThrow()
    expect(await get(".kiro/skills/kept/SKILL.md")).toBe("edited after generation")
    expect(report.removed.sort()).toEqual([".claude/skills/gone", ".claude/skills/kept", ".kiro/skills/gone"])
    expect(report.conflicts).toEqual([{ path: ".kiro/skills/kept", reason: "edited" }])
  })

  it("does nothing, and creates nothing, when there is no shared skills folder", async () => {
    const report = await syncAgentSkills(root)
    expect(report).toEqual({ written: [], removed: [], conflicts: [], unchanged: 0 })
    expect(await readdir(root)).toEqual([])
  })

  it("ignores folders without a SKILL.md, dot folders and loose files", async () => {
    await put(".agents/skills/no-skill-file/notes.txt", "x")
    await put(".agents/skills/.hidden/SKILL.md", "x")
    await put(".agents/skills/STAMP.md", "Tag: v1")
    const report = await syncAgentSkills(root)
    expect(report.written).toEqual([])
    await expect(stat(path.join(root, ".claude"))).rejects.toThrow()
  })

  it("cannot be steered outside the company by a manifest naming a path", async () => {
    await put("outside/keep.txt", "keep")
    await put(
      MIRROR_MANIFEST,
      JSON.stringify({ version: 1, skills: { "../outside": { mirrors: { ".claude/skills": "x" } }, ok: { mirrors: { "../evil": "x" } } } })
    )
    await syncAgentSkills(root)
    expect(await get("outside/keep.txt")).toBe("keep")
    expect(await readGeneratedMirrors(root)).toEqual(new Map())
  })

  it("does not call a mirror someone edited generated, so the Skills page does not hide the edit", async () => {
    await put(".agents/skills/probe/SKILL.md", SKILL)
    await syncAgentSkills(root)
    await put(".claude/skills/probe/SKILL.md", "my hand edit")

    expect(await readGeneratedMirrors(root)).toEqual(new Map([[".kiro/skills", new Set(["probe"])]]))
  })

  it("refuses to write through a mirror folder that links to somewhere outside the company", async () => {
    await put(".agents/skills/probe/SKILL.md", SKILL)
    const outside = await mkdtemp(path.join(tmpdir(), "outside-"))
    try {
      await mkdir(path.join(root, ".kiro"), { recursive: true })
      await symlink(outside, path.join(root, ".kiro", "skills"))

      const report = await syncAgentSkills(root)

      expect(await readdir(outside)).toEqual([])
      expect(report.conflicts).toEqual([{ path: ".kiro/skills", reason: "outside-company" }])
      expect(await get(".claude/skills/probe/SKILL.md")).toContain(MARKER)
    } finally {
      await rm(outside, { recursive: true, force: true })
    }
  })

  it("does nothing when the shared skills folder itself links outside the company", async () => {
    const outside = await mkdtemp(path.join(tmpdir(), "outside-"))
    try {
      await writeFile(path.join(outside, "placeholder"), "x")
      await mkdir(path.join(outside, "probe"), { recursive: true })
      await writeFile(path.join(outside, "probe", "SKILL.md"), SKILL)
      await mkdir(path.join(root, ".agents"), { recursive: true })
      await symlink(outside, path.join(root, ".agents", "skills"))

      const report = await syncAgentSkills(root)

      expect(report.written).toEqual([])
      expect(report.conflicts).toEqual([{ path: ".agents/skills", reason: "outside-company" }])
      await expect(stat(path.join(root, ".claude"))).rejects.toThrow()
    } finally {
      await rm(outside, { recursive: true, force: true })
    }
  })

  it("does not call a mirror someone edited generated, so the Skills page does not hide the edit", async () => {
    await put(".agents/skills/probe/SKILL.md", SKILL)
    await syncAgentSkills(root)
    await put(".claude/skills/probe/SKILL.md", "my hand edit")

    expect(await readGeneratedMirrors(root)).toEqual(new Map([[".kiro/skills", new Set(["probe"])]]))
  })

  it("refuses to write through a mirror folder that links to somewhere outside the company", async () => {
    await put(".agents/skills/probe/SKILL.md", SKILL)
    const outside = await mkdtemp(path.join(tmpdir(), "outside-"))
    try {
      await mkdir(path.join(root, ".kiro"), { recursive: true })
      await symlink(outside, path.join(root, ".kiro", "skills"))

      const report = await syncAgentSkills(root)

      expect(await readdir(outside)).toEqual([])
      expect(report.conflicts).toEqual([{ path: ".kiro/skills", reason: "outside-company" }])
      expect(await get(".claude/skills/probe/SKILL.md")).toContain(MARKER)
    } finally {
      await rm(outside, { recursive: true, force: true })
    }
  })

  it("does nothing when the shared skills folder itself links outside the company", async () => {
    const outside = await mkdtemp(path.join(tmpdir(), "outside-"))
    try {
      await writeFile(path.join(outside, "placeholder"), "x")
      await mkdir(path.join(outside, "probe"), { recursive: true })
      await writeFile(path.join(outside, "probe", "SKILL.md"), SKILL)
      await mkdir(path.join(root, ".agents"), { recursive: true })
      await symlink(outside, path.join(root, ".agents", "skills"))

      const report = await syncAgentSkills(root)

      expect(report.written).toEqual([])
      expect(report.conflicts).toEqual([{ path: ".agents/skills", reason: "outside-company" }])
      await expect(stat(path.join(root, ".claude"))).rejects.toThrow()
    } finally {
      await rm(outside, { recursive: true, force: true })
    }
  })

  it("handles skill folders with spaces and accents", async () => {
    await put(".agents/skills/café notes/SKILL.md", "---\nname: café notes\n---\nBody\n")
    await syncAgentSkills(root)
    expect(await get(".kiro/skills/café notes/SKILL.md")).toContain("Body")
  })
})
