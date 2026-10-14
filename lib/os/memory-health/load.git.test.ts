import { execFileSync } from "node:child_process"
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterAll, describe, expect, it } from "vitest"
import { INITIAL_COMMIT_MESSAGE } from "@/lib/company-template-manifest"
import { defaultExecFile } from "@/lib/default-exec-file"
import { loadMemoryHealth } from "./load"

const sandbox = mkdtempSync(path.join(os.tmpdir(), "memory-health-git-"))
afterAll(() => rmSync(sandbox, { recursive: true, force: true }))

const NOW = new Date("2026-10-12T12:00:00Z")
const OLD = "2026-05-01T10:00:00Z" // 164 days before NOW
const RECENT = "2026-10-05T10:00:00Z"
const PROFILE = "definitions/ontology/company.yaml"

function git(cwd: string, args: string[], when?: string) {
  const env = { ...process.env, ...(when ? { GIT_AUTHOR_DATE: when, GIT_COMMITTER_DATE: when } : {}) }
  return execFileSync("git", ["-c", "user.name=Test", "-c", "user.email=test@example.invalid", "-c", "commit.gpgsign=false", ...args], { cwd, env, stdio: "pipe" }).toString()
}
function repo(name: string): string {
  const dir = path.join(sandbox, name)
  mkdirSync(dir, { recursive: true })
  git(dir, ["init", "-q", "-b", "master"])
  return dir
}
function write(dir: string, rel: string, text: string) {
  mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true })
  writeFileSync(path.join(dir, rel), text)
}
function commit(dir: string, message: string, when: string) {
  git(dir, ["add", "-A"])
  git(dir, ["commit", "-q", "-m", message], when)
}
function note(dir: string, name: string, when: string, prefix = "") {
  write(dir, `${prefix}notes/${name}.md`, `# ${name}\n\nSomething happened.\n`)
  commit(dir, `note ${name}`, when)
}
const PROFILE_TEXT = "created: 2026-01-01\ncompany_summary:\n  domain: bakery\npricing:\n  model: by size\n"

/** pricing is 164 days old with `newerNotes` notes after it; company_summary was edited recently. */
function staleCompany(name: string, newerNotes: number): string {
  const dir = repo(name)
  write(dir, PROFILE, PROFILE_TEXT)
  commit(dir, "Describe the company", OLD)
  ;["2026-06-01", "2026-07-01", "2026-08-01"].slice(0, newerNotes).forEach((d, i) => note(dir, `n${i}`, `${d}T10:00:00Z`))
  write(dir, PROFILE, PROFILE_TEXT.replace("domain: bakery", "domain: bakery and cafe"))
  commit(dir, "Update the summary", RECENT)
  return dir
}

