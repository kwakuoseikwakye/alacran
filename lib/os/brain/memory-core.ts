/**
 * Memory core at the center of the /brain knowledge graph.
 */

export type BrainGraphNode = {
  id: string
  type: "folder" | "page"
  label: string
  folder: string
  kind?: string
  excerpt: string
  wordCount: number
  tags?: string[]
  agents?: string[]
  vx: number
  vy: number
  vector?: number[]
  chunks: number
}

export type BrainGraphEdge = {
  source: string
  target: string
  type: "member" | "wikilink" | "similar"
}

export type MemoryNode = {
  id: string
  type: "folder" | "page"
  label: string
  folder: string
  excerpt: string
  wordCount: number
  chunks: number
  vx: number // layout coords in unit disc
  vy: number
  cluster: number
  links: number
}

export type MemoryEdge = { source: string; target: string; type: BrainGraphEdge["type"] }

export type MemoryGraph = { nodes: MemoryNode[]; edges: MemoryEdge[] }

type BrainGraphSlice = { nodes: BrainGraphNode[]; edges: BrainGraphEdge[] }

const DEFAULT_MAX_PAGES = 120

export function distillMemoryGraph(
  graph: BrainGraphSlice,
  opts: { maxPages?: number; centerFolder?: string; centerQuota?: number } = {}
): MemoryGraph {
  const maxPages = opts.maxPages ?? DEFAULT_MAX_PAGES
  const centerFolder = opts.centerFolder
  const centerQuota = Math.min(opts.centerQuota ?? 32, maxPages)

  const degree = new Map<string, number>()
  for (const e of graph.edges) {
    if (e.type !== "wikilink") continue
    degree.set(e.source, (degree.get(e.source) ?? 0) + 1)
    degree.set(e.target, (degree.get(e.target) ?? 0) + 1)
  }

  const ranked = graph.nodes
    .filter((n) => n.type === "page")
    .sort(
      (a, b) =>
        (degree.get(b.id) ?? 0) - (degree.get(a.id) ?? 0) ||
        b.wordCount - a.wordCount ||
        a.id.localeCompare(b.id)
    )
  let pages = ranked.slice(0, maxPages)

  if (centerFolder) {
    const kept = pages.filter((p) => p.folder === centerFolder).length
    if (kept < centerQuota) {
      const extras = ranked
        .filter((p) => p.folder === centerFolder && !pages.includes(p))
        .slice(0, centerQuota - kept)
      if (extras.length) {
        const keepOthers = pages.filter((p) => p.folder !== centerFolder)
        const roomForOthers = maxPages - kept - extras.length
        pages = [
          ...keepOthers.slice(0, Math.max(0, roomForOthers)),
          ...pages.filter((p) => p.folder === centerFolder),
          ...extras,
        ]
      }
    }
  }

  const keptFolders = new Set(pages.map((p) => p.folder))
  const hubs = graph.nodes.filter((n) => n.type === "folder" && keptFolders.has(n.folder))

  const keptIds = new Set([...hubs, ...pages].map((n) => n.id))
  const edges: MemoryEdge[] = graph.edges
    .filter((e) => keptIds.has(e.source) && keptIds.has(e.target))
    .map((e) => ({ source: e.source, target: e.target, type: e.type }))

  const links = new Map<string, number>()
  for (const e of edges) {
    if (e.type === "member") continue
    links.set(e.source, (links.get(e.source) ?? 0) + 1)
    links.set(e.target, (links.get(e.target) ?? 0) + 1)
  }
  for (const e of edges) {
    if (e.type !== "member") continue
    links.set(e.source, (links.get(e.source) ?? 0) + 1)
    if (centerFolder && e.source === `folder:${centerFolder}`) {
      links.set(e.target, (links.get(e.target) ?? 0) + 1)
    }
  }

  const slim = (n: BrainGraphNode): MemoryNode => ({
    id: n.id,
    type: n.type,
    label: n.label,
    folder: n.folder,
    excerpt: n.excerpt,
    wordCount: n.wordCount,
    chunks: n.chunks,
    vx: n.vx,
    vy: n.vy,
    cluster: 0,
    links: links.get(n.id) ?? 0,
  })

  let nodes = forceLayout(
    [...hubs, ...pages].map(slim),
    edges,
    centerFolder ? `folder:${centerFolder}` : undefined
  )

  nodes = assignLinkClusters(nodes, edges)

  const finalPos = new Map(nodes.map((n) => [n.id, n]))
  const keptEdges = edges.filter((e) => {
    if (e.type !== "similar") return true
    const a = finalPos.get(e.source)
    const b = finalPos.get(e.target)
    if (!a || !b) return false
    return Math.hypot(a.vx - b.vx, a.vy - b.vy) <= MAX_SIMILAR_SPAN
  })

  return { nodes, edges: keptEdges }
}

