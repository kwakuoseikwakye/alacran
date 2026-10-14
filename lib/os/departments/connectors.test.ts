import { describe, it, expect, vi } from "vitest"
import {
  getConnectorTreatment,
  resolveConnectorStatus,
  resolveDepartmentConnectors,
  resolveAllDepartmentConnectors,
  DEPARTMENT_CONNECTOR_CATALOG,
  type ConnectorStatus,
} from "./connectors"
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

const testEnv = (vars: Record<string, string> = {}): NodeJS.ProcessEnv => ({ NODE_ENV: "test", ...vars })

describe("getConnectorTreatment", () => {
  it("renders distinct treatments for each of the three states", () => {
    const connected = getConnectorTreatment("connected")
    const notConfigured = getConnectorTreatment("not_configured")
    const error = getConnectorTreatment("error")

    expect(connected.badgeClass).not.toBe(notConfigured.badgeClass)
    expect(connected.badgeClass).not.toBe(error.badgeClass)
    expect(notConfigured.badgeClass).not.toBe(error.badgeClass)
  })

  it("never renders as green unless status is connected (spec invariant)", () => {
    const statuses: ConnectorStatus[] = ["connected", "not_configured", "error"]

    for (const status of statuses) {
      const treatment = getConnectorTreatment(status)
      if (status === "connected") {
        expect(treatment.isGreen).toBe(true)
        expect(treatment.badgeClass).toContain("emerald")
        expect(treatment.dotClass).toContain("emerald")
      } else {
        expect(treatment.isGreen).toBe(false)
        expect(treatment.badgeClass).not.toContain("emerald")
        expect(treatment.dotClass).not.toContain("emerald")
      }
    }
  })

  it("provides helpful suffix indicators for non-connected states", () => {
    expect(getConnectorTreatment("not_configured").labelSuffix).toBe("(setup)")
    expect(getConnectorTreatment("error").labelSuffix).toBe("(error)")
    expect(getConnectorTreatment("connected").labelSuffix).toBeUndefined()
  })
})

describe("resolveConnectorStatus", () => {
  it("detects github as connected when gh CLI reports active user", async () => {
    const mockExec = vi.fn().mockImplementation(async (cmd: string, args: string[]) => {
      if (cmd === "which" && args[0] === "gh") return { stdout: "/usr/bin/gh", stderr: "" }
      if (cmd === "gh" && args[0] === "api") return { stdout: "octocat", stderr: "" }
      throw new Error("not found")
    })

    const status = await resolveConnectorStatus("github", {
      env: testEnv({}),
      execFn: mockExec,
    })
    expect(status).toBe("connected")
  })

  it("detects github as connected via GITHUB_TOKEN environment variable", async () => {
    const status = await resolveConnectorStatus("github", {
      env: testEnv({ GITHUB_TOKEN: "ghp_12345" }),
      execFn: vi.fn().mockRejectedValue(new Error("no binary")),
    })
    expect(status).toBe("connected")
  })

  it("detects github as not_configured when gh is absent and no env token", async () => {
    const mockExec = vi.fn().mockRejectedValue(new Error("which: no gh"))
    const status = await resolveConnectorStatus("github", {
      env: testEnv({}),
      execFn: mockExec,
    })
    expect(status).toBe("not_configured")
  })

  it("detects stripe as connected via STRIPE_API_KEY environment variable", async () => {
    const status = await resolveConnectorStatus("stripe", {
      env: testEnv({ STRIPE_API_KEY: "sk_test_123" }),
    })
    expect(status).toBe("connected")
  })

  it("detects beeper as connected when beeper CLI probe succeeds", async () => {
    const mockExec = vi.fn().mockImplementation(async (cmd: string) => {
      if (cmd === "which") return { stdout: "/usr/bin/beeper", stderr: "" }
      if (cmd === "beeper") return { stdout: "0.6.2", stderr: "" }
      throw new Error("command failed")
    })

    const status = await resolveConnectorStatus("beeper", {
      env: testEnv({}),
      execFn: mockExec,
    })
    expect(status).toBe("connected")
  })

  it("detects attio, hubspot, mercury, ghost, x, and bluesky via environment credentials", async () => {
    expect(await resolveConnectorStatus("attio", { env: testEnv({ ATTIO_API_KEY: "key" }) })).toBe("connected")
    expect(await resolveConnectorStatus("hubspot", { env: testEnv({ HUBSPOT_ACCESS_TOKEN: "tok" }) })).toBe("connected")
    expect(await resolveConnectorStatus("mercury", { env: testEnv({ MERCURY_API_KEY: "tok" }) })).toBe("connected")
    expect(await resolveConnectorStatus("ghost", { env: testEnv({ GHOST_ADMIN_API_KEY: "tok" }) })).toBe("connected")
    expect(await resolveConnectorStatus("substack", { env: testEnv({ SUBSTACK_API_KEY: "tok" }) })).toBe("connected")
    expect(await resolveConnectorStatus("x", { env: testEnv({ X_BEARER_TOKEN: "tok" }) })).toBe("connected")
    expect(await resolveConnectorStatus("bluesky", { env: testEnv({ BLUESKY_PASSWORD: "pw" }) })).toBe("connected")
  })

  it("detects company secrets file when present under company secrets/", async () => {
    const tmp = await mkdtemp(path.join(tmpdir(), "connector-secrets-"))
    try {
      await mkdir(path.join(tmp, "secrets"), { recursive: true })
      await writeFile(path.join(tmp, "secrets", "attio.txt"), "secret-token")

      const status = await resolveConnectorStatus("attio", {
        companyPath: tmp,
        env: testEnv({}),
      })
      expect(status).toBe("connected")
    } finally {
      await rm(tmp, { recursive: true, force: true })
    }
  })

  it("returns not_configured for unknown connector with no credentials", async () => {
    const status = await resolveConnectorStatus("unknown-crm", { env: testEnv({}) })
    expect(status).toBe("not_configured")
  })
})

