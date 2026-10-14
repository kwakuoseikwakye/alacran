import type { ContentItem } from "@/lib/os/schemas/content"
import type { DepartmentConnector } from "@/lib/os/departments/connectors"

export function prettyTool(slug: string): string {
  return slug
    .split(/[-_]/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ")
}

export function agoFrom(iso?: string | null): string {
  if (!iso) return ""
  const ms = Date.now() - new Date(iso).getTime()
  if (!Number.isFinite(ms) || ms < 0) return ""
  const mins = Math.round(ms / 60_000)
  if (mins < 60) return `${Math.max(1, mins)}m`
  const hrs = Math.round(mins / 60)
  if (hrs < 48) return `${hrs}h`
  return `${Math.round(hrs / 24)}d`
}

export type ContentAgentModel = {
  id: string
  name: string
  role: string
  model: string
  status: "active" | "available" | "idle"
  description: string
  tools: string[]
  isLead: boolean
}

export type ContentPipelineItem = {
  id: string
  platform: string
  caption: string
  url: string | null
  ago: string
  status: string
}

export type LeadMagnetItem = {
  id: string
  title: string
  url: string
  subscribers: number
  status: "live" | "draft"
}

export type ContentViewModel = {
  crew: ContentAgentModel[]
  pipeline: ContentPipelineItem[]
  leadMagnets: LeadMagnetItem[]
  activeDays: number
  connectors: DepartmentConnector[]
  isLive: boolean
}

export function buildContentViewModel(input: {
  items: ContentItem[]
  connectors: DepartmentConnector[]
  companyId: string
  now?: Date
}): ContentViewModel {
  // Define content agents roster
  const crew: ContentAgentModel[] = [
    {
      id: "agent-content-director",
      name: "Content Director",
      role: "Lead Strategist & Editor",
      model: "claude-3-7-sonnet",
      status: "active",
      description:
        "Orchestrates cross-platform distribution, hooks research, editorial calendars, and multi-channel publication.",
      tools: ["web_search", "draft_post", "analytics_query", "generate_image"],
      isLead: true,
    },
    {
      id: "agent-writer",
      name: "Ghostwriter Agent",
      role: "Long-form & Newsletters",
      model: "claude-3-5-sonnet",
      status: "active",
      description:
        "Drafts in-depth technical breakdowns, case studies, changelog updates, and high-conversion newsletters.",
      tools: ["read_url", "markdown_writer", "citation_verify"],
      isLead: false,
    },
    {
      id: "agent-social-scout",
      name: "Trend & Hook Scout",
      role: "Audience Intelligence",
      model: "gemini-2.0-flash",
      status: "available",
      description:
        "Monitors high-performing community discussions, competitor signals, and viral talking points.",
      tools: ["rss_monitor", "sentiment_analysis", "social_listen"],
      isLead: false,
    },
  ]

  // Pipeline items from records/content/items.yaml
  const pipeline: ContentPipelineItem[] = input.items.map((item) => ({
    id: item.id,
    platform: item.channel,
    caption: item.title,
    url: item.url ?? null,
    ago: agoFrom(item.publish_date),
    status: item.status,
  }))

  // Lead magnets from records
  const leadMagnets: LeadMagnetItem[] = input.items
    .filter(
      (item) =>
        item.channel === "landing_page" ||
        item.type === "documentation" ||
        item.title.toLowerCase().includes("cheat sheet") ||
        item.title.toLowerCase().includes("guide")
    )
    .map((item) => ({
      id: item.id,
      title: item.title,
      url: item.url || "",
      subscribers: 0,
      status: item.status === "published" ? "live" : "draft",
    }))

  const liveConnectors = input.connectors.filter((c) => c.status === "connected")

  return {
    crew,
    pipeline,
    leadMagnets,
    activeDays: input.items.filter((i) => i.publish_date).length,
    connectors: input.connectors,
    isLive: liveConnectors.length > 0,
  }
}