function assignLinkClusters(nodes: MemoryNode[], edges: MemoryEdge[]): MemoryNode[] {
  const inner = nodes.filter((n) => !(n.type === "page" && n.links === 0))
  if (inner.length === 0) return nodes
  const idx = new Map(inner.map((n, i) => [n.id, i]))
  const parent = inner.map((_, i) => i)
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])))
  for (const e of edges) {
    const a = idx.get(e.source)
    const b = idx.get(e.target)
    if (a === undefined || b === undefined) continue
    const ra = find(a)
    const rb = find(b)
    if (ra !== rb) parent[rb] = ra
  }
  const sizes = new Map<number, number>()
  for (let i = 0; i < inner.length; i++) {
    const r = find(i)
    sizes.set(r, (sizes.get(r) ?? 0) + 1)
  }
  const ranked = [...sizes.entries()]
    .sort((a, b) => b[1] - a[1] || a[0] - b[0])
    .map(([root]) => root)
  const rankOf = new Map(ranked.map((root, rank) => [root, rank]))
  return nodes.map((n) => {
    const i = idx.get(n.id)
    return { ...n, cluster: i === undefined ? 0 : rankOf.get(find(i)) ?? 0 }
  })
}

const FORCE_ITERS = 260
const D_MIN = 0.056
const BLOB_FILL = 1.05
const COMPONENT_RING = 0.6
const GOLDEN_ANGLE = 2.399963229728653

const SPRING: Record<string, { rest: number; k: number }> = {
  wikilink: { rest: 0.11, k: 0.08 },
  similar: { rest: 0.13, k: 0.05 },
  member: { rest: 0.3, k: 0.015 },
}

const MAX_SIMILAR_SPAN = 0.5

const hashId = (s: string) => {
  let h = 0
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return h
}

