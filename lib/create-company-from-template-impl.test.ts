import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdtemp, mkdir, writeFile, rm, readFile, readdir, stat } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { createCompanyFromTemplateImpl } from "./create-company-from-template-impl"
import { COMPANY_STARTER_PACKS } from "./company-starter-packs"
import { needsPortableSkills } from "./portable-skills"
import { isPackInstalled, VENDORED_SKILL_PACKS } from "./vendored-skills"

let templateSourceDir: string
let targetParentDir: string
let registryDir: string
let registryPath: string
let claudeConfigDir: string
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
  // The scaffold marks the new company trusted in Claude Code's own config,
  // which defaults to the REAL ~/.claude.json — the developer's whole Claude
  // Code state. Point it somewhere disposable so the suite can never write
  // there (same trap as v75, except this one writes rather than reads).
  claudeConfigDir = await mkdtemp(path.join(tmpdir(), "template-claude-config-"))
  process.env.CLAUDE_CONFIG_DIR = claudeConfigDir

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
  await rm(claudeConfigDir, { recursive: true, force: true })
  delete process.env.CLAUDE_CONFIG_DIR
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
    // Commands land in the folder every agent reads (the template source stays flat; the scaffold moves it).
    expect(await readFile(path.join(target, ".agents", "skills", "decision", "SKILL.md"), "utf-8")).toContain("# /decision\n")
    expect(await readFile(path.join(target, ".gitignore"), "utf-8")).toBe("secrets/\n")
    expect(await readFile(path.join(target, "README.md"), "utf-8")).toBe("# Starter\n")
    await expect(stat(path.join(target, ".claude", "commands", ".DS_Store"))).rejects.toThrow()
    await expect(stat(path.join(target, "examples"))).rejects.toThrow()
  })

  it("starts portable: shared skills, generated Claude Code and Kiro copies, no flat commands folder", async () => {
    const target = path.join(targetParentDir, "portable-co")
    const result = await createCompanyFromTemplateImpl("Portable Co", target, templateSourceDir, undefined, registryPath, fakeExecFn)
    expect(result.ok).toBe(true)
    const shared = await readFile(path.join(target, ".agents", "skills", "decision", "SKILL.md"), "utf-8")
    expect(shared).toMatch(/^---\nname: decision\n/)
    for (const mirror of [".claude", ".kiro"]) {
      expect(await readFile(path.join(target, mirror, "skills", "decision", "SKILL.md"), "utf-8")).toContain("generated from .agents/skills/decision")
    }
    expect(JSON.parse(await readFile(path.join(target, ".agents", "mirror.json"), "utf-8")).skills.decision).toBeDefined()
    await expect(stat(path.join(target, ".claude", "commands"))).rejects.toThrow()
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
      expect(await readFile(path.join(target, ".agents", "skills", "code-review", "SKILL.md"), "utf-8")).toContain(
        "# /code-review\n"
      )
      // The base skeleton's own files must still be there too — a pack adds, it never replaces.
      expect(await readFile(path.join(target, ".agents", "skills", "decision", "SKILL.md"), "utf-8")).toContain("# /decision\n")
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
      const docs = ["README.md", "AGENTS.md", "CLAUDE.md"]
      for (const doc of docs) {
        const body = await readFile(path.join(target, doc), "utf-8")
        expect(body, `${doc} describes a .github/ path this company doesn't have`).not.toContain(".github/")
      }
    })

    // Every shipped pack, scaffolded for real: its commands arrive portable, and what the app owns
    // (the stamped pack skills) is exactly where update, ownership and the stamp expect it.
    const templates = path.join(process.cwd(), "templates")
    const commandsIn = async (dir: string) => (await readdir(dir).catch(() => [] as string[])).filter((n) => n.endsWith(".md"))
    for (const pack of [null, ...COMPANY_STARTER_PACKS.map((p) => p.dirName).filter((d): d is string => d !== null)]) {
      it(`starts portable for the ${pack ?? "general"} starter`, async () => {
        const target = path.join(targetParentDir, `real-${pack ?? "general"}`)
        const packDir = pack ? path.join(templates, "packs", pack) : undefined
        const result = await createCompanyFromTemplateImpl("Real", target, path.join(templates, "company-starter"), packDir, registryPath, fakeExecFn)
        expect(result.ok).toBe(true)

        // Commands (flat in the template) and the pack's own skills (already shared in the pack) both end up shared.
        const packSkills = packDir ? await readdir(path.join(packDir, ".agents", "skills")).catch(() => [] as string[]) : []
        const wanted = [
          ...(await commandsIn(path.join(templates, "company-starter", ".claude", "commands"))),
          ...(packDir ? await commandsIn(path.join(packDir, ".claude", "commands")) : []),
        ].map((n) => n.slice(0, -3)).concat(packSkills).sort()
        const shared = (await readdir(path.join(target, ".agents", "skills"))).sort()
        expect(shared).toEqual(wanted)
        for (const name of wanted) {
          for (const dir of [".agents", ".claude", ".kiro"]) await stat(path.join(target, dir, "skills", name, "SKILL.md"))
        }
        await expect(stat(path.join(target, ".claude", "commands"))).rejects.toThrow()

        expect(await needsPortableSkills(target, path.join(templates, "packs"))).toBe(false)
        if (pack && VENDORED_SKILL_PACKS.some((v) => v.packDirName === pack)) {
          // The pack's stamp lands outside every skills folder, nothing loose sits beside the skills,
          // and the pack is still recognised.
          await stat(path.join(target, ".agents", "vendored", `UPSTREAM-${pack}.md`))
          const loose = (await readdir(path.join(target, ".agents", "skills"), { withFileTypes: true })).filter((e) => !e.isDirectory())
          expect(loose).toEqual([])
          expect(await isPackInstalled(target, pack, path.join(templates, "packs"))).toBe(true)
          const { getVendoredSkillsUpdate } = await import("./vendored-skills")
          // Fresh and already moved: nothing to update.
          expect(await getVendoredSkillsUpdate(target, path.join(templates, "packs"))).toBeNull()
        }
      })
    }
  })
})

