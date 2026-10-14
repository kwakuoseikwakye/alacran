import { describe, it, expect, afterEach } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { execFileSync } from "node:child_process"
import { addRecord, createDepartment, editDepartment, planRemoval, removeDepartment, retryCommit, realDeps, type Deps } from "./mutations"
import { readDefinitions } from "./definitions"
import { defaultExecFile } from "@/lib/default-exec-file"
import { addGuide } from "@/lib/guide/refresh"

const dirs: string[] = []
function makeRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dept-mut-"))
  dirs.push(dir)
  const git = (...a: string[]) => execFileSync("git", ["-C", dir, ...a], { encoding: "utf8" })
  git("init", "-q"); git("config", "user.email", "t@t"); git("config", "user.name", "t")
  fs.writeFileSync(path.join(dir, "README.md"), "x"); git("add", "."); git("commit", "-qm", "init")
  return { dir, git, read: (p: string) => fs.readFileSync(path.join(dir, p), "utf8"), exists: (p: string) => fs.existsSync(path.join(dir, p)) }
}
afterEach(() => { while (dirs.length) fs.rmSync(dirs.pop()!, { recursive: true, force: true }) })

const legal = { name: "Legal", purpose: "Contracts and compliance.", color: "#0369a1" }
const filesIn = (git: (...a: string[]) => string) => git("show", "--name-only", "--format=", "HEAD").split("\n").filter(Boolean).sort()

