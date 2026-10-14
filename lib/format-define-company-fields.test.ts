import { describe, it, expect } from "vitest"
import { formatDefineCompanyFields } from "./format-define-company-fields"

describe("formatDefineCompanyFields", () => {
  it("passes domain and bottleneck through unchanged", () => {
    const result = formatDefineCompanyFields({
      domain: "We sell widgets",
      stakeholders: [],
      valueFlow: { input: "", transform: "", output: "" },
      bottleneck: "Manual invoicing",
    })
    expect(result.domain).toBe("We sell widgets")
    expect(result.bottleneck).toBe("Manual invoicing")
  })

  it("formats stakeholders into one line each, dropping incomplete rows", () => {
    const result = formatDefineCompanyFields({
      domain: "d",
      stakeholders: [
        { role: "Client", position: "Pays for the service" },
        { role: "", position: "incomplete, should be dropped" },
        { role: "Support rep", position: "Handles tickets" },
      ],
      valueFlow: { input: "", transform: "", output: "" },
      bottleneck: "b",
    })
    expect(result.stakeholders).toBe("- Client: Pays for the service\n- Support rep: Handles tickets")
  })

  it("formats valueFlow into labeled lines", () => {
    const result = formatDefineCompanyFields({
      domain: "d",
      stakeholders: [],
      valueFlow: { input: "Raw orders", transform: "Assemble widgets", output: "Shipped products" },
      bottleneck: "b",
    })
    expect(result.valueFlow).toBe("Input: Raw orders\nTransform: Assemble widgets\nOutput: Shipped products")
  })
})
