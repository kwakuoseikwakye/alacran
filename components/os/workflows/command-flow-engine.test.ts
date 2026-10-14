import { describe, it, expect } from "vitest"
import React from "react"
import {
  CommandFlowEngine,
  COMMAND_TRACKS,
  getCommandTrack,
  getFlowCommand,
} from "./command-flow-engine"

describe("CommandFlowEngine", () => {
  it("defines the 3 canonical operational tracks", () => {
    expect(COMMAND_TRACKS).toHaveLength(3)
    const titles = COMMAND_TRACKS.map((t) => t.title)
    expect(titles).toContain("Daily Cadence")
    expect(titles).toContain("Governance & Integrity")
    expect(titles).toContain("Engineering & Operations")
  })

  it("identifies gate-sensitive commands", () => {
    const dailyTrack = COMMAND_TRACKS.find((t) => t.id === "daily")
    expect(dailyTrack).toBeDefined()
    const verifyTrack = COMMAND_TRACKS.find((t) => t.id === "governance")
    const verifyCmd = verifyTrack?.commands.find((c) => c.id === "/verify")
    expect(verifyCmd?.gateRequired).toBe(false)
  })

  it("contains all canonical commands across tracks", () => {
    const dailyTrack = COMMAND_TRACKS.find((t) => t.id === "daily")
    const dailyIds = dailyTrack?.commands.map((c) => c.id)
    expect(dailyIds).toContain("/check-messages")
    expect(dailyIds).toContain("/check-inbox")
    expect(dailyIds).toContain("/check-notion")
    expect(dailyIds).toContain("/digest")

    const govTrack = COMMAND_TRACKS.find((t) => t.id === "governance")
    const govIds = govTrack?.commands.map((c) => c.id)
    expect(govIds).toContain("/verify")
    expect(govIds).toContain("/decision")
    expect(govIds).toContain("/retro")
    expect(govIds).toContain("/handoff")

    const engTrack = COMMAND_TRACKS.find((t) => t.id === "engineering")
    const engIds = engTrack?.commands.map((c) => c.id)
    expect(engIds).toContain("/accounting")
    expect(engIds).toContain("/orientation")
    expect(engIds).toContain("/triage-issue")
    expect(engIds).toContain("/define-company")
  })

  it("flags gated operations according to §6", () => {
    const govTrack = COMMAND_TRACKS.find((t) => t.id === "governance")
    const decisionCmd = govTrack?.commands.find((c) => c.id === "/decision")
    expect(decisionCmd?.gateRequired).toBe(true)
    expect(decisionCmd?.gateType).toBeDefined()

    const engTrack = COMMAND_TRACKS.find((t) => t.id === "engineering")
    const acctCmd = engTrack?.commands.find((c) => c.id === "/accounting")
    expect(acctCmd?.gateRequired).toBe(true)
    expect(acctCmd?.gateType).toContain("Money")

    const defineCmd = engTrack?.commands.find((c) => c.id === "/define-company")
    expect(defineCmd?.gateRequired).toBe(true)
  })

  it("supports track and command lookup helpers", () => {
    expect(getCommandTrack("daily")?.title).toBe("Daily Cadence")
    expect(getCommandTrack("governance")?.title).toBe("Governance & Integrity")
    expect(getCommandTrack("engineering")?.title).toBe("Engineering & Operations")
    expect(getCommandTrack("unknown")).toBeUndefined()

    expect(getFlowCommand("/verify")?.gateRequired).toBe(false)
    expect(getFlowCommand("verify")?.id).toBe("/verify")
    expect(getFlowCommand("/accounting")?.gateRequired).toBe(true)
    expect(getFlowCommand("non-existent")).toBeUndefined()
  })

  it("exports CommandFlowEngine component", () => {
    expect(typeof CommandFlowEngine).toBe("function")
    const element = React.createElement(CommandFlowEngine, {
      companyId: "test-company",
      companyRoot: "/tmp/test-company",
    })
    expect(element).toBeDefined()
    expect(element.props.companyId).toBe("test-company")
    expect(element.props.companyRoot).toBe("/tmp/test-company")
  })
})
