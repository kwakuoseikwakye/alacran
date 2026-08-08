import { describe, it, expect } from "vitest"
import { buildGuideSteps } from "./company-guide-steps"

describe("buildGuideSteps", () => {
  it("always includes Skills and Avatar, regardless of flags", () => {
    const steps = buildGuideSteps({})
    const labels = steps.map((s) => s.label)
    expect(labels).toContain("Skills")
    expect(labels).toContain("Avatar")
    expect(labels).toHaveLength(2)
  })

  it("includes every flagged step, in a stable order, and nothing else", () => {
    const steps = buildGuideSteps({
      showOpenTerminalButton: true,
      showBackupButton: true,
      showOwnershipButton: true,
      showAiExecutorPicker: true,
      showGoogleAccountsPicker: true,
      removable: true,
      showEditCompanyButton: true,
    })
    expect(steps.map((s) => s.label)).toEqual([
      "Set up / edit company info",
      "Open in Terminal",
      "Skills",
      "Back up to GitHub",
      "View ownership",
      "AI executor",
      "Inbox accounts",
      "Remove",
      "Avatar",
    ])
  })

  it("shows the company-info step if either the create or edit flag is set", () => {
    expect(buildGuideSteps({ showSetupCompanyButton: true }).map((s) => s.label)).toContain(
      "Set up / edit company info"
    )
    expect(buildGuideSteps({ showEditCompanyButton: true }).map((s) => s.label)).toContain(
      "Set up / edit company info"
    )
  })

  it("never renders a step whose flag is false", () => {
    const steps = buildGuideSteps({ showOpenTerminalButton: false, showBackupButton: false })
    expect(steps.map((s) => s.label)).not.toContain("Open in Terminal")
    expect(steps.map((s) => s.label)).not.toContain("Back up to GitHub")
  })

  it("every step has non-empty label and blurb text", () => {
    const steps = buildGuideSteps({
      showOpenTerminalButton: true,
      showSetupCompanyButton: true,
      showBackupButton: true,
      showOwnershipButton: true,
      showAiExecutorPicker: true,
      showGoogleAccountsPicker: true,
      removable: true,
    })
    for (const step of steps) {
      expect(step.label.length).toBeGreaterThan(0)
      expect(step.blurb.length).toBeGreaterThan(0)
    }
  })
})
