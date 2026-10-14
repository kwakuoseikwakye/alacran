import type { Lead, FunnelStage as RecordFunnelStage } from "@/lib/os/schemas/funnel"
import type { DepartmentConnector } from "@/lib/os/departments/connectors"
import { getSeedFunnelJourneys } from "@/lib/os/funnel/seed"

export type FunnelStageId = "first_touch" | "engaged" | "nurtured" | "opted_in" | "converted"
export type FunnelVenture = "all" | "vantage" | "launchpad-cohort" | string

export const FUNNEL_STAGES: { id: FunnelStageId; label: string }[] = [
  { id: "first_touch", label: "First touch" },
  { id: "engaged", label: "Engaged" },
  { id: "nurtured", label: "Nurtured" },
  { id: "opted_in", label: "Opted in" },
  { id: "converted", label: "Converted" },
]

export const STAGE_INDEX: Record<FunnelStageId, number> = {
  first_touch: 0,
  engaged: 1,
  nurtured: 2,
  opted_in: 3,
  converted: 4,
}

export const CHANNEL_GLYPHS: Record<string, string> = {
  organic: "◉",
  ads: "▣",
  dm: "✉",
  email: "@",
  webinar: "▶",
  call: "☎",
  checkout: "$",
  crm: "◈",
}

export const VENTURE_TABS: { id: string; label: string; color?: string }[] = [
  { id: "all", label: "All clients" },
  { id: "vantage", label: "Vantage", color: "#38bdf8" },
  { id: "launchpad-cohort", label: "Launchpad Cohort", color: "var(--os-accent, #3df08c)" },
]

export function ventureColor(id: string): string {
  if (id === "vantage") return "#38bdf8"
  if (id === "launchpad-cohort") return "var(--os-accent, #3df08c)"
  return "var(--os-accent, #3df08c)"
}

export const RELATIONSHIP_VAR: Record<"hot" | "warm" | "cold", string> = {
  hot: "var(--funnel-hot, #f43f5e)",
  warm: "var(--funnel-warm, #f59e0b)",
  cold: "var(--funnel-cold, #38bdf8)",
}

export const STALL_DAYS = 7
export const DECAY_DAYS = 90
export const DECAY_FADE_START = 21
export const ATTENTION_CAP = 4
export const PUSH_LIKELIHOOD = 70

export type FunnelTouch = {
  id: string
  stage: FunnelStageId
  channel: string
  label: string
  at: string
  source: string
}

export type FunnelJourney = {
  id: string
  name: string
  venture: string
  status: FunnelStageId
  relationship: "hot" | "warm" | "cold"
  likelihood: number
  amountUsd: number
  createdAt: string
  touches: FunnelTouch[]
  url: string | null
  email: string | null
  phone: string | null
  person: string | null
  company: string | null
  role: string | null
  linkedin: string | null
  product: string | null
}

export type JourneyState = "converted" | "stalled" | "active" | "decayed"

export function decayFactor(daysSinceLastTouch: number, status: FunnelStageId): number {
  if (status === "converted") return 0
  return Math.min(
    1,
    Math.max(0, (daysSinceLastTouch - DECAY_FADE_START) / (DECAY_DAYS - DECAY_FADE_START))
  )
}

export function journeyMeta(
  j: FunnelJourney,
  now: Date
): { daysSinceLastTouch: number; state: JourneyState } {
  const lastAt = j.touches[j.touches.length - 1]?.at ?? j.createdAt
  const days = Math.max(
    0,
    Math.floor((now.getTime() - new Date(`${lastAt}T00:00:00Z`).getTime()) / 86_400_000)
  )
  const canStall = j.status !== "converted" && j.status !== "first_touch"
  const state: JourneyState =
    j.status === "converted"
      ? "converted"
      : days > DECAY_DAYS
      ? "decayed"
      : canStall && days > STALL_DAYS
      ? "stalled"
      : "active"
  return { daysSinceLastTouch: days, state }
}

