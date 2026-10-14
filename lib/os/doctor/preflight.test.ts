import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { runPreflightChecks } from "./preflight"

let root: string

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "preflight-test-"))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe("runPreflightChecks", () => {
  it("passes all checks when environment is clean and git is available", async () => {
    await mkdir(path.join(root, "definitions/ontology"), { recursive: true })
    await writeFile(path.join(root, "definitions/ontology/company.yaml"), "name: Test")

    const fakeExec = async () => ({ stdout: "git version 2.39.0", stderr: "" })
    const report = await runPreflightChecks(root, "digest", fakeExec)

    expect(report.ok).toBe(true)
    expect(report.canProceed).toBe(true)
    expect(report.blockers).toHaveLength(0)
    expect(report.warnings).toHaveLength(0)
  })

  it("flags Git index lock as a blocking failure", async () => {
    await mkdir(path.join(root, ".git"), { recursive: true })
    await writeFile(path.join(root, ".git/index.lock"), "")

    const fakeExec = async () => ({ stdout: "git version 2.39.0", stderr: "" })
    const report = await runPreflightChecks(root, "digest", fakeExec)

    expect(report.canProceed).toBe(false)
    const gitCheck = report.checks.find((c) => c.id === "git-lock")
    expect(gitCheck?.status).toBe("fail")
    expect(gitCheck?.blocker).toBe(true)
    expect(gitCheck?.remediation).toContain("rm -f .git/index.lock")
  })

  it("flags active command lock as a blocker", async () => {
    await mkdir(path.join(root, "state"), { recursive: true })
    await writeFile(path.join(root, "state/digest.lock"), "pid 1234")

    const fakeExec = async () => ({ stdout: "git version 2.39.0", stderr: "" })
    const report = await runPreflightChecks(root, "digest", fakeExec)

    expect(report.canProceed).toBe(false)
    const cmdLock = report.checks.find((c) => c.id === "command-lock")
    expect(cmdLock?.status).toBe("warn")
    expect(cmdLock?.blocker).toBe(true)
  })

  it("warns when company ontology is missing without blocking execution", async () => {
    const fakeExec = async () => ({ stdout: "git version 2.39.0", stderr: "" })
    const report = await runPreflightChecks(root, undefined, fakeExec)

    expect(report.canProceed).toBe(true)
    const ontologyCheck = report.checks.find((c) => c.id === "company-ontology")
    expect(ontologyCheck?.status).toBe("warn")
    expect(ontologyCheck?.blocker).toBe(false)
  })

  it("blocks execution when git executable is not available", async () => {
    const fakeExec = async () => {
      throw new Error("command not found: git")
    }
    const report = await runPreflightChecks(root, undefined, fakeExec)

    expect(report.canProceed).toBe(false)
    const gitCli = report.checks.find((c) => c.id === "git-cli")
    expect(gitCli?.status).toBe("fail")
    expect(gitCli?.blocker).toBe(true)
  })
})
