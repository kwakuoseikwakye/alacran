import { describe, it, expect } from "vitest"
import React, { type ReactElement } from "react"
// Classic JSX transform (this repo's vitest config has no React plugin) needs
// `React` in global scope — same fix app/c/[companyId]/layout.test.ts uses.
globalThis.React = React

import { AgentCard } from "./agent-card"
import type { Agent } from "@/lib/adapters/types"
import type { CredentialRowFlag } from "@/lib/agent-card-flags"

/**
 * `AgentCard` is a plain (sync) function component — calling it directly
 * returns a React element tree (an object graph), never renders. Enough to
 * check whether a `CompanyCredentialRow` element sits inside an
 * `AdvancedOnly` wrapper, without jsdom or a real renderer.
 *
 * The walk follows every prop value that looks like an element or an array
 * of them, not just `children` — `Action`'s `node` prop is where the actual
 * row lives, and `AdvancedOnly` wraps the `Action`, not the row directly.
 */
type ElementLike = ReactElement & { type: unknown; props?: Record<string, unknown> }

function isElementLike(value: unknown): value is ElementLike {
  return !!value && typeof value === "object" && "type" in (value as object) && "props" in (value as object)
}

function walk(node: unknown, insideAdvancedOnly: boolean, visit: (el: ElementLike, insideAdvancedOnly: boolean) => void) {
  if (Array.isArray(node)) {
    for (const item of node) walk(item, insideAdvancedOnly, visit)
    return
  }
  if (!isElementLike(node)) return
  const isAdvancedOnly = typeof node.type === "function" && (node.type as { name?: string }).name === "AdvancedOnly"
  const nowInside = insideAdvancedOnly || isAdvancedOnly
  visit(node, nowInside)
  for (const value of Object.values(node.props ?? {})) {
    if (Array.isArray(value) || isElementLike(value)) walk(value, nowInside, visit)
  }
}

/** true = rendered outside AdvancedOnly (visible in simple mode); false =
 *  behind Advanced; undefined = the row isn't in the tree at all. */
function credentialRowVisibility(root: unknown, credentialKey: string): boolean | undefined {
  let found: boolean | undefined
  walk(root, false, (el, insideAdvancedOnly) => {
    if (
      typeof el.type === "function" &&
      (el.type as { name?: string }).name === "CompanyCredentialRow" &&
      (el.props as { credentialKey?: string } | undefined)?.credentialKey === credentialKey
    ) {
      found = !insideAdvancedOnly
    }
  })
  return found
}

const AGENT: Agent = { id: "acme", name: "Acme", rootPath: "/companies/acme", kind: "command-set" }

function rows(overrides: Partial<Record<string, "company" | "machine" | "unset">>): CredentialRowFlag[] {
  const labels: Record<string, string> = { STRIPE_SECRET_KEY: "Stripe", SLACK_BOT_TOKEN: "Slack", NOTION_API_KEY: "Notion" }
  return Object.entries(labels).map(([credentialKey, label]) => ({
    credentialKey,
    label,
    source: overrides[credentialKey] ?? "unset",
  }))
}

describe("AgentCard credential row visibility", () => {
  it("keeps a row visible in simple mode once the company has made it its own", () => {
    const element = AgentCard({
      agent: AGENT,
      latestActivity: null,
      error: null,
      integrationStatus: "none",
      credentialRows: rows({ STRIPE_SECRET_KEY: "company", SLACK_BOT_TOKEN: "unset", NOTION_API_KEY: "machine" }),
    })

    expect(credentialRowVisibility(element, "STRIPE_SECRET_KEY")).toBe(true)
    expect(credentialRowVisibility(element, "SLACK_BOT_TOKEN")).toBe(false)
    expect(credentialRowVisibility(element, "NOTION_API_KEY")).toBe(false)
  })

  it("hides every row behind Advanced until a company sets one of its own", () => {
    const element = AgentCard({
      agent: AGENT,
      latestActivity: null,
      error: null,
      integrationStatus: "none",
      credentialRows: rows({}),
    })

    expect(credentialRowVisibility(element, "STRIPE_SECRET_KEY")).toBe(false)
    expect(credentialRowVisibility(element, "SLACK_BOT_TOKEN")).toBe(false)
    expect(credentialRowVisibility(element, "NOTION_API_KEY")).toBe(false)
  })
})