export function attentionQueue(
  journeys: FunnelJourney[],
  now: Date
): { pushNow: FunnelJourney[]; saveNow: FunnelJourney[] } {
  const metas = journeys.map((j) => ({ j, meta: journeyMeta(j, now) }))
  const pushNow = metas
    .filter(
      ({ j, meta }) =>
        meta.state === "active" &&
        j.status !== "converted" &&
        j.likelihood >= PUSH_LIKELIHOOD &&
        decayFactor(meta.daysSinceLastTouch, j.status) === 0
    )
    .sort(
      (a, b) =>
        a.meta.daysSinceLastTouch - b.meta.daysSinceLastTouch || b.j.likelihood - a.j.likelihood
    )
    .slice(0, ATTENTION_CAP)
    .map(({ j }) => j)

  const saveNow = metas
    .filter(
      ({ j, meta }) =>
        meta.state !== "decayed" &&
        j.status !== "converted" &&
        decayFactor(meta.daysSinceLastTouch, j.status) > 0
    )
    .sort(
      (a, b) =>
        b.j.likelihood - a.j.likelihood || b.meta.daysSinceLastTouch - a.meta.daysSinceLastTouch
    )
    .slice(0, ATTENTION_CAP)
    .map(({ j }) => j)

  return { pushNow, saveNow }
}

export function splitFunnelJourneys(
  journeys: FunnelJourney[],
  now: Date
): { active: FunnelJourney[]; archived: FunnelJourney[] } {
  const active: FunnelJourney[] = []
  const archived: FunnelJourney[] = []
  for (const j of journeys) {
    if (journeyMeta(j, now).state === "decayed") {
      archived.push(j)
    } else {
      active.push(j)
    }
  }
  return { active, archived }
}

export type FunnelSpaceNode = {
  id: string
  name: string
  venture: string
  status: FunnelStageId
  relationship: FunnelJourney["relationship"]
  likelihood: number
  state: JourneyState
  daysSinceLastTouch: number
  product: string | null
  amountUsd: number | null
  hubs: number[]
  currentHub: number
  radius: number
  decay: number
  url: string | null
  email: string | null
  phone: string | null
  person: string | null
  company: string | null
  role: string | null
  linkedin: string | null
  touches: FunnelTouch[]
}

export function funnelSpaceModel(journeys: FunnelJourney[], now: Date): FunnelSpaceNode[] {
  return journeys.map((j) => {
    const hubs: number[] = []
    for (const t of j.touches) {
      const col = STAGE_INDEX[t.stage] ?? 0
      if (hubs[hubs.length - 1] !== col) hubs.push(col)
    }
    if (hubs.length === 0) hubs.push(STAGE_INDEX[j.status] ?? 0)
    const meta = journeyMeta(j, now)
    return {
      id: j.id,
      name: j.name,
      venture: j.venture,
      status: j.status,
      relationship: j.relationship,
      likelihood: j.likelihood,
      state: meta.state,
      daysSinceLastTouch: meta.daysSinceLastTouch,
      product: j.product,
      amountUsd: j.amountUsd,
      hubs,
      currentHub: hubs[hubs.length - 1] ?? STAGE_INDEX[j.status] ?? 0,
      radius: 2.5 + (j.likelihood / 100) * 3,
      decay: decayFactor(meta.daysSinceLastTouch, j.status),
      url: j.url,
      email: j.email,
      phone: j.phone,
      person: j.person,
      company: j.company,
      role: j.role,
      linkedin: j.linkedin,
      touches: j.touches,
    }
  })
}

export const ACQUISITIONS = [
  { id: "instagram", label: "Instagram" },
  { id: "youtube", label: "YouTube" },
  { id: "newsletter", label: "Newsletter" },
  { id: "x", label: "X" },
  { id: "linkedin", label: "LinkedIn" },
  { id: "form", label: "Forms" },
  { id: "word_of_mouth", label: "Word of mouth" },
] as const

export type FunnelAcquisition = (typeof ACQUISITIONS)[number]["id"]

const MATCHERS: { id: FunnelAcquisition; re: RegExp }[] = [
  { id: "instagram", re: /\b(ig|instagram|reels?)\b/i },
  { id: "youtube", re: /\b(yt|youtube)\b/i },
  { id: "newsletter", re: /\bnewsletter\b/i },
  { id: "x", re: /\b(x|twitter|tweet)\b/i },
  { id: "linkedin", re: /\blinkedin\b/i },
  { id: "form", re: /\bform\b/i },
]

