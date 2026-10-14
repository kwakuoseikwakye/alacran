// lib/credentials/resolve.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { resolveCredential } from "./resolve"

let dir: string
let companyRoot: string
let envLocal: string

// resolveCredential's machine tier now reads real process.env (Finding 2
// fix), so any test in this file that expects "unset" or a specific .env.local
// value to win is only correct if these names aren't ALSO exported as real
// shell variables on the machine running the suite — which, on at least one
// dev machine here, STRIPE_SECRET_KEY is. Save/clear/restore around every
// test rather than trusting the ambient environment to be empty.
const MACHINE_ENV_KEYS = ["STRIPE_SECRET_KEY", "NOTION_TOKEN", "NOTION_API_KEY"]
let savedEnv: Record<string, string | undefined>

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "cred-"))
  companyRoot = path.join(dir, "company")
  fs.mkdirSync(companyRoot)
  envLocal = path.join(dir, ".env.local")

  savedEnv = {}
  for (const key of MACHINE_ENV_KEYS) {
    savedEnv[key] = process.env[key]
    delete process.env[key]
  }
})
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
  for (const key of MACHINE_ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key]
    else process.env[key] = savedEnv[key]
  }
})

describe("resolveCredential", () => {
  it("prefers the company value over the machine value", async () => {
    fs.writeFileSync(path.join(companyRoot, ".env"), "STRIPE_SECRET_KEY=sk_company\n")
    fs.writeFileSync(envLocal, "STRIPE_SECRET_KEY=sk_machine\n")
    const r = await resolveCredential(companyRoot, "STRIPE_SECRET_KEY", { envLocalPath: envLocal })
    expect(r).toEqual({ value: "sk_company", source: "company" })
  })

  it("falls back to the machine value when the company file is absent", async () => {
    fs.writeFileSync(envLocal, "STRIPE_SECRET_KEY=sk_machine\n")
    const r = await resolveCredential(companyRoot, "STRIPE_SECRET_KEY", { envLocalPath: envLocal })
    expect(r).toEqual({ value: "sk_machine", source: "machine" })
  })

  it("falls back when the company file has the key with an empty value", async () => {
    fs.writeFileSync(path.join(companyRoot, ".env"), "STRIPE_SECRET_KEY=\n")
    fs.writeFileSync(envLocal, "STRIPE_SECRET_KEY=sk_machine\n")
    const r = await resolveCredential(companyRoot, "STRIPE_SECRET_KEY", { envLocalPath: envLocal })
    expect(r.source).toBe("machine")
  })

  it("reports unset when neither file has it", async () => {
    const r = await resolveCredential(companyRoot, "STRIPE_SECRET_KEY", { envLocalPath: envLocal })
    expect(r).toEqual({ value: null, source: "unset" })
  })

  it("reads machine only when given a null root", async () => {
    fs.writeFileSync(path.join(companyRoot, ".env"), "STRIPE_SECRET_KEY=sk_company\n")
    fs.writeFileSync(envLocal, "STRIPE_SECRET_KEY=sk_machine\n")
    const r = await resolveCredential(null, "STRIPE_SECRET_KEY", { envLocalPath: envLocal })
    expect(r).toEqual({ value: "sk_machine", source: "machine" })
  })

  // Real shapes: parseEnvFile handles `export ` and quotes, so the company
  // reader must too. Copied from the forms .env.local actually contains.
  it("handles the export prefix and quoted values in the company file", async () => {
    fs.writeFileSync(path.join(companyRoot, ".env"), 'export STRIPE_SECRET_KEY="sk_quoted"\n')
    const r = await resolveCredential(companyRoot, "STRIPE_SECRET_KEY", { envLocalPath: envLocal })
    expect(r).toEqual({ value: "sk_quoted", source: "company" })
  })

  it("resolves a vendor-named company key against our machine name", async () => {
    fs.writeFileSync(path.join(companyRoot, ".env"), "NOTION_TOKEN=ntn_company\n")
    const r = await resolveCredential(companyRoot, "NOTION_API_KEY", { envLocalPath: envLocal })
    expect(r).toEqual({ value: "ntn_company", source: "company" })
  })
})

// The machine tier must match what lib/os/connectors/statuses.ts's runtimeEnv()
// already treats as "the machine" — process.env merged with .env.local — or a
// value exported as a real shell variable regresses from "Connected" to "Not
// configured" the moment this resolver is in the loop. Never leaves a value
// behind in the real process.env: every test restores exactly what it found.
describe("resolveCredential machine tier reads process.env, not just .env.local", () => {
  const KEY = "STRIPE_SECRET_KEY"
  let original: string | undefined

  beforeEach(() => {
    original = process.env[KEY]
  })
  afterEach(() => {
    if (original === undefined) delete process.env[KEY]
    else process.env[KEY] = original
  })

  it("resolves an exported process.env value with source machine", async () => {
    process.env[KEY] = "sk_exported"
    const r = await resolveCredential(companyRoot, KEY, { envLocalPath: envLocal })
    expect(r).toEqual({ value: "sk_exported", source: "machine" })
  })

  it("still prefers the company .env over an exported process.env value", async () => {
    process.env[KEY] = "sk_exported"
    fs.writeFileSync(path.join(companyRoot, ".env"), `${KEY}=sk_company\n`)
    const r = await resolveCredential(companyRoot, KEY, { envLocalPath: envLocal })
    expect(r).toEqual({ value: "sk_company", source: "company" })
  })
})
