import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, it, expect } from "vitest"
import { SparkIcon } from "./spark-icon"
import { SystemCard } from "./system-card"
import { AgentPill, AgentNodePill } from "./agent-pill"
import { CANONICAL_AGENTS } from "@/lib/os/brain/canonical"

describe("Org Components", () => {
  it("renders SparkIcon", () => {
    const sparkHtml = renderToStaticMarkup(React.createElement(SparkIcon, { size: 30, shade: "#00ffaa" }))
    expect(sparkHtml).toContain("svg")
    expect(sparkHtml).toContain("#00ffaa")
  })


  it("renders SystemCard", () => {
    const html = renderToStaticMarkup(
      React.createElement(SystemCard, {
        href: "/c/acme/brain",
        title: "G-Brain",
        caption: "Knowledge core",
      })
    )
    expect(html).toContain("G-Brain")
    expect(html).toContain("Knowledge core")
    expect(html).toContain("/c/acme/brain")
  })

  it("renders AgentPill and AgentNodePill", () => {
    const agent = CANONICAL_AGENTS[1]
    const pillHtml = renderToStaticMarkup(React.createElement(AgentPill, { agent }))
    expect(pillHtml).toContain(agent.name)

    const node = { agent, children: [] }
    const nodeHtml = renderToStaticMarkup(React.createElement(AgentNodePill, { node, depth: 1 }))
    expect(nodeHtml).toContain(agent.name)
  })
})