export function acquisitionFor(j: { touches: FunnelTouch[] }): FunnelAcquisition {
  const entry = j.touches[0]
  if (!entry) return "word_of_mouth"
  for (const m of MATCHERS) if (m.re.test(entry.label)) return m.id
  if (entry.channel === "ads") return "instagram"
  return "word_of_mouth"
}

export type FunnelOrigin = {
  segment: string
  entry: string | null
  channel: string | null
  source: string | null
  at: string | null
}

export function originOf(j: { touches: FunnelTouch[] }): FunnelOrigin {
  const acq = acquisitionFor(j)
  const seg = ACQUISITIONS.find((a) => a.id === acq) ?? ACQUISITIONS[6]
  const entry = j.touches[0] ?? null
  return {
    segment: seg.label,
    entry: entry?.label ?? null,
    channel: entry?.channel ?? null,
    source: entry?.source ?? null,
    at: entry?.at ?? null,
  }
}

export type FunnelRadialNode = FunnelSpaceNode & {
  segment: number
  rings: number[]
  currentRing: number
}

export type FunnelRadialModel = {
  nodes: FunnelRadialNode[]
  segments: { id: string; label: string }[]
}

export function funnelRadialModel(journeys: FunnelJourney[], now: Date): FunnelRadialModel {
  const spaceNodes = funnelSpaceModel(journeys, now)
  const nodes: FunnelRadialNode[] = spaceNodes.map((n) => {
    const acq = acquisitionFor(n)
    const idx = ACQUISITIONS.findIndex((a) => a.id === acq)
    return {
      ...n,
      segment: idx >= 0 ? idx : 6,
      rings: n.hubs,
      currentRing: n.currentHub,
    }
  })

  return { nodes, segments: ACQUISITIONS.map((a) => ({ id: a.id, label: a.label })) }
}

export type FunnelSummary = {
  clients: number
  converted: number
  revenueUsd: number
  stages: {
    stage: FunnelStageId
    total: number
    organic: number
    ads: number
    conversionFromPrev: number | null
  }[]
}

export function contactActions(contact: {
  phone?: string | null
  email?: string | null
  url?: string | null
}): {
  email: string | null
  phone: string | null
  wa: string | null
  sms: string | null
  crmUrl: string | null
  isGhl: boolean
} {
  const digits = contact.phone?.replace(/[^\d]/g, "")
  const isGhl = Boolean(
    contact.url?.includes("gohighlevel") || contact.url?.includes("app.leadconnectorhq.com")
  )
  return {
    email: contact.email ?? null,
    phone: contact.phone ?? null,
    wa: digits ? `https://wa.me/${digits}` : null,
    sms: contact.phone ? `sms:${contact.phone}` : null,
    crmUrl: contact.url ?? null,
    isGhl,
  }
}

export type FunnelViewModel = {
  summary: FunnelSummary
  activeJourneys: FunnelJourney[]
  archivedJourneys: FunnelJourney[]
  spaceNodes: FunnelSpaceNode[]
  radial: FunnelRadialModel
  attention: { pushNow: FunnelJourney[]; saveNow: FunnelJourney[] }
  isLive: boolean
  liveLabel: string
  connectors: DepartmentConnector[]
  stageCounts: Record<FunnelStageId, number>
  venture?: string
}

/** Map plain LeadStageEnum ("new" | "qualified" | "negotiation" | "won" | "lost") to FunnelStageId */
function mapRecordStageToFunnel(stage: string): FunnelStageId {
  switch (stage) {
    case "new":
      return "first_touch"
    case "qualified":
      return "engaged"
    case "negotiation":
      return "opted_in"
    case "won":
      return "converted"
    case "lost":
    default:
      return "first_touch"
  }
}

function mapRecordStageToLikelihood(stage: string): number {
  switch (stage) {
    case "won":
      return 100
    case "negotiation":
      return 80
    case "qualified":
      return 55
    case "new":
    default:
      return 25
  }
}

