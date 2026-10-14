import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { mkdtemp, rm, readFile, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { upsertCompanyEnvText, checkEnvGitignored } from "./save-company-credential-impl"
import type { ExecFileFn } from "./terminal-launch-command"

describe("upsertCompanyEnvText", () => {
  it("adds a key to an empty file", () => {
    expect(upsertCompanyEnvText("", "STRIPE_SECRET_KEY", "sk_1")).toBe("STRIPE_SECRET_KEY=sk_1\n")
  })

  it("replaces an existing key in place, keeping the others", () => {
    const before = "NOTION_TOKEN=ntn_a\nSTRIPE_SECRET_KEY=sk_old\n"
    const after = upsertCompanyEnvText(before, "STRIPE_SECRET_KEY", "sk_new")
    expect(after).toContain("STRIPE_SECRET_KEY=sk_new")
    expect(after).toContain("NOTION_TOKEN=ntn_a")
    expect(after).not.toContain("sk_old")
  })

  it("removes the key when the value is empty", () => {
    const before = "NOTION_TOKEN=ntn_a\nSTRIPE_SECRET_KEY=sk_old\n"
    const after = upsertCompanyEnvText(before, "STRIPE_SECRET_KEY", "")
    expect(after).toBe("NOTION_TOKEN=ntn_a\n")
  })

  it("keeps comments and blank lines the skill wrote", () => {
    const before = "# written by api-connect\n\nNOTION_TOKEN=ntn_a\n"
    const after = upsertCompanyEnvText(before, "STRIPE_SECRET_KEY", "sk_1")
    expect(after).toContain("# written by api-connect")
    expect(after).toContain("STRIPE_SECRET_KEY=sk_1")
  })
})

describe("saveCompanyCredentialImpl validation", () => {
  it("rejects a value containing a newline", async () => {
    const { isSafeCredentialValue } = await import("./save-company-credential-impl")
    expect(isSafeCredentialValue("a\nb")).toBe(false)
    expect(isSafeCredentialValue("sk_live_123")).toBe(true)
  })
})

describe("isSafeCredentialKey", () => {
  it("rejects a key containing a newline", async () => {
    const { isSafeCredentialKey } = await import("./save-company-credential-impl")
    expect(isSafeCredentialKey("STRIPE_KEY\nEVIL=1")).toBe(false)
  })

  it("rejects a key containing =", async () => {
    const { isSafeCredentialKey } = await import("./save-company-credential-impl")
    expect(isSafeCredentialKey("STRIPE_KEY=EVIL")).toBe(false)
  })

  it("rejects an empty key", async () => {
    const { isSafeCredentialKey } = await import("./save-company-credential-impl")
    expect(isSafeCredentialKey("")).toBe(false)
  })

  it("accepts the real key shapes this app uses", async () => {
    const { isSafeCredentialKey } = await import("./save-company-credential-impl")
    expect(isSafeCredentialKey("STRIPE_SECRET_KEY")).toBe(true)
    expect(isSafeCredentialKey("INBOX_1_HOST")).toBe(true)
    expect(isSafeCredentialKey("NOTION_TOKEN")).toBe(true)
  })
})

describe("saveCompanyCredentialImpl file-read safety", () => {
  let root: string

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), "save-company-credential-"))
    vi.resetModules()
    vi.doMock("./get-effective-agents", () => ({
      getEffectiveAgents: async () => [{ id: "co", name: "Co", rootPath: root, kind: "command-set" }],
    }))
  })

  afterEach(async () => {
    vi.doUnmock("./get-effective-agents")
    vi.resetModules()
    await rm(root, { recursive: true, force: true })
  })

  it("does not overwrite an existing .env when it can't be read, and reports failure", async () => {
    const existing = "NOTION_TOKEN=ntn_a\nSTRIPE_SECRET_KEY=sk_old\n"
    await writeFile(path.join(root, ".env"), existing, { encoding: "utf-8", mode: 0o600 })

    const { saveCompanyCredentialImpl } = await import("./save-company-credential-impl")
    const eacces = Object.assign(new Error("permission denied"), { code: "EACCES" })
    const failingRead = async () => {
      throw eacces
    }

    const result = await saveCompanyCredentialImpl("co", "STRIPE_SECRET_KEY", "sk_new", failingRead)

    expect(result.ok).toBe(false)
    const onDisk = await readFile(path.join(root, ".env"), "utf-8")
    expect(onDisk).toBe(existing)
  })
})

