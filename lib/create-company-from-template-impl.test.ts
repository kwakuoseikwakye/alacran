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
    const result = await createCompanyFromTemplateImpl("New Co", target, templateSourceDir, registryPath, fakeExecFn)

    expect(result.ok).toBe(true)
    expect(await readFile(path.join(target, ".claude", "commands", "decision.md"), "utf-8")).toBe("# /decision\n")
    expect(await readFile(path.join(target, ".gitignore"), "utf-8")).toBe("secrets/\n")
    expect(await readFile(path.join(target, "README.md"), "utf-8")).toBe("# Starter\n")
    await expect(stat(path.join(target, ".claude", "commands", ".DS_Store"))).rejects.toThrow()
    await expect(stat(path.join(target, "examples"))).rejects.toThrow()
  })

  it("writes a fresh HANDOFF.md rather than copying one from the source", async () => {
    const target = path.join(targetParentDir, "new-co-2")
    await createCompanyFromTemplateImpl("New Co 2", target, templateSourceDir, registryPath, fakeExecFn)
    const handoff = await readFile(path.join(target, "HANDOFF.md"), "utf-8")
    expect(handoff).toContain("はじめての方へ")
  })

  it("runs git init, add, and commit via the injected exec function, scoped to the new directory", async () => {
    const target = path.join(targetParentDir, "new-co-3")
    await createCompanyFromTemplateImpl("New Co 3", target, templateSourceDir, registryPath, fakeExecFn)
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
    const result = await createCompanyFromTemplateImpl("New Co 4", target, templateSourceDir, registryPath, fakeExecFn)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.company.name).toBe("New Co 4")
    expect(result.company.rootPath).toBe(target)
  })

  it("fails cleanly without touching disk if the target path already exists", async () => {
    const target = path.join(targetParentDir, "already-exists")
    await mkdir(target)
    const result = await createCompanyFromTemplateImpl("Dup", target, templateSourceDir, registryPath, fakeExecFn)
    expect(result.ok).toBe(false)
    expect(execCalls).toEqual([])
  })

  it("fails cleanly if the parent directory doesn't exist either", async () => {
    const target = path.join(targetParentDir, "missing-parent", "new-co")
    const result = await createCompanyFromTemplateImpl("Dup2", target, templateSourceDir, registryPath, fakeExecFn)
    expect(result.ok).toBe(false)
    expect(execCalls).toEqual([])
  })
})
