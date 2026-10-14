import { describe, it, expect } from "vitest"
import { Dot, dotState, Badge, Label, SectionHead } from "./terminal"

describe("terminal primitives", () => {
  it("dotState maps statuses accurately and Dot renders element", () => {
    expect(dotState("connected")).toBe("ok")
    expect(dotState("active")).toBe("ok")
    expect(dotState("warn")).toBe("warn")
    expect(dotState("error")).toBe("err")
    expect(dotState("not_configured")).toBe("off")
    expect(dotState("unknown")).toBe("off")

    const dot = Dot({ state: "connected", pulse: true })
    expect(dot).toBeDefined()
  })

  it("Badge renders with correct tone and ghost mode", () => {
    const defaultBadge = Badge({ children: "test" })
    expect(defaultBadge.props.className).toContain("text-os-muted")

    const ghostBadge = Badge({ tone: "ok", ghost: true, children: "live" })
    expect(ghostBadge.props.className).toContain("border-dashed")
    expect(ghostBadge.props.className).toContain("text-os-ok")
  })

  it("Label and SectionHead render labels and rules", () => {
    const label = Label({ children: "TEST", count: 5, rule: true })
    expect(label.props.className).toContain("font-mono")

    const sectionHead = SectionHead({ label: "Accounts", count: "3 total", link: "Docs", href: "/docs" })
    expect(sectionHead.props.className).toContain("mb-3")
  })
})
