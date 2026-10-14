import { describe, it, expect } from "vitest"
import {
  buildSocialViewModel,
  formatFollowers,
  formatPct,
  getPlatformDetail,
  type SocialPlatformModel,
} from "./social-adapter"
import type { SocialAccount, SocialSnapshot } from "@/lib/os/schemas/social"

describe("social-adapter", () => {
  const sampleAccounts: SocialAccount[] = [
    {
      id: "acc-x",
      platform: "x",
      handle: "@acmeco",
      url: "https://x.com/acmeco",
      followers: 12500,
      last_sync: "2026-09-10T12:00:00Z",
    },
    {
      id: "acc-li",
      platform: "linkedin",
      handle: "acme-corp",
      url: "https://linkedin.com/company/acme-corp",
      followers: 4800,
      last_sync: "2026-09-10T12:00:00Z",
    },
    {
      id: "acc-yt",
      platform: "youtube",
      handle: "AcmeEngineering",
      url: "https://youtube.com/@AcmeEngineering",
      followers: 8200,
      last_sync: "2026-09-10T12:00:00Z",
    },
  ]

  const sampleSnapshots: SocialSnapshot[] = [
    {
      id: "s-1",
      account_id: "acc-x",
      date: "2026-09-03",
      followers: 12000,
      impressions: 45000,
      engagements: 3200,
      posts_count: 5,
    },
    {
      id: "s-2",
      account_id: "acc-x",
      date: "2026-09-10",
      followers: 12500,
      impressions: 52000,
      engagements: 4100,
      posts_count: 6,
    },
  ]

  it("formats follower counts and growth percentages cleanly", () => {
    expect(formatFollowers(12500)).toBe("12.5k")
    expect(formatFollowers(450)).toBe("450")
    expect(formatFollowers(1200000)).toBe("1.2m")
    expect(formatPct(4.16)).toBe("+4.2%")
    expect(formatPct(-2.5)).toBe("−2.5%")
    expect(formatPct(null)).toBe("—")
  })

  it("buildSocialViewModel computes reach, growth, platforms, and activity points", () => {
    const model = buildSocialViewModel({
      accounts: sampleAccounts,
      snapshots: sampleSnapshots,
      connectors: [
        { id: "x", label: "X", status: "connected" },
        { id: "linkedin", label: "LinkedIn", status: "not_configured" },
      ],
      now: new Date("2026-09-11T12:00:00Z"),
    })

    expect(model.totalReach).toBe(25500)
    expect(model.platforms.length).toBe(3)
    const xPlatform = model.platforms.find((p: SocialPlatformModel) => p.platform === "x")
    expect(xPlatform).toBeDefined()
    expect(xPlatform?.growth.d7).toBeCloseTo(4.16, 1)
    expect(model.pieItems.length).toBe(3)
    expect(model.statStrip.audienceTotal).toBe(25500)
    expect(model.connectors.length).toBe(2)
  })

  it("getPlatformDetail resolves detail, followers, snapshots, and growth windows", () => {
    const detail = getPlatformDetail(sampleAccounts, sampleSnapshots, "x")
    expect(detail).not.toBeNull()
    expect(detail?.account.handle).toBe("@acmeco")
    expect(detail?.followers).toBe(12500)
    expect(detail?.snapshots).toHaveLength(2)
    expect(detail?.growth.d7).toBeCloseTo(4.2, 1)
    expect(detail?.growth.allTime).toBeCloseTo(4.2, 1)
  })

  it("getPlatformDetail returns null for unknown platform", () => {
    const detail = getPlatformDetail(sampleAccounts, sampleSnapshots, "bluesky")
    expect(detail).toBeNull()
  })
})
