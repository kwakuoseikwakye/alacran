import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { clearExecMemo, memoizedExecFile } from "@/lib/exec-memo"
import type { ConnectStatus } from "./connect-status-impl"

const mocks = vi.hoisted(() => ({
  getConnectStatusImpl: vi.fn(),
  allConnectorStatuses: vi.fn(),
  readEnvLocal: vi.fn(),
  readMcpPool: vi.fn(),
}))

vi.mock("./connect-status-impl", () => ({ getConnectStatusImpl: mocks.getConnectStatusImpl }))
vi.mock("@/lib/os/connectors/statuses", () => ({ allConnectorStatuses: mocks.allConnectorStatuses }))
vi.mock("@/lib/os/connectors/creds", () => ({ readEnvLocal: mocks.readEnvLocal }))
vi.mock("@/lib/mcp-pool", () => ({ readMcpPool: mocks.readMcpPool }))

import { recheckAllConnectionsState } from "./connect-actions"

beforeEach(() => {
  vi.resetAllMocks()
  clearExecMemo()
  mocks.readEnvLocal.mockReturnValue({ STRIPE_SECRET_KEY: "saved-test-key" })
  mocks.readMcpPool.mockResolvedValue([{ name: "figma", url: "https://mcp.figma.com/mcp" }])
})

afterEach(() => clearExecMemo())

describe("recheckAllConnectionsState", () => {
  it("bypasses both cached probes and cached machine statuses when rebuilding the catalog", async () => {
    const execProbe = vi.fn().mockResolvedValue({ stdout: "old-account", stderr: "" })
    const probe = () => memoizedExecFile("gh", ["api", "user", "--jq", ".login"], execProbe, () => 1_000)
    await probe()
    execProbe.mockResolvedValue({ stdout: "new-account", stderr: "" })

    mocks.getConnectStatusImpl.mockImplementation(async () => ({
      github: { connected: true, detail: (await probe()).stdout },
    } as ConnectStatus))

    // Model an already-warm outer status cache: normal reads still see the
    // disconnected Google account, while an explicit refresh sees the change.
    mocks.allConnectorStatuses.mockImplementation(async (_root: string | null, force = false) => [
      { id: "google", state: force ? "connected" : "not_configured" },
    ])

    const refreshed = await recheckAllConnectionsState()

    expect(execProbe).toHaveBeenCalledTimes(2)
    expect(refreshed.connectStatus.github.detail).toBe("new-account")
    expect(mocks.allConnectorStatuses).toHaveBeenCalledWith(null, true)
    expect(refreshed.catalog.find((entry) => entry.slug === "google")?.connected).toBe(true)
    expect(refreshed.catalog.find((entry) => entry.slug === "stripe")?.keySaved).toBe(true)
    expect(refreshed.catalog.find((entry) => entry.slug === "figma")?.connected).toBe(true)
  })
})