export function buildFunnelViewModel(input: {
  leads: Lead[]
  stages: RecordFunnelStage[]
  connectors: DepartmentConnector[]
  venture?: string
  fallbackToSeed?: boolean
  now?: Date
}): FunnelViewModel {
  const now = input.now ?? new Date()

  let rawJourneys: FunnelJourney[]
  if (input.leads.length === 0) {
    rawJourneys = input.fallbackToSeed ? getSeedFunnelJourneys() : []
  } else {
    rawJourneys = input.leads.map((lead) => {
      const status = mapRecordStageToFunnel(lead.stage)
      const likelihood = mapRecordStageToLikelihood(lead.stage)
      const relationship =
        lead.stage === "won" || lead.stage === "negotiation"
          ? "hot"
          : lead.stage === "qualified"
          ? "warm"
          : "cold"

      const touches: FunnelTouch[] = []
      const firstDate = lead.first_seen ? lead.first_seen.slice(0, 10) : "2026-09-01"
      touches.push({
        id: `${lead.id}-t1`,
        stage: "first_touch",
        channel: lead.source || "organic",
        label: `First seen via ${lead.source || "organic"}`,
        at: firstDate,
        source: lead.source || "organic",
      })

      if (lead.stage !== "new") {
        const lastDate = lead.last_touch ? lead.last_touch.slice(0, 10) : firstDate
        touches.push({
          id: `${lead.id}-t2`,
          stage: status,
          channel: "crm",
          label: `Moved to ${status}`,
          at: lastDate,
          source: "crm",
        })
      }

      return {
        id: lead.id,
        name: lead.name,
        venture: "all",
        status,
        relationship,
        likelihood,
        amountUsd: lead.value,
        createdAt: firstDate,
        touches,
        url: null,
        email: `${lead.name.toLowerCase().replace(/[^a-z0-9]/g, "")}@example.com`,
        phone: null,
        person: lead.name,
        company: lead.name.includes("Corp") || lead.name.includes("Enterprises") ? lead.name : null,
        role: "Decision Maker",
        linkedin: null,
        product: lead.stage === "won" ? "Enterprise Contract" : null,
      }
    })
  }

  const journeys =
    input.venture && input.venture !== "all"
      ? rawJourneys.filter((j) => j.venture === input.venture)
      : rawJourneys

  const { active: activeJourneys, archived: archivedJourneys } = splitFunnelJourneys(journeys, now)
  const attention = attentionQueue(activeJourneys, now)
  const spaceNodes = funnelSpaceModel(activeJourneys, now)
  const radial = funnelRadialModel(activeJourneys, now)

  const convertedJourneys = activeJourneys.filter((j) => j.status === "converted")
  const revenueUsd = convertedJourneys.reduce((sum, j) => sum + j.amountUsd, 0)

  const stageCounts: Record<FunnelStageId, number> = {
    first_touch: 0,
    engaged: 0,
    nurtured: 0,
    opted_in: 0,
    converted: 0,
  }
  for (const j of activeJourneys) {
    stageCounts[j.status] = (stageCounts[j.status] ?? 0) + 1
  }

  const stagesSummary = FUNNEL_STAGES.map(({ id }, i) => {
    const reached = activeJourneys.filter((j) => STAGE_INDEX[j.status] >= i)
    return {
      stage: id,
      total: reached.length,
      organic: reached.filter((j) => j.touches[0]?.channel === "organic").length,
      ads: reached.filter((j) => j.touches[0]?.channel === "ads").length,
      conversionFromPrev: null as number | null,
    }
  })
  for (let i = 1; i < stagesSummary.length; i++) {
    const prev = stagesSummary[i - 1].total
    stagesSummary[i].conversionFromPrev =
      prev > 0 ? Math.round((stagesSummary[i].total / prev) * 1000) / 10 : null
  }

  const liveConnectors = input.connectors.filter((c) => c.status === "connected")
  const isLive = liveConnectors.length > 0
  const liveLabel = isLive
    ? liveConnectors.map((c) => `${c.label} live`).join(" + ")
    : "local records"

  return {
    summary: {
      clients: activeJourneys.length,
      converted: convertedJourneys.length,
      revenueUsd,
      stages: stagesSummary,
    },
    activeJourneys,
    archivedJourneys,
    spaceNodes,
    radial,
    attention,
    isLive,
    liveLabel,
    connectors: input.connectors,
    stageCounts,
  }
}
