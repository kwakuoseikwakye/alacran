import { describe, expect, it } from "vitest"
import { micResetMessage, type MicStatus } from "./desktop-mic"

describe("micResetMessage", () => {
  it("sends a granted user to the orb, not to Settings", () => {
    expect(micResetMessage("granted")).toContain("Press the core")
  })

  it("asks for a relaunch when the reset landed but no prompt appeared", () => {
    // The app is in no Privacy list at all in this state, so the message must
    // NOT point at one — that is an empty page and a dead end.
    const message = micResetMessage("not-determined")
    expect(message).toContain("Quit Alacrán")
    expect(message).not.toContain("Privacy")
  })

  it("points a real refusal at Privacy & Security", () => {
    for (const status of ["denied", "restricted", "unknown"] as MicStatus[]) {
      expect(micResetMessage(status)).toContain("Privacy & Security")
    }
  })
})
