import { describe, it, expect } from "vitest"
import {
  SocialAccountSchema,
  SocialAccountsFileSchema,
  SocialSnapshotSchema,
  SocialSnapshotsFileSchema,
} from "./social"

describe("SocialAccountSchema", () => {
  it("validates a social account record", () => {
    const fixture = {
      id: "x-alacran",
      platform: "x",
      handle: "@alacran_ai",
      url: "https://x.com/alacran_ai",
      followers: 12400,
      following: 150,
      last_sync: "2026-09-09",
      provenance: [
        { claim: "follower sync via api", said_by: "social-agent", said_on: "2026-09-09", source: "x-api" },
      ],
    }
    const parsed = SocialAccountSchema.parse(fixture)
    expect(parsed.id).toBe("x-alacran")
    expect(parsed.followers).toBe(12400)
    expect(parsed.platform).toBe("x")
  })

  it("fails on negative followers", () => {
    const fixture = {
      id: "bad",
      platform: "linkedin",
      handle: "alacran",
      url: "https://linkedin.com/company/alacran",
      followers: -50,
      last_sync: "2026-09-01",
    }
    expect(() => SocialAccountSchema.parse(fixture)).toThrow()
  })

  it("validates accounts file schema", () => {
    const file = {
      schema_version: 1,
      records: [
        {
          id: "li-alacran",
          platform: "linkedin",
          handle: "alacran",
          url: "https://linkedin.com/company/alacran",
          followers: 4500,
          last_sync: "2026-09-08",
        },
      ],
    }
    const parsed = SocialAccountsFileSchema.parse(file)
    expect(parsed.records).toHaveLength(1)
  })
})

describe("SocialSnapshotSchema", () => {
  it("validates a snapshot record", () => {
    const snap = {
      id: "snap-1",
      account_id: "x-alacran",
      date: "2026-09-01",
      followers: 12000,
      impressions: 85000,
      engagements: 4200,
      posts_count: 12,
    }
    const parsed = SocialSnapshotSchema.parse(snap)
    expect(parsed.account_id).toBe("x-alacran")
    expect(parsed.impressions).toBe(85000)
  })

  it("validates snapshots file schema", () => {
    const file = {
      schema_version: 1,
      records: [
        { id: "s1", account_id: "x-alacran", date: "2026-09-01", followers: 12000 },
        { id: "s2", account_id: "x-alacran", date: "2026-09-08", followers: 12400 },
      ],
    }
    const parsed = SocialSnapshotsFileSchema.parse(file)
    expect(parsed.records).toHaveLength(2)
  })

  it("normalizes timestamp and platform fields if date and account_id are omitted", () => {
    const raw = {
      id: "snap-raw",
      timestamp: "2026-09-01T12:00:00Z",
      platform: "x",
      followers: 3100,
    }
    const parsed = SocialSnapshotSchema.parse(raw)
    expect(parsed.account_id).toBe("x-alacran")
    expect(parsed.date).toBe("2026-09-01")
    expect(parsed.followers).toBe(3100)
  })
})