function forceLayout(nodes: MemoryNode[], edges: MemoryEdge[], centerId?: string): MemoryNode[] {
  const r4 = (n: number) => Math.round(n * 1e4) / 1e4
  const isOrphan = (n: MemoryNode) => n.type === "page" && n.links === 0
  const inner = nodes.filter((n) => !isOrphan(n))
  const orphans = nodes.filter(isOrphan)

  const pos = new Map<string, { x: number; y: number }>()

  if (inner.length > 0) {
    const idx = new Map(inner.map((n, i) => [n.id, i]))
    const pts = inner.map((n) => ({ x: n.vx, y: n.vy }))
    const cx0 = pts.reduce((s, p) => s + p.x, 0) / pts.length
    const cy0 = pts.reduce((s, p) => s + p.y, 0) / pts.length
    pts.forEach((p, i) => {
      p.x = (p.x - cx0) * 0.5 + Math.cos(i * GOLDEN_ANGLE) * 0.01
      p.y = (p.y - cy0) * 0.5 + Math.sin(i * GOLDEN_ANGLE) * 0.01
    })

    const springs = edges
      .map((e) => ({ a: idx.get(e.source), b: idx.get(e.target), s: SPRING[e.type] }))
      .filter(
        (e): e is { a: number; b: number; s: { rest: number; k: number } } =>
          e.a !== undefined && e.b !== undefined && !!e.s
      )

    const parent = inner.map((_, i) => i)
    const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])))
    for (const e of springs) {
      const ra = find(e.a)
      const rb = find(e.b)
      if (ra !== rb) parent[rb] = ra
    }
    const compSize = new Map<number, number>()
    for (let i = 0; i < inner.length; i++) {
      const r = find(i)
      compSize.set(r, (compSize.get(r) ?? 0) + 1)
    }

    const centerIdx = centerId !== undefined ? idx.get(centerId) : undefined
    const centerRoot = centerIdx !== undefined ? find(centerIdx) : undefined
    const ordered = [...compSize.entries()]
      .sort(
        (a, b) =>
          Number(b[0] === centerRoot) - Number(a[0] === centerRoot) || b[1] - a[1] || a[0] - b[0]
      )
      .map(([root]) => root)
    const compRank = new Map(ordered.map((root, rank) => [root, rank]))

    const satCount = Math.max(1, compRank.size - 1)
    const anchor = (i: number) => {
      const rank = compRank.get(find(i))!
      if (rank === 0) return { x: 0, y: 0 }
      const a = ((rank - 1) / satCount) * 2 * Math.PI + 0.7
      return { x: COMPONENT_RING * Math.cos(a), y: COMPONENT_RING * Math.sin(a) }
    }
    const compR = (i: number) => D_MIN * Math.sqrt(compSize.get(find(i)) ?? 1) * 0.9

    for (let it = 0; it < FORCE_ITERS; it++) {
      for (const { a, b, s } of springs) {
        const dx = pts[b].x - pts[a].x
        const dy = pts[b].y - pts[a].y
        const d = Math.hypot(dx, dy) || 1e-9
        const f = (d - s.rest) * s.k * 0.5
        const ux = dx / d
        const uy = dy / d
        pts[a].x += ux * f
        pts[a].y += uy * f
        pts[b].x -= ux * f
        pts[b].y -= uy * f
      }

      for (let i = 0; i < pts.length; i++) {
        const t = anchor(i)
        const dx = t.x - pts[i].x
        const dy = t.y - pts[i].y
        const len = Math.hypot(dx, dy)
        const excess = len - compR(i)
        if (excess > 1e-6 && len > 1e-9) {
          pts[i].x += (dx / len) * excess * 0.06
          pts[i].y += (dy / len) * excess * 0.06
        }
      }

      for (let i = 0; i < pts.length; i++) {
        for (let j = i + 1; j < pts.length; j++) {
          let dx = pts[j].x - pts[i].x
          let dy = pts[j].y - pts[i].y
          let d = Math.hypot(dx, dy)
          if (d >= D_MIN) continue
          const push = (D_MIN - d) / 2
          if (d < 1e-9) {
            const a = (i * pts.length + j) * GOLDEN_ANGLE
            dx = Math.cos(a)
            dy = Math.sin(a)
            d = 1
          }
          pts[i].x -= (dx / d) * push
          pts[i].y -= (dy / d) * push
          pts[j].x += (dx / d) * push
          pts[j].y += (dy / d) * push
        }
      }
      for (const p of pts) {
        const len = Math.hypot(p.x, p.y)
        if (len > BLOB_FILL) {
          p.x *= BLOB_FILL / len
          p.y *= BLOB_FILL / len
        }
      }
    }

    const bx = pts.reduce((s, p) => s + p.x, 0) / pts.length
    const by = pts.reduce((s, p) => s + p.y, 0) / pts.length
    for (const p of pts) {
      p.x -= bx
      p.y -= by
    }

    if (centerRoot !== undefined) {
      for (let i = 0; i < pts.length; i++) {
        if (find(i) !== centerRoot) continue
        pts[i].x *= 0.5
        pts[i].y *= 0.5
      }
    }

    const order = pts
      .map((p, i) => ({ i, r: Math.hypot(p.x, p.y) }))
      .sort((a, b) => a.r - b.r || a.i - b.i)
    order.forEach(({ i, r }, rank) => {
      const target = BLOB_FILL * Math.sqrt((rank + 0.5) / order.length)
      if (r < 1e-9) {
        const a = i * GOLDEN_ANGLE
        pts[i].x = target * Math.cos(a)
        pts[i].y = target * Math.sin(a)
      } else {
        pts[i].x = (pts[i].x / r) * target
        pts[i].y = (pts[i].y / r) * target
      }
    })
    for (let sweep = 0; sweep < 3; sweep++) {
      for (let i = 0; i < pts.length; i++) {
        for (let j = i + 1; j < pts.length; j++) {
          let dx = pts[j].x - pts[i].x
          let dy = pts[j].y - pts[i].y
          let d = Math.hypot(dx, dy)
          if (d >= D_MIN) continue
          const push = (D_MIN - d) / 2
          if (d < 1e-9) {
            const a = (i * pts.length + j) * GOLDEN_ANGLE
            dx = Math.cos(a)
            dy = Math.sin(a)
            d = 1
          }
          pts[i].x -= (dx / d) * push
          pts[i].y -= (dy / d) * push
          pts[j].x += (dx / d) * push
          pts[j].y += (dy / d) * push
        }
      }
      for (const p of pts) {
        const len = Math.hypot(p.x, p.y)
        if (len > BLOB_FILL) {
          p.x *= BLOB_FILL / len
          p.y *= BLOB_FILL / len
        }
      }
    }
    inner.forEach((n, i) => pos.set(n.id, pts[i]))
  }

  orphans.forEach((n, i) => {
    const a = i * GOLDEN_ANGLE + (hashId(n.id) % 100) / 100
    const r = 1.08 + ((hashId(n.id) >> 4) % 70) / 1000
    pos.set(n.id, { x: r * Math.cos(a), y: r * Math.sin(a) })
  })

  return nodes.map((n) => {
    const p = pos.get(n.id) ?? { x: 0, y: 0 }
    return { ...n, vx: r4(p.x), vy: r4(p.y) }
  })
}