describe("createDepartment", () => {
  it("writes the definition and a placeholder, and commits exactly those two paths", async () => {
    const { dir, git, read } = makeRepo()
    fs.writeFileSync(path.join(dir, "unrelated.txt"), "someone else's work")
    fs.writeFileSync(path.join(dir, "README.md"), "edited by someone")
    const r = await createDepartment(dir, legal)
    expect(r).toMatchObject({ ok: true, slug: "legal", committed: true })
    expect(read("definitions/departments.yaml")).toContain("slug: legal")
    expect(filesIn(git)).toEqual(["definitions/departments.yaml", "records/legal/.gitkeep"])
    expect(git("status", "--porcelain")).toContain("unrelated.txt")
    expect(git("status", "--porcelain")).toContain("README.md")
  })
  it("keeps comments and unrelated keys and existing entries byte-for-byte", async () => {
    const { dir, git, read } = makeRepo()
    fs.mkdirSync(path.join(dir, "definitions"))
    const before = "# owner note\nextra: keep-me\ndepartments:\n  # first\n  - slug: ops\n    name: Ops\n    purpose: Run things.\n    color: \"#0f766e\"\n"
    fs.writeFileSync(path.join(dir, "definitions", "departments.yaml"), before)
    git("add", "."); git("commit", "-qm", "defs")
    await createDepartment(dir, legal)
    const after = read("definitions/departments.yaml")
    expect(after.startsWith(before.trimEnd())).toBe(true)
    expect(after).toContain("# owner note")
    expect(after).toContain("extra: keep-me")
    expect(after).toContain("# first")
    expect(readDefinitions(dir)).toMatchObject({ ok: true })
  })
  it("adopting an existing folder preserves every record byte and adds no placeholder", async () => {
    const { dir, git, read } = makeRepo()
    fs.mkdirSync(path.join(dir, "records", "legal"), { recursive: true })
    fs.writeFileSync(path.join(dir, "records", "legal", "nda.md"), "secret terms")
    git("add", "."); git("commit", "-qm", "records")
    expect(await createDepartment(dir, legal)).toMatchObject({ ok: false, code: "folder-exists" })
    const r = await createDepartment(dir, { ...legal, adopt: true })
    expect(r).toMatchObject({ ok: true, slug: "legal", committed: true })
    expect(read("records/legal/nda.md")).toBe("secret terms")
    expect(fs.existsSync(path.join(dir, "records/legal/.gitkeep"))).toBe(false)
    expect(filesIn(git)).toEqual(["definitions/departments.yaml"])
  })
  it("a differently capitalised existing folder is folder-case, not adoptable", async () => {
    const { dir } = makeRepo()
    fs.mkdirSync(path.join(dir, "records", "Legal"), { recursive: true })
    fs.writeFileSync(path.join(dir, "records", "Legal", "nda.md"), "x")
    expect(await createDepartment(dir, { ...legal, adopt: true })).toMatchObject({ ok: false, code: "folder-case" })
  })
  it.each([["Finances"], ["Company"], ["Archive"]])("refuses the reserved name %s", async (name) => {
    const { dir } = makeRepo()
    expect(await createDepartment(dir, { ...legal, name })).toMatchObject({ ok: false, code: "invalid" })
  })
  it("refuses a duplicate and leaves the file alone", async () => {
    const { dir, read } = makeRepo()
    await createDepartment(dir, legal)
    const before = read("definitions/departments.yaml")
    expect(await createDepartment(dir, { ...legal, color: "#be123c" })).toMatchObject({ ok: false, code: "exists" })
    expect(read("definitions/departments.yaml")).toBe(before)
  })
  it("a non-Latin name gets the department fallback slug", async () => {
    const { dir } = makeRepo()
    expect(await createDepartment(dir, { ...legal, name: "法務" })).toMatchObject({ ok: true, slug: "department" })
    expect(await createDepartment(dir, { ...legal, name: "経理" })).toMatchObject({ ok: true, slug: "department-2" })
  })
  it("refuses to touch a malformed definitions file", async () => {
    const { dir, read } = makeRepo()
    fs.mkdirSync(path.join(dir, "definitions"))
    fs.writeFileSync(path.join(dir, "definitions", "departments.yaml"), "departments: [\n")
    expect(await createDepartment(dir, legal)).toMatchObject({ ok: false, code: "malformed" })
    expect(read("definitions/departments.yaml")).toBe("departments: [\n")
    expect(fs.existsSync(path.join(dir, "records", "legal"))).toBe(false)
  })
  it("refuses a records folder that is a symlink out of the company", async () => {
    const { dir } = makeRepo()
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), "outside-")); dirs.push(outside)
    fs.mkdirSync(path.join(dir, "records"))
    fs.symlinkSync(outside, path.join(dir, "records", "legal"))
    expect(await createDepartment(dir, { ...legal, adopt: true })).toMatchObject({ ok: false, code: "unsafe" })
    expect(fs.readdirSync(outside)).toEqual([])
  })
  it("refuses when the definitions file has uncommitted changes", async () => {
    const { dir } = makeRepo()
    fs.mkdirSync(path.join(dir, "definitions"))
    fs.writeFileSync(path.join(dir, "definitions", "departments.yaml"), "departments: []\n")
    expect(await createDepartment(dir, legal)).toMatchObject({ ok: false, code: "dirty" })
  })
  it("a failed commit still saved the work and says so, with what to retry", async () => {
    const { dir, git } = makeRepo()
    const failing: Deps = { ...realDeps, exec: (cmd, args) => (args.includes("commit") ? Promise.reject(new Error("hook said no")) : defaultExecFile(cmd, args)) }
    const r = await createDepartment(dir, legal, failing)
    expect(r).toMatchObject({ ok: true, committed: false })
    expect(r.ok && r.commitError).toContain("Saved locally; history update failed")
    expect(fs.existsSync(path.join(dir, "definitions/departments.yaml"))).toBe(true)
    // retry commits without creating anything twice
    expect(await retryCommit(dir, (r as { commitPaths: string[] }).commitPaths, (r as { commitMessage: string }).commitMessage)).toEqual({ ok: true })
    expect(filesIn(git)).toEqual(["definitions/departments.yaml", "records/legal/.gitkeep"])
  })
  it("the same operationId twice creates one department", async () => {
    const { dir } = makeRepo()
    const [a, b] = await Promise.all([
      createDepartment(dir, { ...legal, operationId: "op-1" }),
      createDepartment(dir, { ...legal, operationId: "op-1" }),
    ])
    expect(a).toMatchObject({ ok: true, slug: "legal" })
    expect(b).toMatchObject({ ok: true, slug: "legal" })
    expect((readDefinitions(dir) as { departments: unknown[] }).departments).toHaveLength(1)
  })
  it("two different creates at once both land (the second reads the first's file)", async () => {
    const { dir } = makeRepo()
    const [a, b] = await Promise.all([createDepartment(dir, legal), createDepartment(dir, { ...legal, name: "Support", color: "#be123c" })])
    expect(a.ok && b.ok).toBe(true)
    expect((readDefinitions(dir) as { departments: unknown[] }).departments).toHaveLength(2)
  })
})

describe("createDepartment hardening", () => {
  it("leaves other entries byte-identical even with a long purpose", async () => {
    const { dir, git, read } = makeRepo()
    fs.mkdirSync(path.join(dir, "definitions"))
    const long = "word ".repeat(30).trim()
    const before = `departments:\n  - slug: ops\n    name: Ops\n    purpose: ${long}\n    color: "#0f766e"\n`
    fs.writeFileSync(path.join(dir, "definitions", "departments.yaml"), before)
    git("add", "."); git("commit", "-qm", "defs")
    await createDepartment(dir, legal)
    expect(read("definitions/departments.yaml").startsWith(before.trimEnd())).toBe(true)
  })
  it("refuses a records folder that is a symlink to a directory inside the company", async () => {
    const { dir, exists } = makeRepo()
    fs.mkdirSync(path.join(dir, "records", "real"), { recursive: true })
    fs.symlinkSync(path.join(dir, "records", "real"), path.join(dir, "records", "legal"))
    expect(await createDepartment(dir, legal)).toMatchObject({ ok: false })
    expect(exists("records/real/.gitkeep")).toBe(false)
    expect(exists("definitions/departments.yaml")).toBe(false)
  })
})

