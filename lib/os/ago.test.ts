import { describe, expect, it } from "vitest"
import { ago } from "./ago"

const NOW = new Date("2026-09-30T12:00:00Z")
const at = (iso: string) => Math.floor(Date.parse(iso) / 1000)

describe("ago", () => {
  it("says a plain relative time", () => {
    expect(ago(at("2026-09-30T11:59:40Z"), NOW)).toBe("1 minute ago")
    expect(ago(at("2026-09-30T11:00:00Z"), NOW)).toBe("1 hour ago")
    expect(ago(at("2026-09-29T12:00:00Z"), NOW)).toBe("yesterday")
    expect(ago(at("2026-09-28T12:00:00Z"), NOW)).toBe("2 days ago")
  })

  it("never says a time in the future", () => {
    expect(ago(at("2026-10-05T12:00:00Z"), NOW)).toBe("1 minute ago")
  })
})
