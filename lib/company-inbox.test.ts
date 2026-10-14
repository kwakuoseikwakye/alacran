import { describe, it, expect } from "vitest"
import { machineInboxOptions, readCompanyInboxSlot, isInboxSlot } from "./company-inbox"

describe("machineInboxOptions", () => {
  it("offers only the slots that actually have a user on this machine", () => {
    expect(
      machineInboxOptions({ INBOX_1_USER: "one@example.com", INBOX_3_USER: "three@example.com" })
    ).toEqual([
      { slot: 1, email: "one@example.com" },
      { slot: 3, email: "three@example.com" },
    ])
  })

  it("offers nothing when no inbox is set up", () => {
    expect(machineInboxOptions({})).toEqual([])
  })
})

describe("isInboxSlot", () => {
  it("accepts the four slots that exist and nothing else", () => {
    expect([1, 2, 3, 4].every(isInboxSlot)).toBe(true)
    expect(isInboxSlot(0)).toBe(false)
    expect(isInboxSlot(5)).toBe(false)
    expect(isInboxSlot("1")).toBe(false)
  })
})

describe("readCompanyInboxSlot", () => {
  const read = (body: string) => () => Promise.resolve(body)

  it("reads the chosen slot", async () => {
    expect(await readCompanyInboxSlot("/c", read("inbox: 2\n"))).toBe(2)
  })

  it("is null when nobody chose", async () => {
    expect(await readCompanyInboxSlot("/c", read("inbox: null\n"))).toBe(null)
  })

  it("is null for a missing file, unparseable YAML, or a slot that doesn't exist", async () => {
    expect(await readCompanyInboxSlot("/c", () => Promise.reject(new Error("ENOENT")))).toBe(null)
    expect(await readCompanyInboxSlot("/c", read("inbox: [unclosed\n"))).toBe(null)
    expect(await readCompanyInboxSlot("/c", read("inbox: 9\n"))).toBe(null)
  })
})