describe("retryCommit paths", () => {
  it.each([["records/"], ["records/*"], ["records"], ["../x"], ["/abs"], ["definitions/"]])("refuses %s and commits nothing", async (p) => {
    const { dir, git } = makeRepo()
    fs.mkdirSync(path.join(dir, "records", "funnel"), { recursive: true })
    fs.writeFileSync(path.join(dir, "records", "funnel", "leads.yaml"), "x")
    fs.writeFileSync(path.join(dir, "records", "x.md"), "x")
    const head = git("rev-parse", "HEAD")
    expect(await retryCommit(dir, [p], "m")).toMatchObject({ ok: false, code: "invalid" })
    expect(git("rev-parse", "HEAD")).toBe(head)
  })
})

describe("retryCommit hardening", () => {
  it.each([["records/funnel/leads.yaml"], ["records/comms/x.md"]])("refuses built-in or app-owned slug path %s", async (p) => {
    const { dir, git } = makeRepo()
    fs.mkdirSync(path.join(dir, path.dirname(p)), { recursive: true })
    fs.writeFileSync(path.join(dir, p), "x")
    const head = git("rev-parse", "HEAD")
    expect(await retryCommit(dir, [p], "m")).toMatchObject({ ok: false, code: "invalid" })
    expect(git("rev-parse", "HEAD")).toBe(head)
  })
  it("refuses a file or symlink sitting where a department folder would be", async () => {
    const { dir, git } = makeRepo()
    fs.mkdirSync(path.join(dir, "records"))
    fs.writeFileSync(path.join(dir, "records", "legal"), "x")
    fs.symlinkSync("README.md", path.join(dir, "records", "link"))
    const head = git("rev-parse", "HEAD")
    expect(await retryCommit(dir, ["records/legal"], "m")).toMatchObject({ ok: false, code: "dirty" })
    expect(await retryCommit(dir, ["records/link"], "m")).toMatchObject({ ok: false, code: "dirty" })
    expect(git("rev-parse", "HEAD")).toBe(head)
  })
})

describe("operationId", () => {
  it("a reused id with a different name creates the new department", async () => {
    const { dir } = makeRepo()
    expect(await createDepartment(dir, { ...legal, operationId: "op-x" })).toMatchObject({ ok: true, slug: "legal" })
    expect(await createDepartment(dir, { ...legal, name: "Support", operationId: "op-x" })).toMatchObject({ ok: true, slug: "support" })
  })
})

describe("editDepartment", () => {
  it("changes name, purpose and colour only, keeping the slug and folder", async () => {
    const { dir, read } = makeRepo()
    await createDepartment(dir, legal)
    const rev = (readDefinitions(dir) as { revision: string }).revision
    const r = await editDepartment(dir, { slug: "legal", name: "Legal Affairs", purpose: "Updated.", color: "#be123c", expectedRevision: rev })
    expect(r).toMatchObject({ ok: true, slug: "legal", committed: true })
    expect(read("definitions/departments.yaml")).toContain("name: Legal Affairs")
    expect(fs.existsSync(path.join(dir, "records/legal"))).toBe(true)
  })
  it("refuses a stale revision instead of overwriting someone's change", async () => {
    const { dir, read } = makeRepo()
    await createDepartment(dir, legal)
    const stale = (readDefinitions(dir) as { revision: string }).revision
    fs.appendFileSync(path.join(dir, "definitions/departments.yaml"), "# hand edit\n")
    const before = read("definitions/departments.yaml")
    expect(await editDepartment(dir, { slug: "legal", name: "X", purpose: "p", color: "#be123c", expectedRevision: stale })).toMatchObject({ ok: false, code: "conflict" })
    expect(read("definitions/departments.yaml")).toBe(before)
  })
  it("can't edit a department that isn't defined (built-in or discovered)", async () => {
    const { dir } = makeRepo()
    const rev = (readDefinitions(dir) as { revision: string }).revision
    expect(await editDepartment(dir, { slug: "finances", name: "X", purpose: "p", color: "#be123c", expectedRevision: rev })).toMatchObject({ ok: false, code: "not-found" })
  })
})