export function pickRestTier(nodes: MemoryNode[], maxPages = 96): MemoryNode[] {
  const hubs = nodes.filter((n) => n.type === "folder")
  const linked = nodes.filter((n) => n.type === "page" && n.links > 0)
  const SECTORS = 12
  const bySector: MemoryNode[][] = Array.from({ length: SECTORS }, () => [])
  for (const n of linked) {
    const a = Math.atan2(n.vy, n.vx)
    bySector[Math.min(SECTORS - 1, Math.floor(((a + Math.PI) / (2 * Math.PI)) * SECTORS))].push(n)
  }
  for (const bucket of bySector) {
    bucket.sort(
      (a, b) => b.links - a.links || b.wordCount - a.wordCount || a.id.localeCompare(b.id)
    )
  }
  const budget = Math.min(maxPages, linked.length)
  const picked: MemoryNode[] = []
  for (let round = 0; picked.length < budget; round++) {
    let took = false
    for (const bucket of bySector) {
      if (picked.length >= budget) break
      const n = bucket[round]
      if (n) {
        picked.push(n)
        took = true
      }
    }
    if (!took) break
  }
  const orphans = nodes
    .filter((n) => n.type === "page" && n.links === 0)
    .filter((_, i) => i % 3 === 0)
  const keep = new Set([...hubs, ...picked, ...orphans].map((n) => n.id))
  return nodes.filter((n) => keep.has(n.id))
}

export function memoryNodePos(
  n: { vx: number; vy: number },
  center: { x: number; y: number },
  radius: number
): { x: number; y: number } {
  return { x: center.x + n.vx * radius, y: center.y + n.vy * radius }
}

export const R_CORE = 52

export type Rect = { x: number; y: number; w: number; h: number }
export type ViewSize = { w: number; h: number }

export type CameraState = {
  focusedTeam: boolean
  coreExpanded: boolean
  coreCenter: { x: number; y: number }
  selectedNodePos?: { x: number; y: number } | null
  memorySelectedPos?: { x: number; y: number } | null
}

const ZOOM_NODE = 0.55
const ZOOM_CORE = 0.5
const ZOOM_NOTE = 0.22

const round2 = (n: number): number => {
  const v = Math.round(n * 100) / 100
  return Object.is(v, -0) ? 0 : v
}

function frameOn(view: ViewSize, c: { x: number; y: number }, frac: number): Rect {
  const w = view.w * frac
  const h = w * (view.h / view.w)
  const x = Math.max(0, Math.min(view.w - w, c.x - w / 2))
  const y = Math.max(0, Math.min(view.h - h, c.y - h / 2))
  return { x: round2(x), y: round2(y), w: round2(w), h: round2(h) }
}

