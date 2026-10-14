import { describe, expect, test } from "vitest"
import {
  INTEGRATIONS,
  INTEGRATION_CATEGORIES,
  connectKeysFor,
  integrationsByCategory,
  integrationsByMechanism,
  connectionCatalog,
} from "./integrations-catalog"

describe("integrations-catalog.ts", () => {
  test("connectKeysFor returns declared envKeys or defaults to <SLUG>_API_KEY", () => {
    const notion = INTEGRATIONS.find((i) => i.slug === "notion")!
    expect(connectKeysFor(notion)).toEqual(["NOTION_API_KEY"])

    const whatsapp = INTEGRATIONS.find((i) => i.slug === "whatsapp")!
    expect(connectKeysFor(whatsapp)).toEqual([]) // Guidance only

    const discord = INTEGRATIONS.find((i) => i.slug === "discord")!
    expect(connectKeysFor(discord)).toEqual(["DISCORD_API_KEY"])
  })

  test("MCP tools return empty envKeys because they connect via .mcp.json directly", () => {
    const figma = INTEGRATIONS.find((i) => i.slug === "figma")!
    expect(figma.mechanism).toBe("mcp")
    expect(connectKeysFor(figma)).toEqual([])

    const canva = INTEGRATIONS.find((i) => i.slug === "canva")!
    expect(canva.mechanism).toBe("mcp")
    expect(connectKeysFor(canva)).toEqual([])

    const vercel = INTEGRATIONS.find((i) => i.slug === "vercel")!
    expect(vercel.mechanism).toBe("mcp")
    expect(connectKeysFor(vercel)).toEqual([])
  })

  test("consolidates Google sub-apps into unified Google Cloud & Workspace connector via gog CLI", () => {
    const google = INTEGRATIONS.find((i) => i.slug === "google")!
    expect(google).toBeDefined()
    expect(google.mechanism).toBe("cli")
    expect(google.tagline).toContain("Gmail")

    // Sub-apps are not separate cards
    const slugs = INTEGRATIONS.map((i) => i.slug)
    expect(slugs).not.toContain("gmail")
    expect(slugs).not.toContain("googlecalendar")
    expect(slugs).not.toContain("googlesheets")
    expect(slugs).not.toContain("googledocs")
    expect(slugs).not.toContain("googledrive")
    expect(slugs).not.toContain("googlemeet")
  })

  test("integrationsByMechanism correctly groups tools by execution tier", () => {
    const mcpTools = integrationsByMechanism("mcp")
    expect(mcpTools.map((t) => t.slug)).toEqual(
      expect.arrayContaining(["figma", "canva", "vercel", "lovable", "docusign", "freee"])
    )

    const cliTools = integrationsByMechanism("cli")
    expect(cliTools.map((t) => t.slug)).toEqual(
      expect.arrayContaining(["google", "github", "beeper", "claude-code", "antigravity"])
    )

    const apiKeyTools = integrationsByMechanism("api-key")
    expect(apiKeyTools.map((t) => t.slug)).toEqual(
      expect.arrayContaining(["stripe", "notion", "attio", "hubspot", "beehiiv"])
    )
  })

  test("integrationsByCategory organizes entries into canonical category buckets", () => {
    const categories = integrationsByCategory()
    for (const cat of INTEGRATION_CATEGORIES) {
      const items = categories.get(cat)
      if (items) {
        expect(items.length).toBeGreaterThan(0)
        items.forEach((item) => expect(item.category).toBe(cat))
      }
    }
  })

  test("connectionCatalog merges real connector statuses and stored keys honestly", () => {
    const statuses = [
      { id: "notion", state: "connected" },
      { id: "slack", state: "not_configured" },
    ]
    const savedEnv = {
      NOTION_API_KEY: "secret_val",
      DISCORD_API_KEY: "disc_val",
    }
    const mcpServers = [{ name: "figma", url: "https://mcp.figma.com/mcp" }]

    const catalog = connectionCatalog(statuses, savedEnv, mcpServers)

    // An API key is never tested against its vendor, so even a connector that
    // reports "connected" (a key exists) is only ever "Key saved".
    const notion = catalog.find((c) => c.slug === "notion")!
    expect(notion.connected).toBe(false)
    expect(notion.keySaved).toBe(true)

    const slack = catalog.find((c) => c.slug === "slack")!
    expect(slack.connected).toBe(false)
    expect(slack.keySaved).toBe(false)

    // Discord has no connectorId, so connected must be false, but keySaved is true
    const discord = catalog.find((c) => c.slug === "discord")!
    expect(discord.connected).toBe(false)
    expect(discord.keySaved).toBe(true)

    // Figma is in mcpServers, so connected is true
    const figma = catalog.find((c) => c.slug === "figma")!
    expect(figma.connected).toBe(true)
  })
})

describe("every MCP entry declares the endpoint it will write", () => {
  /**
   * The modal used to fall back to `https://mcp.<slug>.com/mcp` when an entry
   * declared none, write that into the company's `.mcp.json`, and report
   * success. `linear` and `sentry` shipped that way.
   *
   * An invented MCP endpoint is not a broken link. If the host does not exist
   * today it can be registered by someone else tomorrow, and every install that
   * pressed the button then has an agent pointed at a stranger's MCP server —
   * which serves TOOL DEFINITIONS. That is a supply-chain exposure, and it is
   * the same class of mistake `lib/mcp-presets.ts` already documents paying
   * for: "an MCP endpoint is exactly the kind of value that looks plausible
   * when invented."
   *
   * So: no declared URL, no MCP mechanism. Verify the endpoint (the DCR curl
   * pair in mcp-presets.ts) before adding one back.
   */
  test("no entry claims mechanism 'mcp' without an mcpUrl", () => {
    const guessed = INTEGRATIONS.filter((i) => i.mechanism === "mcp" && !i.mcpUrl).map((i) => i.slug)
    expect(guessed).toEqual([])
  })

  test("every declared mcpUrl parses as https", () => {
    // Deliberately NOT "the host must not look like mcp.<slug>.com" — that was
    // the first version of this test and it rejected mcp.vercel.com, which is
    // the real, verified Vercel endpoint. The fallback's problem was never the
    // URL's shape, it was that nobody declared it.
    for (const entry of INTEGRATIONS.filter((i) => i.mechanism === "mcp")) {
      expect(new URL(entry.mcpUrl as string).protocol).toBe("https:")
    }
  })
})
