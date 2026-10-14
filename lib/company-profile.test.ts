import { describe, it, expect } from "vitest"
import { readProfile } from "./company-profile"

describe("readProfile", () => {
  // The starter template ships one placeholder entry per list. Counting them
  // told a brand-new company "4 of 4 essentials added" and printed the raw
  // "<<TODO: ...>>" text as if it were the owner's answer.
  it("treats starter placeholders as not added yet", () => {
    const starter = [
      "customer:",
      "  segments:",
      `    - name: "<<TODO: what you'd call this group out loud>>"`,
      "product:",
      "  offerings:",
      `    - name: "<<TODO: what you sell>>"`,
      "org:",
      "  roles:",
      `    - name: "<<TODO: role, not person's name>>"`,
    ].join("\n")

    expect(readProfile(starter)).toEqual({ customers: [], offerings: [], roles: [] })
  })

  it("keeps entries the owner actually wrote", () => {
    expect(readProfile("customer:\n  segments:\n    - name: Wedding couples\n").customers).toEqual(["Wedding couples"])
  })
})