describe("addRecord", () => {
  const STAMP = new Date("2026-10-03T09:30:00.000Z")
  const D = new Intl.DateTimeFormat("en-CA").format(STAMP) // filename date is local; compute it so the test is timezone-proof
  const FIXED = { ...realDeps, now: () => STAMP }
  it("stores Markdown with a stable updated stamp and commits only that file", async () => {
    const { dir, git, read } = makeRepo()
    await createDepartment(dir, legal)
    fs.writeFileSync(path.join(dir, "README.md"), "dirty tracked"); fs.writeFileSync(path.join(dir, "stray.txt"), "untracked")
    const r = await addRecord(dir, { slug: "legal", title: "NDA with Acme", body: "Signed 2 Oct.\n<script>x</script>" }, FIXED)
    expect(r).toMatchObject({ ok: true, committed: true, file: `${D}-nda-with-acme.md` })
    const text = read(`records/legal/${D}-nda-with-acme.md`)
    expect(text).toContain("title: NDA with Acme")
    expect(text).toContain("updated: 2026-10-03T09:30:00.000Z")
    expect(text).toContain("<script>x</script>") // stored as data, escaped at render
    expect(filesIn(git)).toEqual([`records/legal/${D}-nda-with-acme.md`])
    expect(git("status", "--porcelain")).toContain("README.md")
    expect(git("status", "--porcelain")).toContain("stray.txt")
  })
  it("never overwrites: a second record with the same title gets a suffix", async () => {
    const { dir, read } = makeRepo()
    await createDepartment(dir, legal)
    await addRecord(dir, { slug: "legal", title: "Same", body: "one" }, FIXED)
    const r = await addRecord(dir, { slug: "legal", title: "Same", body: "two" }, FIXED)
    expect(r).toMatchObject({ ok: true, file: `${D}-same-2.md` })
    expect(read(`records/legal/${D}-same.md`)).toContain("one")
  })
  it("a title can't steer the path", async () => {
    const { dir } = makeRepo()
    await createDepartment(dir, legal)
    const r = await addRecord(dir, { slug: "legal", title: "../../etc/passwd", body: "x" }, FIXED)
    expect(r.ok && r.file).toBe(`${D}-etc-passwd.md`)
  })
  it("rejects empty titles, huge bodies, built-ins, unknown folders, and escaping symlinks", async () => {
    const { dir } = makeRepo()
    await createDepartment(dir, legal)
    expect(await addRecord(dir, { slug: "legal", title: "  ", body: "x" })).toMatchObject({ ok: false, code: "invalid" })
    expect(await addRecord(dir, { slug: "legal", title: "t", body: "x".repeat(20001) })).toMatchObject({ ok: false, code: "invalid" })
    expect(await addRecord(dir, { slug: "finances", title: "t", body: "x" })).toMatchObject({ ok: false, code: "invalid" })
    expect(await addRecord(dir, { slug: "nope", title: "t", body: "x" })).toMatchObject({ ok: false, code: "not-found" })
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), "outside-")); dirs.push(outside)
    fs.mkdirSync(path.join(dir, "records"), { recursive: true })
    fs.symlinkSync(outside, path.join(dir, "records", "evil"))
    expect(await addRecord(dir, { slug: "evil", title: "t", body: "x" })).toMatchObject({ ok: false, code: "unsafe" })
    expect(fs.readdirSync(outside)).toEqual([])
  })
})

describe("addRecord retry", () => {
  const STAMP = new Date("2026-10-03T09:30:00.000Z")
  const D = new Intl.DateTimeFormat("en-CA").format(STAMP)
  it("returns commitPaths that retryCommit accepts", async () => {
    const { dir, git } = makeRepo()
    await createDepartment(dir, legal)
    fs.writeFileSync(path.join(dir, "stray.txt"), "untracked")
    const failing: Deps = { ...realDeps, now: () => STAMP, exec: (cmd, args) => (args.includes("commit") ? Promise.reject(new Error("hook said no")) : defaultExecFile(cmd, args)) }
    const r = await addRecord(dir, { slug: "legal", title: "NDA", body: "x" }, failing)
    expect(r).toMatchObject({ ok: true, committed: false })
    if (!r.ok) throw new Error("unreachable")
    expect(await retryCommit(dir, r.commitPaths, r.commitMessage)).toEqual({ ok: true })
    expect(git("show", "--name-only", "--format=", "HEAD").trim()).toBe(`records/legal/${D}-nda.md`)
    expect(git("status", "--porcelain")).toContain("stray.txt")
  })
})

describe("addRecord app-owned slugs", () => {
  it("refuses workflows and roadmap even when the folder exists", async () => {
    const { dir } = makeRepo()
    for (const slug of ["workflows", "roadmap"]) {
      fs.mkdirSync(path.join(dir, "records", slug), { recursive: true })
      expect(await addRecord(dir, { slug, title: "t", body: "x" })).toMatchObject({ ok: false, code: "invalid" })
      expect(fs.readdirSync(path.join(dir, "records", slug))).toEqual([])
    }
  })
})

async function withDept(extra?: (dir: string) => void) {
  const repo = makeRepo()
  await createDepartment(repo.dir, legal)
  extra?.(repo.dir)
  repo.git("add", "-A"); try { repo.git("commit", "-qm", "records") } catch { /* nothing to commit */ }
  return repo
}
const rev = (dir: string) => (readDefinitions(dir) as { revision: string }).revision

