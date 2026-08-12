import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdtemp, mkdir, writeFile, rm, readFile, stat } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { createCompanyFromTemplateImpl } from "./create-company-from-template-impl"

let templateSourceDir: string
let targetParentDir: string
let registryDir: string
let registryPath: string
let execCalls: { command: string; args: string[] }[]

async function fakeExecFn(command: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  execCalls.push({ command, args })
  if (args.includes("init")) {
    const dashCIndex = args.indexOf("-C")
    await mkdir(path.join(args[dashCIndex + 1], ".git"), { recursive: true })
  }
  return { stdout: "", stderr: "" }
}

beforeEach(async () => {
  templateSourceDir = await mkdtemp(path.join(tmpdir(), "template-source-"))
  targetParentDir = await mkdtemp(path.join(tmpdir(), "template-target-parent-"))
  registryDir = await mkdtemp(path.join(tmpdir(), "template-registry-"))
  registryPath = path.join(registryDir, "companies.json")
  execCalls = []

  await mkdir(path.join(templateSourceDir, ".claude", "commands"), { recursive: true })
  await writeFile(path.join(templateSourceDir, ".claude", "commands", "decision.md"), "# /decision\n")
  await writeFile(path.join(templateSourceDir, ".claude", "commands", ".DS_Store"), "junk")
  await writeFile(path.join(templateSourceDir, ".gitignore"), "secrets/\n")
  await writeFile(path.join(templateSourceDir, "README.md"), "# Starter\n")
  await mkdir(path.join(templateSourceDir, "examples"), { recursive: true })
  await writeFile(path.join(templateSourceDir, "examples", "demo.md"), "should never be copied")
})

afterEach(async () => {
  await rm(templateSourceDir, { recursive: true, force: true })
  await rm(targetParentDir, { recursive: true, force: true })
  await rm(registryDir, { recursive: true, force: true })
})