const ZOOM_OUT_PAD = 0.06

export function cameraRect(view: ViewSize, s: CameraState): Rect {
  if (s.coreExpanded) {
    if (s.memorySelectedPos) return frameOn(view, s.memorySelectedPos, ZOOM_NOTE)
    return frameOn(view, s.coreCenter, ZOOM_CORE)
  }
  if (s.selectedNodePos) return frameOn(view, s.selectedNodePos, ZOOM_NODE)
  return {
    x: round2(-view.w * ZOOM_OUT_PAD),
    y: round2(-view.h * ZOOM_OUT_PAD),
    w: round2(view.w * (1 + 2 * ZOOM_OUT_PAD)),
    h: round2(view.h * (1 + 2 * ZOOM_OUT_PAD)),
  }
}

/**
 * The home view frames the nodes that exist, not the whole stage. A company
 * with three teams drew itself in a third of the canvas; this zooms in on the
 * spread of `pts` plus `pad`, never past `maxZoom` and never further out than
 * the default padded stage. Returns null for no points.
 */
export function fitRect(view: ViewSize, pts: { x: number; y: number }[], pad: number, maxZoom: number): Rect | null {
  if (!pts.length) return null
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (const p of pts) {
    x0 = Math.min(x0, p.x)
    y0 = Math.min(y0, p.y)
    x1 = Math.max(x1, p.x)
    y1 = Math.max(y1, p.y)
  }
  const aspect = view.h / view.w
  const widest = view.w * (1 + 2 * ZOOM_OUT_PAD)
  const w = Math.min(widest, Math.max(view.w / maxZoom, x1 - x0 + 2 * pad, (y1 - y0 + 2 * pad) / aspect))
  const h = w * aspect
  return { x: round2((x0 + x1) / 2 - w / 2), y: round2((y0 + y1) / 2 - h / 2), w: round2(w), h: round2(h) }
}

export function lerpRect(cur: Rect, target: Rect, t: number): Rect {
  if (t >= 1) return target
  const done =
    Math.abs(cur.x - target.x) < 0.05 &&
    Math.abs(cur.y - target.y) < 0.05 &&
    Math.abs(cur.w - target.w) < 0.05 &&
    Math.abs(cur.h - target.h) < 0.05
  if (done) return target
  return {
    x: cur.x + (target.x - cur.x) * t,
    y: cur.y + (target.y - cur.y) * t,
    w: cur.w + (target.w - cur.w) * t,
    h: cur.h + (target.h - cur.h) * t,
  }
}

