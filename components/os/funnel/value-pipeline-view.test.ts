import { describe, it, expect } from "vitest"
import React from "react"
import { renderToString } from "react-dom/server"
import { ValuePipelineView } from "./value-pipeline-view"

let lastRenderedHtml = ""

function render(node: React.ReactElement) {
  lastRenderedHtml = renderToString(node)
  return {
    html: lastRenderedHtml,
  }
}

const screen = {
  getByText: (text: string | RegExp) => {
    const isMatch = typeof text === "string" ? lastRenderedHtml.includes(text) : text.test(lastRenderedHtml)
    if (!isMatch) {
      throw new Error(`Unable to find text: ${text}`)
    }
    return { text }
  },
  getByRole: (role: string, options?: { name?: RegExp | string }) => {
    if (role === "link") {
      const links = Array.from(lastRenderedHtml.matchAll(/<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g))
      if (links.length === 0) throw new Error("No link found")
      if (options?.name) {
        const found = links.find((l) =>
          typeof options.name === "string" ? l[2].includes(options.name) : options.name!.test(l[2])
        )
        if (!found) throw new Error(`Link name did not match ${options.name}`)
        return {
          getAttribute: (attr: string) => (attr === "href" ? found[1] : null),
        }
      }
      return {
        getAttribute: (attr: string) => (attr === "href" ? links[0][1] : null),
      }
    }
    throw new Error(`Unsupported role: ${role}`)
  },
}

describe("ValuePipelineView", () => {
  it("renders the 3-column value pipeline and declared bottleneck", () => {
    render(
      React.createElement(ValuePipelineView, {
        companyId: "test-co",
        domain: "Test Logistics",
        acquisition: [{ channel: "Direct Referrals", notes: "Word of mouth" }],
        valueFlow: {
          input: "Freight manifests and invoices",
          transform: "Automated customs clearance validation",
          output: "Cleared customs document and driver routing",
        },
        bottleneck: "Customs manual verification takes 4 hours",
        segments: [{ id: "carriers", name: "Regional Freight Carriers" }],
      })
    )

    expect(screen.getByText("01 Inbound / Acquisition")).toBeDefined()
    expect(screen.getByText("02 Operations / Transform")).toBeDefined()
    expect(screen.getByText("03 Delivered Value / Output")).toBeDefined()
    expect(screen.getByText("Customs manual verification takes 4 hours")).toBeDefined()
  })

  it("renders acquisition channels and customer segments", () => {
    render(
      React.createElement(ValuePipelineView, {
        companyId: "test-co",
        domain: "Developer Tooling",
        acquisition: [
          { channel: "GitHub Releases", notes: "Direct downloads" },
          { channel: "Product Website", notes: "Organic search" },
        ],
        valueFlow: {
          input: "Source repositories",
          transform: "Agentic compilation",
          output: "Release artifacts",
        },
        bottleneck: "Code signing certificate renewal",
        segments: [
          { id: "devs", name: "Solo Developers" },
          { id: "teams", name: "Engineering Teams" },
        ],
      })
    )

    expect(screen.getByText("GitHub Releases")).toBeDefined()
    expect(screen.getByText("Direct downloads")).toBeDefined()
    expect(screen.getByText("Product Website")).toBeDefined()
    expect(screen.getByText("Solo Developers")).toBeDefined()
    expect(screen.getByText("Engineering Teams")).toBeDefined()
    expect(screen.getByText("Developer Tooling")).toBeDefined()
  })

  it("renders primary bottleneck card with quick link to record a decision with /decision", () => {
    render(
      React.createElement(ValuePipelineView, {
        companyId: "alacran",
        domain: "Autonomous AI Operations",
        acquisition: [],
        valueFlow: {
          input: "Raw company context",
          transform: "Automated reasoning",
          output: "Approved operational diffs",
        },
        bottleneck: "CI/CD token permissions are blocked",
        segments: [],
      })
    )

    expect(screen.getByText("CI/CD token permissions are blocked")).toBeDefined()
    const decisionLink = screen.getByRole("link", { name: /decision/i })
    expect(decisionLink).toBeDefined()
    expect(decisionLink.getAttribute("href")).toContain("/decision")
  })

  it("renders step-based array value flow gracefully across columns", () => {
    render(
      React.createElement(ValuePipelineView, {
        companyId: "test-co",
        domain: "Cross Platform Apps",
        acquisition: [{ channel: "App Store" }],
        valueFlow: [
          { step: "Download and install package", owner: "operator" },
          { step: "Connect AI coding agent", owner: "operator" },
          { step: "Publish cross-platform release updates", owner: "lead" },
        ],
        bottleneck: "Manual notarization",
        segments: [{ id: "smb", name: "SMB Operators" }],
      })
    )

    expect(screen.getByText("01 Inbound / Acquisition")).toBeDefined()
    expect(screen.getByText("02 Operations / Transform")).toBeDefined()
    expect(screen.getByText("03 Delivered Value / Output")).toBeDefined()
    expect(screen.getByText("Download and install package")).toBeDefined()
    expect(screen.getByText("Connect AI coding agent")).toBeDefined()
    expect(screen.getByText("Publish cross-platform release updates")).toBeDefined()
  })

  it("renders ontology: company.yaml button to inspect raw ontology", () => {
    render(
      React.createElement(ValuePipelineView, {
        companyId: "alacran",
        domain: "Alacrán Platform",
        acquisition: [],
        valueFlow: {
          input: "Raw inputs",
          transform: "Transform",
          output: "Outputs",
        },
        rawYaml: "meta:\n  version: 1\n",
        segments: [],
      })
    )

    expect(screen.getByText("ontology: company.yaml")).toBeDefined()
  })
})