describe("createCompanyFromTemplateImpl", () => {
  it("copies manifest entries, excludes .DS_Store, and never copies non-manifest paths", async () => {
    const target = path.join(targetParentDir, "new-co")
    const result = await createCompanyFromTemplateImpl(
      "New Co",
      target,
      templateSourceDir,
      undefined,
      registryPath,
      fakeExecFn
    )

    expect(result.ok).toBe(true)
    expect(await readFile(path.join(target, ".claude", "commands", "decision.md"), "utf-8")).toBe("# /decision\n")
    expect(await readFile(path.join(target, ".gitignore"), "utf-8")).toBe("secrets/\n")
    expect(await readFile(path.join(target, "README.md"), "utf-8")).toBe("# Starter\n")
    await expect(stat(path.join(target, ".claude", "commands", ".DS_Store"))).rejects.toThrow()
    await expect(stat(path.join(target, "examples"))).rejects.toThrow()
  })

  it("writes a fresh HANDOFF.md rather than copying one from the source", async () => {
    const target = path.join(targetParentDir, "new-co-2")
    await createCompanyFromTemplateImpl("New Co 2", target, templateSourceDir, undefined, registryPath, fakeExecFn)
    const handoff = await readFile(path.join(target, "HANDOFF.md"), "utf-8")
    expect(handoff).toContain("New here?")
  })

  it("runs git init, add, and commit via the injected exec function, scoped to the new directory", async () => {
    const target = path.join(targetParentDir, "new-co-3")
    await createCompanyFromTemplateImpl("New Co 3", target, templateSourceDir, undefined, registryPath, fakeExecFn)
    expect(execCalls).toEqual([
      { command: "git", args: ["-C", target, "init"] },
      { command: "git", args: ["-C", target, "add", "-A"] },
      {
        command: "git",
        args: ["-C", target, "commit", "-m", "Initial commit from company starter template"],
      },
    ])
  })

  it("registers the new company after scaffolding it", async () => {
    const target = path.join(targetParentDir, "new-co-4")
    const result = await createCompanyFromTemplateImpl(
      "New Co 4",
      target,
      templateSourceDir,
      undefined,
      registryPath,
      fakeExecFn
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.company.name).toBe("New Co 4")
    expect(result.company.rootPath).toBe(target)
  })

  it("fails cleanly without touching disk if the target path already exists", async () => {
    const target = path.join(targetParentDir, "already-exists")
    await mkdir(target)
    const result = await createCompanyFromTemplateImpl(
      "Dup",
      target,
      templateSourceDir,
      undefined,
      registryPath,
      fakeExecFn
    )
    expect(result.ok).toBe(false)
    expect(execCalls).toEqual([])
  })

  // Was "fails cleanly if the parent directory doesn't exist either" — that
  // behavior was the bug. The default suggested path is ~/Alacran/<company>
  // and ~/Alacran doesn't exist until the first company is created, so
  // refusing a missing intermediate directory broke creation for every new
  // user. mkdir -p handles it.
  it("creates missing intermediate directories rather than refusing", async () => {
    const target = path.join(targetParentDir, "missing-parent", "new-co")
    const result = await createCompanyFromTemplateImpl(
      "Nested Co",
      target,
      templateSourceDir,
      undefined,
      registryPath,
      fakeExecFn
    )
    expect(result.ok).toBe(true)
    expect((await stat(target)).isDirectory()).toBe(true)
  })

  it("refuses when an ancestor exists but is a file, since mkdir -p can't nest under it", async () => {
    const filePath = path.join(targetParentDir, "a-file")
    await writeFile(filePath, "not a directory", "utf-8")
    const result = await createCompanyFromTemplateImpl(
      "Blocked Co",
      path.join(filePath, "new-co"),
      templateSourceDir,
      undefined,
      registryPath,
      fakeExecFn
    )
    expect(result.ok).toBe(false)
    expect(execCalls).toEqual([])
  })

  describe("with a starter pack", () => {
    let packSourceDir: string

    beforeEach(async () => {
      packSourceDir = await mkdtemp(path.join(tmpdir(), "template-pack-"))
      // A pack only ever adds files inside directories the base manifest
      // already creates (definitions/ontology/) or a brand-new command file
      // — never a path outside the base skeleton's own shape.
      await mkdir(path.join(packSourceDir, "definitions", "ontology"), { recursive: true })
      await writeFile(
        path.join(packSourceDir, "definitions", "ontology", "company.yaml"),
        "version: 1\ncustomer: {}\n"
      )
      await mkdir(path.join(packSourceDir, ".claude", "commands"), { recursive: true })
      await writeFile(path.join(packSourceDir, ".claude", "commands", "code-review.md"), "# /code-review\n")
    })

    afterEach(async () => {
      await rm(packSourceDir, { recursive: true, force: true })
    })

    it("overlays the pack's files on top of the base skeleton", async () => {
      const target = path.join(targetParentDir, "packed-co")
      const result = await createCompanyFromTemplateImpl(
        "Packed Co",
        target,
        templateSourceDir,
        packSourceDir,
        registryPath,
        fakeExecFn
      )
      expect(result.ok).toBe(true)
      expect(await readFile(path.join(target, "definitions", "ontology", "company.yaml"), "utf-8")).toContain(
        "customer:"
      )
      expect(await readFile(path.join(target, ".claude", "commands", "code-review.md"), "utf-8")).toBe(
        "# /code-review\n"
      )
      // The base skeleton's own files must still be there too — a pack adds, it never replaces.
      expect(await readFile(path.join(target, ".claude", "commands", "decision.md"), "utf-8")).toBe("# /decision\n")
      expect(await readFile(path.join(target, "README.md"), "utf-8")).toBe("# Starter\n")
    })

    it("scaffolds identically to the base template when no pack is given", async () => {
      const target = path.join(targetParentDir, "unpacked-co")
      const result = await createCompanyFromTemplateImpl(
        "Unpacked Co",
        target,
        templateSourceDir,
        undefined,
        registryPath,
        fakeExecFn
      )
      expect(result.ok).toBe(true)
      await expect(stat(path.join(target, "definitions", "ontology", "company.yaml"))).rejects.toThrow()
    })

    it("does not fail when the pack path does not exist", async () => {
      const target = path.join(targetParentDir, "missing-pack-co")
      const result = await createCompanyFromTemplateImpl(
        "Missing Pack Co",
        target,
        templateSourceDir,
        path.join(packSourceDir, "nonexistent"),
        registryPath,
        fakeExecFn
      )
      expect(result.ok).toBe(true)
    })
  })

  // Every test above scaffolds from a synthetic source dir, which can't catch a
  // manifest entry drifting away from what templates/company-starter really
  // contains, or a shipped doc describing a file the company doesn't get. This
  // one scaffolds from the REAL bundled template into a disposable /tmp dir.
  describe("against the real bundled template", () => {
    it("ships no .github, and no shipped doc claims otherwise", async () => {
      const target = path.join(targetParentDir, "real-template-co")
      const result = await createCompanyFromTemplateImpl(
        "Real Template Co",
        target,
        path.join(process.cwd(), "templates", "company-starter"),
        undefined,
        registryPath,
        fakeExecFn
      )
      expect(result.ok).toBe(true)

      // .github/workflows needs gh's `workflow` OAuth scope just to be pushed,
      // which breaks the company's first backup (v55/v56); the rest of .github
      // had nothing left to ship once v37 deleted the issue templates.
      await expect(stat(path.join(target, ".github"))).rejects.toThrow()

      // The docs are copied too, so a stale reference is a doc that lies to
      // every new company — the exact defect this pairs with.
      const docs = ["README.md", "CLAUDE.md"]
      for (const doc of docs) {
        const body = await readFile(path.join(target, doc), "utf-8")
        expect(body, `${doc} describes a .github/ path this company doesn't have`).not.toContain(".github/")
      }
    })
  })
})