describe("resolveDepartmentConnectors", () => {
  it("resolves an array of connectors preserving labels and updating live statuses", async () => {
    const declared = [
      { id: "github", label: "GitHub" },
      { id: "stripe", label: "Stripe" },
      { id: "hubspot", label: "HubSpot" },
    ]

    const resolved = await resolveDepartmentConnectors(declared, {
      env: testEnv({ STRIPE_API_KEY: "sk_live_123" }),
      execFn: vi.fn().mockRejectedValue(new Error("not found")),
    })

    expect(resolved).toEqual([
      { id: "github", label: "GitHub", status: "not_configured" },
      { id: "stripe", label: "Stripe", status: "connected", source: "machine" },
      { id: "hubspot", label: "HubSpot", status: "not_configured" },
    ])
  })

  it("says a key inherited from the machine is the machine's, not the company's", async () => {
    const companyPath = await mkdtemp(path.join(tmpdir(), "dept-conn-src-"))
    try {
      const [stripe] = await resolveDepartmentConnectors([{ id: "stripe", label: "Stripe" }], {
        companyPath,
        env: testEnv({ NODE_ENV: "test", STRIPE_SECRET_KEY: "sk_test_machine" }),
        execFn: vi.fn().mockRejectedValue(new Error("not found")),
      })
      expect(stripe).toMatchObject({ status: "connected", source: "machine" })

      await mkdir(path.join(companyPath, "secrets"), { recursive: true })
      await writeFile(path.join(companyPath, "secrets", "stripe.txt"), "sk_test_company")
      const [own] = await resolveDepartmentConnectors([{ id: "stripe", label: "Stripe" }], {
        companyPath,
        env: testEnv({ NODE_ENV: "test", STRIPE_SECRET_KEY: "sk_test_machine" }),
        execFn: vi.fn().mockRejectedValue(new Error("not found")),
      })
      expect(own).toMatchObject({ status: "connected", source: "company" })
    } finally {
      await rm(companyPath, { recursive: true, force: true })
    }
  })
})

describe("DEPARTMENT_CONNECTOR_CATALOG", () => {
  it("contains all expected department connectors with valid metadata", () => {
    const ids = DEPARTMENT_CONNECTOR_CATALOG.map((c) => c.id)
    expect(ids).toContain("attio")
    expect(ids).toContain("hubspot")
    expect(ids).toContain("stripe")
    expect(ids).toContain("mercury")
    expect(ids).toContain("quickbooks")
    expect(ids).toContain("x")
    expect(ids).toContain("linkedin")
    expect(ids).toContain("youtube")
    expect(ids).toContain("bluesky")
    expect(ids).toContain("ghost")
    expect(ids).toContain("substack")

    for (const c of DEPARTMENT_CONNECTOR_CATALOG) {
      expect(c.name).toBeTruthy()
      expect(c.description).toBeTruthy()
      expect(c.docsUrl).toMatch(/^https?:\/\//)
      expect(c.envVar).toBeTruthy()
      expect(c.secretFile).toMatch(/^secrets\/[a-z0-9_-]+\.txt$/)
      expect(c.departments.length).toBeGreaterThan(0)
    }
  })
})

describe("resolveAllDepartmentConnectors", () => {
  it("resolves machine-wide connected status when env var is present", async () => {
    const results = await resolveAllDepartmentConnectors({
      env: testEnv({ ATTIO_API_KEY: "secret_123" }),
      execFn: vi.fn().mockRejectedValue(new Error("no binary")),
    })

    const attio = results.find((c) => c.id === "attio")
    expect(attio?.status).toBe("connected")
    expect(attio?.detail).toContain("environment")

    const hubspot = results.find((c) => c.id === "hubspot")
    expect(hubspot?.status).toBe("not_configured")
  })

  it("resolves company-specific secret presence across companies", async () => {
    const tmp1 = await mkdtemp(path.join(tmpdir(), "conn-co1-"))
    const tmp2 = await mkdtemp(path.join(tmpdir(), "conn-co2-"))

    try {
      await mkdir(path.join(tmp1, "secrets"), { recursive: true })
      await writeFile(path.join(tmp1, "secrets", "mercury.txt"), "token1")

      const companies = [
        { id: "co-1", name: "Company One", rootPath: tmp1 },
        { id: "co-2", name: "Company Two", rootPath: tmp2 },
      ]

      const results = await resolveAllDepartmentConnectors({
        env: testEnv({}),
        execFn: vi.fn().mockRejectedValue(new Error("no binary")),
        companies,
      })

      const mercury = results.find((c) => c.id === "mercury")
      expect(mercury?.status).toBe("connected")
      expect(mercury?.detail).toContain("1 of 2 companies")
      expect(mercury?.companies).toEqual([
        { companyId: "co-1", companyName: "Company One", connected: true },
        { companyId: "co-2", companyName: "Company Two", connected: false },
      ])
    } finally {
      await rm(tmp1, { recursive: true, force: true })
      await rm(tmp2, { recursive: true, force: true })
    }
  })
})