describe("removeDepartment", () => {
  it("an untouched department (only its placeholder) is removed outright", async () => {
    const { dir, git } = await withDept()
    const p = await planRemoval(dir, "legal")
    expect(p).toMatchObject({ ok: true, plan: { kind: "empty" } })
    const r = await removeDepartment(dir, { slug: "legal", expectedRevision: rev(dir), confirm: { kind: "empty" } })
    expect(r).toMatchObject({ ok: true, committed: true })
    expect(fs.existsSync(path.join(dir, "records/legal"))).toBe(false)
    expect((readDefinitions(dir) as { departments: unknown[] }).departments).toEqual([])
    expect(git("status", "--porcelain")).toBe("")
  })
  it("a populated department is archived byte-for-byte, hidden files included", async () => {
    const { dir, git, read } = await withDept((d) => {
      fs.writeFileSync(path.join(d, "records/legal/nda.md"), "terms")
      fs.writeFileSync(path.join(d, "records/legal/.private"), "hidden")
      fs.mkdirSync(path.join(d, "records/legal/sub")); fs.writeFileSync(path.join(d, "records/legal/sub/x.md"), "deep")
    })
    const p = await planRemoval(dir, "legal")
    expect(p).toMatchObject({ ok: true, plan: { kind: "populated", fileCount: 3, archiveTarget: "records/.archive/legal" } })
    const r = await removeDepartment(dir, { slug: "legal", expectedRevision: rev(dir), confirm: (p as unknown as { plan: never }).plan })
    expect(r).toMatchObject({ ok: true, committed: true })
    expect(read("records/.archive/legal/nda.md")).toBe("terms")
    expect(read("records/.archive/legal/.private")).toBe("hidden")
    expect(read("records/.archive/legal/sub/x.md")).toBe("deep")
    expect(fs.existsSync(path.join(dir, "records/legal"))).toBe(false)
    expect(git("status", "--porcelain")).toBe("")
  })
  it("a folder with a display count of 0 but a hidden file is populated, not empty", async () => {
    const { dir } = await withDept((d) => fs.writeFileSync(path.join(d, "records/legal/.only-hidden"), "x"))
    expect(await planRemoval(dir, "legal")).toMatchObject({ plan: { kind: "populated" } })
  })
  it("never overwrites an existing archive: picks the next free name and shows it", async () => {
    const { dir, read } = await withDept((d) => {
      fs.writeFileSync(path.join(d, "records/legal/a.md"), "new")
      fs.mkdirSync(path.join(d, "records/.archive/legal"), { recursive: true })
      fs.writeFileSync(path.join(d, "records/.archive/legal/old.md"), "old")
    })
    const p = await planRemoval(dir, "legal")
    expect(p).toMatchObject({ plan: { archiveTarget: "records/.archive/legal-2" } })
    await removeDepartment(dir, { slug: "legal", expectedRevision: rev(dir), confirm: (p as unknown as { plan: never }).plan })
    expect(read("records/.archive/legal/old.md")).toBe("old")
    expect(read("records/.archive/legal-2/a.md")).toBe("new")
  })
  it("refuses when what was confirmed is no longer what is on disk (stale)", async () => {
    const { dir } = await withDept()
    const p = (await planRemoval(dir, "legal")) as unknown as { plan: never }
    fs.writeFileSync(path.join(dir, "records/legal/late.md"), "added after the dialog opened")
    expect(await removeDepartment(dir, { slug: "legal", expectedRevision: rev(dir), confirm: p.plan })).toMatchObject({ ok: false, code: "stale" })
    expect(fs.existsSync(path.join(dir, "records/legal/late.md"))).toBe(true)
  })
  it("refuses when the folder has uncommitted edits", async () => {
    const { dir } = await withDept((d) => fs.writeFileSync(path.join(d, "records/legal/a.md"), "committed"))
    fs.writeFileSync(path.join(dir, "records/legal/a.md"), "edited, not committed")
    const p = (await planRemoval(dir, "legal")) as unknown as { plan: never }
    expect(await removeDepartment(dir, { slug: "legal", expectedRevision: rev(dir), confirm: p.plan })).toMatchObject({ ok: false, code: "dirty" })
    expect(fs.readFileSync(path.join(dir, "records/legal/a.md"), "utf8")).toBe("edited, not committed")
  })
  it("if saving the definitions fails after the move, the folder is put back and nothing is lost", async () => {
    const { dir, read } = await withDept((d) => fs.writeFileSync(path.join(d, "records/legal/a.md"), "keep me"))
    const p = (await planRemoval(dir, "legal")) as unknown as { plan: never }
    let calls = 0
    const flaky: Deps = { ...realDeps, rename: async (a, b) => { if (++calls === 2) throw new Error("disk full"); return realDeps.rename(a, b) } }
    const r = await removeDepartment(dir, { slug: "legal", expectedRevision: rev(dir), confirm: p.plan }, flaky)
    expect(r).toMatchObject({ ok: false, code: "failed" })
    expect(read("records/legal/a.md")).toBe("keep me")
    expect(fs.existsSync(path.join(dir, "records/.archive/legal"))).toBe(false)
    expect((readDefinitions(dir) as { departments: unknown[] }).departments).toHaveLength(1)
  })
  it("a stale definitions revision is a conflict", async () => {
    const { dir } = await withDept()
    const p = (await planRemoval(dir, "legal")) as unknown as { plan: never }
    expect(await removeDepartment(dir, { slug: "legal", expectedRevision: "old", confirm: p.plan })).toMatchObject({ ok: false, code: "conflict" })
  })
  it("can't remove a built-in or an undefined department", async () => {
    const { dir } = makeRepo()
    expect(await planRemoval(dir, "finances")).toMatchObject({ ok: false, code: "not-found" })
  })
  it("refuses when records/.archive is a symlink out of the company; nothing moves", async () => {
    const { dir } = await withDept((d) => fs.writeFileSync(path.join(d, "records/legal/a.md"), "keep"))
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), "outside-")); dirs.push(outside)
    fs.symlinkSync(outside, path.join(dir, "records/.archive"))
    const before = fs.readFileSync(path.join(dir, "definitions/departments.yaml"), "utf8")
    const p = await planRemoval(dir, "legal")
    expect(p).toMatchObject({ ok: false, code: "unsafe" })
    const r = await removeDepartment(dir, { slug: "legal", expectedRevision: rev(dir), confirm: { kind: "populated", fileCount: 1, archiveTarget: "records/.archive/legal" } })
    expect(r).toMatchObject({ ok: false, code: "unsafe" })
    expect(fs.readdirSync(outside)).toEqual([])
    expect(fs.readFileSync(path.join(dir, "records/legal/a.md"), "utf8")).toBe("keep")
    expect(fs.readFileSync(path.join(dir, "definitions/departments.yaml"), "utf8")).toBe(before)
  })
  it("a failed commit after populated removal returns paths retryCommit accepts", async () => {
    const { dir, git } = await withDept((d) => fs.writeFileSync(path.join(d, "records/legal/a.md"), "x"))
    const p = (await planRemoval(dir, "legal")) as unknown as { plan: never }
    const failing: Deps = { ...realDeps, exec: (cmd, args) => (args.includes("commit") ? Promise.reject(new Error("hook said no")) : defaultExecFile(cmd, args)) }
    const r = await removeDepartment(dir, { slug: "legal", expectedRevision: rev(dir), confirm: p.plan }, failing)
    expect(r).toMatchObject({ ok: true, committed: false })
    if (!r.ok) throw new Error("unreachable")
    expect(await retryCommit(dir, r.commitPaths, r.commitMessage)).toEqual({ ok: true })
    expect(git("status", "--porcelain")).toBe("")
  })
})

