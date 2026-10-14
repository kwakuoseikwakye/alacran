import { execFileSync } from "node:child_process"
import { mkdirSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterAll, describe, expect, it } from "vitest"
import { listMemoryItems } from "./memory-items"

// Real git, real files: memory-items.test.ts fakes git, so it cannot see how git
// really reports paths (relative to the repo's top level, not to the folder asked about).
const sandbox = mkdtempSync(path.join(os.tmpdir(), "memory-items-git-"))
afterAll(() => rmSync(sandbox, { recursive: true, force: true }))

const git = (cwd: string, ...args: string[]) =>
  execFileSync("git", ["-c", "user.name=Test", "-c", "user.email=test@example.invalid", "-c", "commit.gpgsign=false", ...args], { cwd, stdio: "pipe" })

function repo(name: string): string {
  const dir = path.join(sandbox, name)
  mkdirSync(dir, { recursive: true })
  git(dir, "init", "-q")
  return dir
}
function write(dir: string, rel: string, text: string) {
  mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true })
  writeFileSync(path.join(dir, rel), text)
}
function commitAll(dir: string, message: string) {
  git(dir, "add", "-A")
  git(dir, "commit", "-q", "-m", message)
}

const PROFILE = (domain: string) => `company_summary:\n  domain: ${domain}\n`

describe("listMemoryItems against real git", () => {
  it("lists a company folder that sits inside a larger repo, and nothing from outside it", async () => {
    const dir = repo("mono")
    write(dir, "co/notes/2026-09-28-call.md", "# Supplier call\n\nDelivery moves to Tuesdays.\n")
    write(dir, "co/docs/decisions/2026-09-29-price.md", "# Price by size\n\n## Decision\nWe price by size.\n")
    write(dir, "other/notes/elsewhere.md", "# Elsewhere\n\nNot this company.\n")
    commitAll(dir, "add memory")

    const items = await listMemoryItems(path.join(dir, "co"))

    expect(items.map((i) => i.path).sort()).toEqual(["docs/decisions/2026-09-29-price.md", "notes/2026-09-28-call.md"])
    expect(items.find((i) => i.kind === "decision")?.statement).toBe("We price by size.")
  })

  it("shows the approved text of a committed profile that has an unapproved edit, at the top of a repo and nested", async () => {
    for (const [name, sub] of [["flat", ""], ["nested", "co"]] as const) {
      const dir = repo(name)
      write(dir, path.join(sub, "definitions/ontology/company.yaml"), PROFILE("The approved bakery"))
      commitAll(dir, "approve profile")
      write(dir, path.join(sub, "definitions/ontology/company.yaml"), PROFILE("A draft bakery"))

      const [item] = await listMemoryItems(path.join(dir, sub))

      expect(item.statement).toBe("Your business: The approved bakery")
    }
  })

  it("leaves out untracked and deleted files", async () => {
    const dir = repo("churn")
    write(dir, "notes/kept.md", "# Kept\n\nStays.\n")
    write(dir, "notes/removed.md", "# Removed\n\nGoes.\n")
    commitAll(dir, "add two notes")
    unlinkSync(path.join(dir, "notes/removed.md"))
    commitAll(dir, "remove one")
    write(dir, "notes/untracked.md", "# Untracked\n\nNever committed.\n")

    const items = await listMemoryItems(dir)

    expect(items.map((i) => i.path)).toEqual(["notes/kept.md"])
  })

  it("gives an empty list for a repo with no commits and for a folder that is not a repo", async () => {
    expect(await listMemoryItems(repo("empty"))).toEqual([])
    const plain = path.join(sandbox, "plain")
    mkdirSync(plain)
    write(plain, "notes/a.md", "# A\n")
    expect(await listMemoryItems(plain)).toEqual([])
  })
})
