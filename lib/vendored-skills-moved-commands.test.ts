import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { isPackInstalled } from "./vendored-skills"

let base: string
let packsRoot: string
let company: string
// A unique pack name per test run: isPackInstalled memoizes a pack's command list by path.
let pack: string

async function put(rel: string, text = "x") {
  const file = path.join(base, ...rel.split("/"))
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(file, text)
}

beforeEach(async () => {
  base = await mkdtemp(path.join(tmpdir(), "pack-detect-"))
  packsRoot = path.join(base, "packs")
  company = path.join(base, "company")
  pack = `pk-${path.basename(base)}`
  await mkdir(company, { recursive: true })
  await put(`packs/${pack}/.claude/commands/alpha.md`)
})
afterEach(async () => {
  await rm(base, { recursive: true, force: true })
})

describe("isPackInstalled once commands have moved to .agents/skills", () => {
  it("still recognises a company that holds the pack's commands as flat files", async () => {
    await put("company/.claude/commands/alpha.md")
    expect(await isPackInstalled(company, pack, packsRoot)).toBe(true)
  })

  it("recognises the same company after its commands became skill folders", async () => {
    await put("company/.agents/skills/alpha/SKILL.md")
    expect(await isPackInstalled(company, pack, packsRoot)).toBe(true)
  })

  it("does not recognise a company that holds neither", async () => {
    await put("company/.agents/skills/unrelated/SKILL.md")
    await put("company/.claude/commands/other.md")
    expect(await isPackInstalled(company, pack, packsRoot)).toBe(false)
  })

  it("does not recognise an empty company", async () => {
    expect(await isPackInstalled(company, pack, packsRoot)).toBe(false)
  })
})
