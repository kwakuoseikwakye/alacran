import { describe, it, expect } from "vitest"
import { matchRepos, summariseRepo, buildRepoContext } from "./repo-summary"
import type { TriageRepo } from "./triage-config"
import type { PrefetchExecFileFn } from "./types"

const repos: TriageRepo[] = [
  { name: "plh-platform", path: "/r/plh-platform", description: "Main PLH web platform SSO" },
  { name: "plh-mobile", path: "/r/plh-mobile", description: "Mobile app" },
  { name: "plh-car-rental-website", path: "/r/car", description: "Carshare billing site" },
]

describe("matchRepos", () => {
  it("matches on repo name", () => {
    expect(matchRepos("please fix plh-mobile login", repos).map((r) => r.name)).toEqual(["plh-mobile"])
  })

  it("matches case-insensitively", () => {
    expect(matchRepos("PLH-MOBILE is broken", repos).map((r) => r.name)).toEqual(["plh-mobile"])
  })

  it("matches on a description word", () => {
    expect(matchRepos("the carshare page is down", repos).map((r) => r.name)).toEqual([
      "plh-car-rental-website",
    ])
  })

  it("returns every match when the text is ambiguous", () => {
    expect(matchRepos("plh-mobile and plh-platform both broken", repos).map((r) => r.name)).toEqual([
      "plh-platform",
      "plh-mobile",
    ])
  })

  it("returns nothing when no repo is mentioned", () => {
    expect(matchRepos("the office wifi is down", repos)).toEqual([])
  })

  it("ignores short and generic description words", () => {
    // "app" and "the" must not make every repo match everything.
    expect(matchRepos("app", repos).map((r) => r.name)).toEqual([])
  })
})

describe("summariseRepo", () => {
  const execFn: PrefetchExecFileFn = async (_file, args) => {
    if (args[0] === "rev-parse") return { stdout: "fix/sso-audit-logging\n", stderr: "" }
    if (args[0] === "status") return { stdout: " M src/a.ts\n", stderr: "" }
    if (args[0] === "log") return { stdout: "abc1234 recent work\n", stderr: "" }
    if (args[0] === "ls-files") return { stdout: "src/a.ts\nsrc/b.ts\n", stderr: "" }
    return { stdout: "", stderr: "" }
  }

  it("reports branch and dirty state", async () => {
    const text = await summariseRepo(repos[0], execFn, true)
    expect(text).toContain("fix/sso-audit-logging")
    expect(text).toContain("uncommitted changes")
    expect(text).toContain("abc1234 recent work")
    expect(text).toContain("src/a.ts")
  })

  it("says so explicitly when the tree is clean", async () => {
    const clean: PrefetchExecFileFn = async (_file, args) => {
      if (args[0] === "status") return { stdout: "", stderr: "" }
      return execFn(_file, args, { cwd: "" })
    }
    expect(await summariseRepo(repos[0], clean, true)).toContain("clean")
  })

  it("omits the file list when not requested", async () => {
    const text = await summariseRepo(repos[0], execFn, false)
    expect(text).not.toContain("src/b.ts")
  })

  it("degrades to a note when the repo cannot be read", async () => {
    const broken: PrefetchExecFileFn = async () => {
      throw new Error("not a git repository")
    }
    expect(await summariseRepo(repos[0], broken, true)).toContain("unable to read")
  })
})

describe("buildRepoContext", () => {
  const execFn: PrefetchExecFileFn = async (_file, args) => {
    if (args[0] === "rev-parse") return { stdout: "main\n", stderr: "" }
    return { stdout: "", stderr: "" }
  }

  it("gives a full summary for exactly one match", async () => {
    const text = await buildRepoContext("plh-mobile is broken", repos, execFn)
    expect(text).toContain("routed to plh-mobile")
  })

  it("lists every repo without file lists when ambiguous", async () => {
    const text = await buildRepoContext("plh-mobile and plh-platform", repos, execFn)
    expect(text).toContain("could not be routed confidently")
    expect(text).toContain("plh-platform")
    expect(text).toContain("plh-mobile")
  })

  it("lists every repo when nothing matched", async () => {
    const text = await buildRepoContext("wifi is down", repos, execFn)
    expect(text).toContain("could not be routed confidently")
  })
})