describe("removeDepartment hardening", () => {
  const failCommit: Deps = { ...realDeps, exec: (cmd, args) => (args.includes("commit") ? Promise.reject(new Error("hook said no")) : defaultExecFile(cmd, args)) }
  const plan = async (dir: string) => ((await planRemoval(dir, "legal")) as unknown as { plan: never }).plan
  it("a retry refuses when new work appeared in the removed folder, and does not commit it", async () => {
    const { dir, git } = await withDept((d) => fs.writeFileSync(path.join(d, "records/legal/a.md"), "x"))
    const r = await removeDepartment(dir, { slug: "legal", expectedRevision: rev(dir), confirm: await plan(dir) }, failCommit)
    if (!r.ok) throw new Error("unreachable")
    fs.mkdirSync(path.join(dir, "records/legal")); fs.writeFileSync(path.join(dir, "records/legal/new.md"), "fresh")
    expect(await retryCommit(dir, r.commitPaths, r.commitMessage)).toMatchObject({ ok: false, code: "dirty" })
    expect(git("ls-tree", "-r", "--name-only", "HEAD")).not.toContain("new.md")
    expect(git("status", "--porcelain", "--untracked-files=all")).toContain("new.md")
  })
  it("a retry of an empty-department removal succeeds and leaves a clean tree", async () => {
    const { dir, git } = await withDept()
    const r = await removeDepartment(dir, { slug: "legal", expectedRevision: rev(dir), confirm: { kind: "empty" } }, failCommit)
    expect(r).toMatchObject({ ok: true, committed: false })
    if (!r.ok) throw new Error("unreachable")
    expect(await retryCommit(dir, r.commitPaths, r.commitMessage)).toEqual({ ok: true })
    expect(git("status", "--porcelain")).toBe("")
  })
  it("the .gitkeep placeholder is not counted: one record is one file", async () => {
    const { dir } = await withDept((d) => fs.writeFileSync(path.join(d, "records/legal/nda.md"), "terms"))
    expect(await planRemoval(dir, "legal")).toMatchObject({ ok: true, plan: { kind: "populated", fileCount: 1 } })
  })
  it("inspecting never follows a symlink: a link to an outside folder counts as one entry", async () => {
    const { dir } = await withDept()
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), "outside-")); dirs.push(outside)
    for (const n of ["1", "2", "3"]) fs.writeFileSync(path.join(outside, n), n)
    fs.symlinkSync(outside, path.join(dir, "records/legal/x"))
    expect(await planRemoval(dir, "legal")).toMatchObject({ ok: true, plan: { kind: "populated", fileCount: 1 } }) // the link; .gitkeep is not counted
  })
  it("a symlink loop does not hang", async () => {
    const { dir } = await withDept()
    fs.symlinkSync(".", path.join(dir, "records/legal/loop"))
    expect(await planRemoval(dir, "legal")).toMatchObject({ ok: true, plan: { kind: "populated", fileCount: 1 } })
  })
  it("a .gitkeep that is a symlink or a directory is populated", async () => {
    const a = await withDept()
    fs.rmSync(path.join(a.dir, "records/legal/.gitkeep")); fs.symlinkSync("README.md", path.join(a.dir, "records/legal/.gitkeep"))
    expect(await planRemoval(a.dir, "legal")).toMatchObject({ plan: { kind: "populated" } })
    const b = await withDept()
    fs.rmSync(path.join(b.dir, "records/legal/.gitkeep")); fs.mkdirSync(path.join(b.dir, "records/legal/.gitkeep"))
    expect(await planRemoval(b.dir, "legal")).toMatchObject({ plan: { kind: "populated" } })
  })
  it("a department folder that is itself a symlink is populated with one entry", async () => {
    const { dir } = await withDept()
    fs.rmSync(path.join(dir, "records/legal"), { recursive: true })
    fs.mkdirSync(path.join(dir, "elsewhere")); fs.writeFileSync(path.join(dir, "elsewhere/f.md"), "f")
    fs.symlinkSync(path.join(dir, "elsewhere"), path.join(dir, "records/legal"))
    expect(await planRemoval(dir, "legal")).toMatchObject({ ok: true, plan: { kind: "populated", fileCount: 1 } })
  })
  it("a file appearing during an empty removal is stale: placeholder restored, definition kept", async () => {
    const { dir } = await withDept()
    const exec: Deps["exec"] = async (cmd, args) => {
      const out = await defaultExecFile(cmd, args)
      if (args.includes("status")) fs.writeFileSync(path.join(dir, "records/legal/late.md"), "late")
      return out
    }
    const r = await removeDepartment(dir, { slug: "legal", expectedRevision: rev(dir), confirm: { kind: "empty" } }, { ...realDeps, exec })
    expect(r).toMatchObject({ ok: false, code: "stale" })
    expect(fs.existsSync(path.join(dir, "records/legal/late.md"))).toBe(true)
    expect(fs.existsSync(path.join(dir, "records/legal/.gitkeep"))).toBe(true)
    expect((readDefinitions(dir) as { departments: unknown[] }).departments).toHaveLength(1)
  })
  it("empty-branch rollback: a failed definitions save restores the folder and placeholder", async () => {
    const { dir } = await withDept()
    const flaky: Deps = { ...realDeps, rename: async () => { throw new Error("disk full") } }
    const r = await removeDepartment(dir, { slug: "legal", expectedRevision: rev(dir), confirm: { kind: "empty" } }, flaky)
    expect(r).toMatchObject({ ok: false, code: "failed" })
    expect(fs.existsSync(path.join(dir, "records/legal/.gitkeep"))).toBe(true)
    expect((readDefinitions(dir) as { departments: unknown[] }).departments).toHaveLength(1)
  })
  it("if the move back also fails, the error says where the records are", async () => {
    const { dir } = await withDept((d) => fs.writeFileSync(path.join(d, "records/legal/a.md"), "keep"))
    let calls = 0
    const bad: Deps = { ...realDeps, rename: async (a, b) => { if (++calls >= 2) throw new Error("nope"); return realDeps.rename(a, b) } }
    const r = await removeDepartment(dir, { slug: "legal", expectedRevision: rev(dir), confirm: await plan(dir) }, bad)
    expect(r).toMatchObject({ ok: false, code: "failed" })
    expect(!r.ok && r.error).toContain("records/.archive/legal")
    expect(fs.readFileSync(path.join(dir, "records/.archive/legal/a.md"), "utf8")).toBe("keep")
  })
})