describe("loadMemoryHealth against real git", () => {
  it("flags a section 90+ days old with 3 newer notes; leaves the recently edited one and the metadata key alone", async () => {
    const h = await loadMemoryHealth(staleCompany("stale3", 3), { now: NOW })
    if (h.state !== "ok") throw new Error(`expected ok, got ${JSON.stringify(h)}`)
    expect(h.stale).toEqual([{ key: "pricing", label: "Pricing", ageDays: 164, newerNotes: 3, newerDecisions: 0 }])
    expect(h.sources).toEqual({ state: "not-tracked" })
    expect(h.score).toBe(90)
  })

  it("does not flag with only 2 newer notes", async () => {
    const h = await loadMemoryHealth(staleCompany("stale2", 2), { now: NOW })
    expect(h).toMatchObject({ state: "ok", stale: [], score: 100 })
  })

  it("lets definitions/memory-health.yaml change the outcome, and ignores a bad value", async () => {
    const dir = staleCompany("tuned", 2)
    write(dir, "definitions/memory-health.yaml", "stale_after_days: soon\nmin_newer_notes: 2\n")
    commit(dir, "Tune memory health", RECENT)
    const h = await loadMemoryHealth(dir, { now: NOW })
    if (h.state !== "ok") throw new Error("expected ok")
    expect(h.stale.map((s) => s.key)).toEqual(["pricing"])
  })

  it("ignores uncommitted edits", async () => {
    const dir = staleCompany("dirty", 3)
    write(dir, PROFILE, "company_summary:\n  domain: changed\n")
    const h = await loadMemoryHealth(dir, { now: NOW })
    if (h.state !== "ok") throw new Error("expected ok")
    expect(h.stale.map((s) => s.key)).toEqual(["pricing"])
  })

  it("finds placeholders in the profile (by section) and in another definitions file, from HEAD only", async () => {
    const dir = repo("todos")
    write(dir, PROFILE, "company_summary:\n  domain: bakery\nvalue_flow:\n  output: <<TODO>>\n")
    write(dir, "definitions/brand-voice.md", "Tone: <<TODO>>\n")
    commit(dir, "Describe", OLD)
    write(dir, "definitions/uncommitted.md", "<<TODO>>\n")
    const h = await loadMemoryHealth(dir, { now: NOW })
    if (h.state !== "ok") throw new Error("expected ok")
    expect(h.unfinished.map((u) => u.where).sort()).toEqual(["Brand voice", "Value flow"])
    expect(h.score).toBe(80)
  })

  it("does not count the template's own README that documents the marker, at the root or nested", async () => {
    const readme = readFileSync(path.join(process.cwd(), "templates/company-starter/definitions/README.md"), "utf8")
    expect(readme).toContain("<<TODO")
    const real = "meta:\n  version: 1\n  updated: \"2026-01-01\"\ncustomer:\n  a: 1\norg:\n  b: 2\nproduct:\n  c: 3\n"
    const dir = repo("readme")
    write(dir, PROFILE, real)
    write(dir, "definitions/README.md", readme)
    commit(dir, "Describe", OLD)
    expect(await loadMemoryHealth(dir, { now: NOW })).toMatchObject({ state: "ok", unfinished: [], score: 100 })
    const mono = repo("readme-nested")
    write(mono, `co/${PROFILE}`, real)
    write(mono, "co/definitions/README.md", readme)
    write(mono, "co/definitions/Readme.md", readme)
    commit(mono, "Describe", OLD)
    expect(await loadMemoryHealth(path.join(mono, "co"), { now: NOW })).toMatchObject({ state: "ok", unfinished: [], score: 100 })
  })

  it("finds <<TODO: hint>> variants", async () => {
    const dir = repo("hints")
    write(dir, PROFILE, "meta:\n  version: 1\norg:\n  owner: <<TODO: a role id from org.roles>>\n")
    commit(dir, "Describe", OLD)
    const h = await loadMemoryHealth(dir, { now: NOW })
    if (h.state !== "ok") throw new Error("expected ok")
    expect(h.unfinished).toEqual([{ where: "Org", line: 4 }])
  })

  it("with the real meta: layout, only top-level non-meta sections go stale, and an updated bump is not a fact change", async () => {
    const dir = repo("meta")
    const body = (u: string, d = "bakery") => `meta:\n  version: 1\n  updated: "${u}"\ncustomer:\n  domain: ${d}  # source: notes/a.md\norg:\n  x: 1\n`
    write(dir, PROFILE, body("2026-05-01"))
    commit(dir, "Describe", OLD)
    ;["2026-06-01", "2026-07-01", "2026-08-01"].forEach((d, i) => note(dir, `n${i}`, `${d}T10:00:00Z`))
    write(dir, PROFILE, body("2026-10-12"))
    commit(dir, "Bump updated only", RECENT)
    const h = await loadMemoryHealth(dir, { now: NOW })
    if (h.state !== "ok") throw new Error("expected ok")
    expect(h.stale.map((s) => s.key)).toEqual(["customer", "org"])
    expect(h.sources).toEqual({ state: "tracked", sourced: 1, unsourced: 0 })
  })

  it("tracks sources from the first sourced change and counts later unsourced ones", async () => {
    const dir = repo("sources")
    write(dir, PROFILE, "pricing:\n  model: by size\n")
    commit(dir, "Describe", "2026-05-01T10:00:00Z") // before sources: not counted
    write(dir, PROFILE, "pricing:\n  model: by size  # source: notes/a.md\n")
    commit(dir, "Update from a note", "2026-06-01T10:00:00Z")
    write(dir, PROFILE, "pricing:\n  model: tiered\n")
    commit(dir, "Edit by hand", "2026-07-01T10:00:00Z")
    write(dir, PROFILE, "pricing:\n  model: tiered\nupdated: 2026-08-01\n")
    commit(dir, "Bump updated only", "2026-08-01T10:00:00Z") // not a fact change
    write(dir, PROFILE, "pricing:\n  model: tiered\n  currency: GHS\nupdated: 2026-08-01\n")
    commit(dir, "Update\n\nApplied facts from: notes/company/sessions/a.md", "2026-09-01T10:00:00Z")
    const h = await loadMemoryHealth(dir, { now: NOW })
    if (h.state !== "ok") throw new Error("expected ok")
    expect(h.sources).toEqual({ state: "tracked", sourced: 2, unsourced: 1 })
    expect(h.score).toBe(90) // 100 - round(30 * 1/3)
  })

  it("skips the template's first commit", async () => {
    const dir = repo("template")
    write(dir, PROFILE, "pricing:\n  model: <<TODO>>\n")
    commit(dir, INITIAL_COMMIT_MESSAGE, OLD)
    const h = await loadMemoryHealth(dir, { now: NOW })
    if (h.state !== "ok") throw new Error("expected ok")
    expect(h.sources).toEqual({ state: "not-tracked" })
  })

  it("works for a company folder nested inside a larger repo", async () => {
    const dir = repo("mono")
    write(dir, PROFILE, "x:\n  y: 1\n") // another profile at the repo top: must be ignored
    write(dir, `co/${PROFILE}`, PROFILE_TEXT.replace("by size", "<<TODO>>"))
    commit(dir, "Describe", OLD)
    ;["2026-06-01", "2026-07-01", "2026-08-01"].forEach((d, i) => note(dir, `n${i}`, `${d}T10:00:00Z`, "co/"))
    const h = await loadMemoryHealth(path.join(dir, "co"), { now: NOW })
    if (h.state !== "ok") throw new Error(`expected ok, got ${JSON.stringify(h)}`)
    expect(h.stale.map((s) => s.key)).toEqual(["company_summary", "pricing"])
    expect(h.unfinished).toEqual([{ where: "Pricing", line: 5 }])
  })

  it("reads 'none' with no company profile or no commits, and 'unknown' when git cannot be read", async () => {
    const empty = repo("empty")
    expect(await loadMemoryHealth(empty, { now: NOW })).toEqual({ state: "none" })
    const noProfile = repo("noprofile")
    note(noProfile, "a", OLD)
    expect(await loadMemoryHealth(noProfile, { now: NOW })).toEqual({ state: "none" })
    const plain = path.join(sandbox, "not-a-repo")
    mkdirSync(plain)
    expect(await loadMemoryHealth(plain, { now: NOW })).toEqual({ state: "unknown" })
    expect(await loadMemoryHealth(path.join(sandbox, "missing-folder"), { now: NOW })).toEqual({ state: "unknown" })
    const failing = async () => {
      throw new Error("git: command not found")
    }
    expect(await loadMemoryHealth(empty, { now: NOW, execFn: failing as never })).toEqual({ state: "unknown" })
  })

  it("passes --no-optional-locks on the reads it makes itself", async () => {
    const seen: string[][] = []
    const dir = staleCompany("locks", 3)
    await loadMemoryHealth(dir, {
      now: NOW,
      execFn: (cmd, args) => {
        seen.push(args)
        return defaultExecFile(cmd, args)
      },
    })
    expect(seen.length).toBeGreaterThan(5)
    expect(seen.filter((a) => !a.includes("--no-optional-locks"))).toEqual([])
  })

  it("is 'unknown', never 'ok', when the memory listing's git calls fail", async () => {
    const dir = staleCompany("partial", 3)
    const execFn = (cmd: string, args: string[]) => {
      if (args.includes("--relative")) return Promise.reject(new Error("boom"))
      return defaultExecFile(cmd, args)
    }
    expect(await loadMemoryHealth(dir, { now: NOW, execFn })).toEqual({ state: "unknown" })
  })

  it("is 'unknown' when HEAD cannot be checked for a reason other than no commits", async () => {
    const dir = staleCompany("code128", 3)
    const execFn = (cmd: string, args: string[]) =>
      args.includes("--verify") ? Promise.reject(Object.assign(new Error("fatal"), { code: 128 })) : defaultExecFile(cmd, args)
    expect(await loadMemoryHealth(dir, { now: NOW, execFn })).toEqual({ state: "unknown" })
  })

  it("checks a 500-commit company well under 2 seconds", async () => {
    const dir = repo("perf")
    const stream: string[] = []
    const data = (s: string) => `data ${Buffer.byteLength(s)}\n${s}\n`
    for (let i = 0; i < 500; i++) {
      const ts = 1_700_000_000 + i * 3600
      stream.push(`commit refs/heads/master\ncommitter T <t@example.invalid> ${ts} +0000\n${data(`c${i}`)}`)
      stream.push(`M 644 inline notes/n${i}.md\n${data(`# n${i}\n`)}`)
      if (i % 10 === 0) {
        const body = Array.from({ length: 30 }, (_, k) => `section_${k}:\n  value: ${k === i % 30 ? i : k}\n`).join("")
        stream.push(`M 644 inline ${PROFILE}\n${data(body)}`)
      }
    }
    execFileSync("git", ["fast-import", "--quiet"], { cwd: dir, input: stream.join(""), stdio: ["pipe", "pipe", "pipe"] })
    git(dir, ["reset", "--hard", "-q", "master"])
    const started = Date.now()
    const h = await loadMemoryHealth(dir, { now: new Date("2026-12-31T00:00:00Z") })
    const ms = Date.now() - started
    console.log(`memory health on 500 commits: ${ms} ms`)
    expect(h.state).toBe("ok")
    expect(ms).toBeLessThan(2000)
  })
})