it("refuses, loudly, when the bundled template is missing from the install", async () => {
  // The v0.19.0-v0.22.0 packaging break put templates/ one level too deep, so
  // this source path did not exist. copyManifestEntry skips missing entries, so
  // every scaffold "succeeded" and produced a company with no skeleton at all.
  const target = path.join(targetParentDir, "new-co")
  const result = await createCompanyFromTemplateImpl(
    "New Co",
    target,
    path.join(targetParentDir, "does-not-exist"),
    undefined,
    registryPath
  )

  expect(result.ok).toBe(false)
  if (!result.ok) expect(result.message).toContain("bundled company template is missing")
})

it("still scaffolds on a machine with no git identity configured", async () => {
  // The exact reported failure, from a fresh Ubuntu 24.04 install:
  // "Failed to scaffold company: ... Author identity unknown ... unable to
  // auto-detect email address (got 'parallels@ubuntu-linux-2404.(none)')".
  // git refuses to commit at all, the scaffold threw, and a new user could not
  // create their first company — the very first thing this app asks them to do.
  const target = path.join(targetParentDir, "no-git-identity")
  const noIdentityExec = async (command: string, args: string[]) => {
    execCalls.push({ command, args })
    if (args.includes("init")) {
      await mkdir(path.join(args[args.indexOf("-C") + 1], ".git"), { recursive: true })
    }
    // Nothing on this machine can answer "who is the author?"
    if (args.includes("var")) throw new Error("fatal: unable to auto-detect email address")
    if (args.includes("commit") && !args.includes("-c")) {
      throw new Error("Author identity unknown\n\n*** Please tell me who you are.")
    }
    return { stdout: "", stderr: "" }
  }

  const result = await createCompanyFromTemplateImpl(
    "No Identity Co",
    target,
    templateSourceDir,
    undefined,
    registryPath,
    noIdentityExec
  )

  expect(result.ok).toBe(true)
  const commit = execCalls.map((c) => c.args).find((a) => a.includes("commit") && a.includes("-c"))
  expect(commit).toBeDefined()
  expect(commit).toContain("user.email=alacran@localhost")
})