describe("department changes keep the operating guide fresh", () => {
  const AGREEMENT = "# Working agreement\n\nOwner rules.\n"
  async function guided() {
    const repo = makeRepo()
    fs.writeFileSync(path.join(repo.dir, "AGENTS.md"), AGREEMENT)
    repo.git("add", "."); repo.git("commit", "-qm", "agreement")
    await addGuide(repo.dir, { exec: defaultExecFile })
    repo.git("add", "."); repo.git("commit", "-qm", "guide")
    return repo
  }
  it("create rewrites the block and puts AGENTS.md in the same commit", async () => {
    const { dir, git, read } = await guided()
    const r = await createDepartment(dir, legal)
    expect(r).toMatchObject({ ok: true, committed: true, guide: { status: "updated" } })
    expect(filesIn(git)).toEqual(["AGENTS.md", "definitions/departments.yaml", "records/legal/.gitkeep"])
    expect(read("AGENTS.md").startsWith(AGREEMENT)).toBe(true)
    expect(read("AGENTS.md")).toContain("- Legal: Contracts and compliance. (records/legal/)")
  })
  it("edit updates the line and remove drops it, each in its own single commit", async () => {
    const { dir, git, read } = await guided()
    await createDepartment(dir, legal)
    const rev = (readDefinitions(dir) as { revision: string }).revision
    await editDepartment(dir, { slug: "legal", name: "Legal Affairs", purpose: "Updated.", color: "#be123c", expectedRevision: rev })
    expect(filesIn(git)).toEqual(["AGENTS.md", "definitions/departments.yaml"])
    expect(read("AGENTS.md")).toContain("- Legal Affairs: Updated. (records/legal/)")
    const plan = (await planRemoval(dir, "legal")) as unknown as { plan: never; revision: string }
    await removeDepartment(dir, { slug: "legal", expectedRevision: plan.revision, confirm: plan.plan })
    expect(filesIn(git)).toContain("AGENTS.md")
    expect(read("AGENTS.md")).not.toContain("Legal Affairs")
  })
  it("a company with no block is untouched: AGENTS.md is not in the commit and not changed", async () => {
    const { dir, git, read } = makeRepo()
    fs.writeFileSync(path.join(dir, "AGENTS.md"), AGREEMENT); git("add", "."); git("commit", "-qm", "agreement")
    const r = await createDepartment(dir, legal)
    expect(r).toMatchObject({ ok: true, committed: true, guide: { status: "absent" } })
    expect(filesIn(git)).toEqual(["definitions/departments.yaml", "records/legal/.gitkeep"])
    expect(read("AGENTS.md")).toBe(AGREEMENT)
  })
  it("a hand-edited block never blocks the department and is left byte-for-byte", async () => {
    const { dir, git, read } = await guided()
    fs.writeFileSync(path.join(dir, "AGENTS.md"), read("AGENTS.md").replace("Read the company's", "Read my"))
    git("add", "."); git("commit", "-qm", "owner edit")
    const before = read("AGENTS.md")
    const r = await createDepartment(dir, legal)
    expect(r).toMatchObject({ ok: true, committed: true, guide: { status: "needs-attention", reason: "edited" } })
    expect(filesIn(git)).toEqual(["definitions/departments.yaml", "records/legal/.gitkeep"])
    expect(read("AGENTS.md")).toBe(before)
  })
  it("uncommitted owner edits to AGENTS.md are neither rewritten nor swept into the commit", async () => {
    const { dir, git, read } = await guided()
    fs.writeFileSync(path.join(dir, "AGENTS.md"), read("AGENTS.md") + "\nowner scribble\n")
    const r = await createDepartment(dir, legal)
    expect(r).toMatchObject({ ok: true, committed: true, guide: { status: "needs-attention", reason: "dirty" } })
    expect(filesIn(git)).not.toContain("AGENTS.md")
    expect(git("status", "--porcelain")).toContain("AGENTS.md")
  })
  it("when the combined commit fails, the retry can commit AGENTS.md too", async () => {
    const { dir, git } = await guided()
    const failing: Deps = { ...realDeps, exec: (cmd, args) => (args.includes("commit") ? Promise.reject(new Error("hook said no")) : defaultExecFile(cmd, args)) }
    const r = await createDepartment(dir, legal, failing)
    expect(r).toMatchObject({ ok: true, committed: false })
    const saved = r as { commitPaths: string[]; commitMessage: string }
    expect(saved.commitPaths).toContain("AGENTS.md")
    expect(await retryCommit(dir, saved.commitPaths, saved.commitMessage)).toEqual({ ok: true })
    expect(filesIn(git)).toEqual(["AGENTS.md", "definitions/departments.yaml", "records/legal/.gitkeep"])
  })
  it("retryCommit still refuses other root files", async () => {
    const { dir } = makeRepo()
    for (const p of ["README.md", "agents.md", "AGENTS.md/", "./AGENTS.md", "AGENTS.md "]) {
      expect(await retryCommit(dir, [p], "m")).toMatchObject({ ok: false, code: "invalid" })
    }
  })
})