export function demoMemoryGraph(): MemoryGraph {
  const rnd = (s: string, i: number): number => {
    let h = 2166136261 ^ i
    for (let k = 0; k < s.length; k++) {
      h ^= s.charCodeAt(k)
      h = Math.imul(h, 16777619)
    }
    return ((h >>> 0) % 100000) / 100000
  }
  const domains: { folder: string; titles: string[] }[] = [
    {
      folder: "Sales Playbooks",
      titles: [
        "Cold Outreach Framework",
        "Discovery Call Script",
        "Objection Handling",
        "Pricing & Packaging",
        "Follow-up Cadence",
        "Proposal Template",
        "Closing Checklist",
        "ICP Definition",
        "Negotiation Notes",
        "Win/Loss Review",
        "Referral Program",
        "Case Study Bank",
        "Sales Deck",
        "Territory Plan",
        "Commission Structure",
      ],
    },
    {
      folder: "Growth & Marketing",
      titles: [
        "Content Engine",
        "Paid Ads Playbook",
        "Hook Library",
        "Funnel Map",
        "SEO Notes",
        "Brand Voice",
        "Launch Plan",
        "Email Sequences",
        "UGC Briefs",
        "Analytics Notes",
        "Landing Pages",
        "Webinar Playbook",
        "Influencer List",
        "Retargeting",
        "Newsletter Ops",
      ],
    },
    {
      folder: "Product",
      titles: [
        "Roadmap",
        "Feature Specs",
        "User Research",
        "Onboarding Flow",
        "Changelog",
        "Design System",
        "API Notes",
        "Bug Triage",
        "Release Process",
        "Product Metrics",
        "Feature Flags",
        "Analytics Events",
        "Support Macros",
        "Beta Program",
        "Integrations",
      ],
    },
    {
      folder: "Operations",
      titles: [
        "SOP Library",
        "Hiring Playbook",
        "Team Rituals",
        "Vendor List",
        "Tooling Stack",
        "Incident Runbook",
        "Weekly Cadence",
        "Access & Security",
        "Docs Index",
        "Onboarding Kit",
        "Payroll SOP",
        "Legal Templates",
        "Meeting Notes",
        "OKRs",
        "Vendor Contracts",
      ],
    },
    {
      folder: "Finance",
      titles: [
        "Unit Economics",
        "Cash Flow Model",
        "Pricing Model",
        "Invoicing SOP",
        "Runway Tracker",
        "Expense Policy",
        "Revenue Report",
        "Forecast",
        "Payment Processors",
        "Bookkeeping",
        "Tax Notes",
        "Budget",
        "Investor Updates",
        "Chargebacks",
        "Financial Model",
      ],
    },
    {
      folder: "Client Delivery",
      titles: [
        "Kickoff Template",
        "Scope of Work",
        "Weekly Report",
        "QBR Deck",
        "Retention Playbook",
        "Escalation Path",
        "Deliverables Tracker",
        "Health Scores",
        "Renewal Motion",
        "Case Studies",
        "Onboarding Checklist",
        "SLA Terms",
        "Feedback Loop",
        "Upsell Paths",
        "Offboarding",
      ],
    },
    {
      folder: "Research",
      titles: [
        "Market Landscape",
        "Competitor Teardown",
        "Customer Interviews",
        "Trends",
        "Positioning",
        "Whitepaper Notes",
        "Data Sources",
        "Survey Results",
        "Experiment Log",
        "Insights",
        "Pricing Study",
        "Persona Docs",
        "Jobs to be Done",
        "Churn Analysis",
        "Benchmark Report",
      ],
    },
    {
      folder: "Automation",
      titles: [
        "Agent Registry",
        "Workflow Map",
        "Prompt Library",
        "Integration Notes",
        "Trigger Rules",
        "Eval Harness",
        "Guardrails",
        "Agent Runbook",
        "Model Notes",
        "Cost Tracking",
        "Webhook Map",
        "Retry Logic",
        "Data Pipeline",
        "Alerting Rules",
        "Access Scopes",
      ],
    },
  ]
  const nodes: MemoryNode[] = []
  const edges: MemoryEdge[] = []
  const seed = (id: string) => ({ vx: (rnd(id, 8) - 0.5) * 0.4, vy: (rnd(id, 9) - 0.5) * 0.4 })
  domains.forEach((d, di) => {
    nodes.push({
      id: `folder:${d.folder}`,
      type: "folder",
      label: d.folder,
      folder: d.folder,
      excerpt: "",
      wordCount: 0,
      chunks: 0,
      ...seed(d.folder),
      cluster: di,
      links: d.titles.length,
    })
    d.titles.forEach((t) => {
      const id = `page:${d.folder}/${t}`
      nodes.push({
        id,
        type: "page",
        label: t,
        folder: d.folder,
        excerpt: `${t} — a ${d.folder} reference note in the knowledge base.`,
        wordCount: 200 + Math.floor(rnd(id, 3) * 1400),
        chunks: 1 + Math.floor(rnd(id, 4) * 5),
        ...seed(id),
        cluster: di,
        links: 0,
      })
      edges.push({ source: `folder:${d.folder}`, target: id, type: "member" })
    })
  })
  const pages = nodes.filter((x) => x.type === "page")
  pages.forEach((p) => {
    const k = 4 + Math.floor(rnd(p.id, 5) * 3)
    for (let j = 0; j < k; j++) {
      const target = pages[Math.floor(rnd(p.id, 11 + j) * pages.length)]
      if (target && target.id !== p.id) {
        edges.push({ source: p.id, target: target.id, type: "wikilink" })
        p.links += 1
        target.links += 1
      }
    }
  })
  return { nodes: forceLayout(nodes, edges), edges }
}