describe("checkEnvGitignored", () => {
  it("returns ignored when git check-ignore exits 0", async () => {
    const execFn: ExecFileFn = async () => ({ stdout: ".env\n", stderr: "" })
    expect(await checkEnvGitignored("/some/repo", execFn)).toBe("ignored")
  })

  it("returns not-ignored on git's exit code 1 (tracked, no matching rule)", async () => {
    const execFn: ExecFileFn = async () => {
      throw Object.assign(new Error("not ignored"), { code: 1 })
    }
    expect(await checkEnvGitignored("/some/repo", execFn)).toBe("not-ignored")
  })

  it("returns no-repo on any other git failure (no .git, git missing, ...)", async () => {
    const execFn: ExecFileFn = async () => {
      throw Object.assign(new Error("fatal: not a git repository (or any of the parent directories): .git"), {
        code: 128,
      })
    }
    expect(await checkEnvGitignored("/some/repo", execFn)).toBe("no-repo")
  })
})

describe("saveCompanyCredentialImpl gitignore guard", () => {
  let root: string

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), "save-company-credential-gitignore-"))
    vi.resetModules()
    vi.doMock("./get-effective-agents", () => ({
      getEffectiveAgents: async () => [{ id: "co", name: "Co", rootPath: root, kind: "command-set" }],
    }))
  })

  afterEach(async () => {
    vi.doUnmock("./get-effective-agents")
    vi.resetModules()
    await rm(root, { recursive: true, force: true })
  })

  it("writes normally when the company's .env is covered by a gitignore rule", async () => {
    const { saveCompanyCredentialImpl } = await import("./save-company-credential-impl")
    const execFn: ExecFileFn = async () => ({ stdout: ".env\n", stderr: "" })

    const result = await saveCompanyCredentialImpl("co", "STRIPE_SECRET_KEY", "sk_new", undefined, execFn)

    expect(result).toEqual({ ok: true })
    const onDisk = await readFile(path.join(root, ".env"), "utf-8")
    expect(onDisk).toContain("STRIPE_SECRET_KEY=sk_new")
  })

  it("refuses and writes nothing when the company's .env is not gitignored", async () => {
    const { saveCompanyCredentialImpl } = await import("./save-company-credential-impl")
    const execFn: ExecFileFn = async () => {
      throw Object.assign(new Error("not ignored"), { code: 1 })
    }

    const result = await saveCompanyCredentialImpl("co", "STRIPE_SECRET_KEY", "sk_new", undefined, execFn)

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.message.toLowerCase()).toContain("gitignore")
    await expect(readFile(path.join(root, ".env"), "utf-8"))
      .rejects.toThrow(/ENOENT/)
  })

  it("does not block a company with no git repo at all (a failed git call is not treated as a refusal)", async () => {
    const { saveCompanyCredentialImpl } = await import("./save-company-credential-impl")
    const execFn: ExecFileFn = async () => {
      throw Object.assign(new Error("fatal: not a git repository (or any of the parent directories): .git"), {
        code: 128,
      })
    }

    const result = await saveCompanyCredentialImpl("co", "STRIPE_SECRET_KEY", "sk_new", undefined, execFn)

    expect(result).toEqual({ ok: true })
    const onDisk = await readFile(path.join(root, ".env"), "utf-8")
    expect(onDisk).toContain("STRIPE_SECRET_KEY=sk_new")
  })
})
