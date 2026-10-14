import type { Agent } from "./types"

const MCP_SLUGS = new Set([
  "attio",
  "notion",
  "slack",
  "gbrain",
  "obsidian",
  "miro",
  "playwright",
  "figma",
  "serena",
  "context7",
  "zernio",
  "arcads",
  "wispr",
  "higgsfield",
  "canva",
  "gmail",
  "google-calendar",
  "calendar",
  "vercel",
])

export type WikiServer = { slug: string; name: string; mcp: boolean }
export type AgentWiki = {
  id: string
  name: string
  role: string
  model: string
  path: string
  files: string[]
  servers: WikiServer[]
}

export function prettifySlug(slug: string): string {
  return slug
    .split(/[-_]/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ")
}

export function buildAgentWiki(agent: Agent): AgentWiki {
  return {
    id: agent.id,
    name: agent.name,
    role: agent.role,
    model: agent.model,
    path: `brain-store/agents/${agent.id}`,
    files: ["system.md", "playbook.md", "memory.md", `${agent.id}.config.md`],
    servers: (agent.tools ?? []).map((slug) => ({
      slug,
      name: prettifySlug(slug),
      mcp: MCP_SLUGS.has(slug),
    })),
  }
}

const TOOL_SUMMARY: Record<string, string> = {
  attio: "CRM of record — companies, people, and deals.",
  gbrain: "The G-Brain CLI — hybrid search over the markdown brain-store.",
  "brain-store": "Local markdown knowledge base; the source of truth G-Brain syncs from.",
  supabase: 'Postgres + pgvector "second brain" holding chunked embeddings.',
  "comms-feed": "Unified inbox feed — WhatsApp, email, Slack, calendar in one stream.",
  zernio: "Social posting + audience analytics across platforms.",
  notion: "Docs + databases workspace.",
  obsidian: "Local vault, incl. conversation archive.",
  stripe: "Payments + balance + charges.",
  slack: "Team channels, read + post via bot.",
}

export type ToolWiki = {
  slug: string
  name: string
  mcp: boolean
  kind: string
  path: string
  summary: string
  usedBy: string[]
}

export function buildToolWiki(slug: string, usedBy: string[] = []): ToolWiki {
  const mcp = MCP_SLUGS.has(slug)
  const name = prettifySlug(slug)
  return {
    slug,
    name,
    mcp,
    kind: mcp ? "MCP server" : "integration",
    path: `brain-store/tools/${slug}.md`,
    summary:
      TOOL_SUMMARY[slug] ??
      `${name} — wired in through the ${mcp ? "MCP server" : "tool"} layer.`,
    usedBy,
  }
}
