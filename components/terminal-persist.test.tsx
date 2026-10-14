import { describe, it, expect, vi } from "vitest"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
globalThis.React = React

let pathname = "/c/acme/dashboard"
vi.mock("next/navigation", () => ({ usePathname: () => pathname }))
vi.mock("@/components/terminal-workspace", () => ({
  TerminalWorkspace: () => React.createElement("div", { "data-testid": "terminal-workspace" }),
}))

import { TerminalPersist } from "./terminal-persist"

describe("TerminalPersist", () => {
  // Mounting the workspace opens an assistant session when none is running, so
  // mounting it on every company page started a real agent on a visit to Home.
  it("does not mount the terminal workspace on a non-terminal page", () => {
    pathname = "/c/acme/dashboard"
    const html = renderToStaticMarkup(<TerminalPersist companyId="acme" companyName="Acme" />)
    expect(html).not.toContain("terminal-workspace")
  })

  it("mounts it on the terminal page", () => {
    pathname = "/c/acme/terminal"
    const html = renderToStaticMarkup(<TerminalPersist companyId="acme" companyName="Acme" />)
    expect(html).toContain("terminal-workspace")
  })
})
