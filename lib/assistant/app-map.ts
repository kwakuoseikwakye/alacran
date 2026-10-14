import { NAV_GROUPS } from "../os/nav"

/**
 * What the assistant knows about Alacrán itself: its pages, how work moves
 * through it, and which page the person is looking at.
 *
 * The assistant used to know each company's files and nothing about the app
 * around them, so "where do I approve that?" or "what's this page for?" got
 * "I don't know" from something docked on every page of the app.
 *
 * One line per page. A nav destination with no line here is still named, so
 * adding a page never makes the assistant claim it doesn't exist.
 */
const PAGE_PURPOSE: Record<string, string> = {
  dashboard: "Home: the company at a glance, with a tile for each department.",
  ask: "Ask Alacrán: typed questions about the company, answered from its own files.",
  tasks: "Approvals: every draft a job wrote, waiting for the person to keep or discard. Nothing is saved to the company until it is approved here.",
  records: "Records: the departments' data (money, leads, content, social, inquiries), kept up to date by jobs.",
  agents: "Company profile: the company's details, and which AI agent runs its jobs.",
  connectors: "Connected tools: Google, GitHub, Notion, chats and the other tools jobs can read from.",
  settings: "Preferences: appearance, the assistant's name and language, voice and the microphone switch, advanced mode, updates.",
  files: "Files: the company's folder, browsable.",
  terminal: "Terminal: live AI assistant and command-line sessions in the company's folder, in a grid or one at a time. 'Save what we learned' asks an assistant session to write itself up as a note for approval.",
  brain: "What Alacrán knows: the company's memory — facts, decisions and notes — as a plain list, with a map view too.",
  org: "Departments: the company's departments and what each one owns.",
  workflows: "Automations: jobs that run on a schedule, like the daily message check or a weekly digest.",
  skills: "Skills: the commands and skills the company's AI agent can use.",
  analytics: "Analytics: numbers over time.",
  doctor: "Diagnostics: checks that the company's folder and tools are healthy.",
  finances: "Money in & out: the ledger, with an audit job that drafts recommendations.",
  funnel: "Leads & customers: the sales pipeline, with a job that researches prospects.",
  comms: "Communications & inquiries: a job reads the chat, email and Notion checks and drafts a reply card for every message still waiting. The person approves a draft, copies it, sends it themselves, then marks it replied — Alacrán never sends anything.",
  "content-social": "Content & social: posts, articles and audience snapshots.",
  activity: "Activity: what happened recently, across jobs and commits.",
}

const NAV_LABEL = new Map(NAV_GROUPS.flatMap((g) => g.items).map((i) => [i.slug, i.label]))

/** `/c/acme/finances` → `finances`; `/settings` → `settings`; `/c/acme` → `dashboard`. */
export function pageSlugFromPath(pathname: string | undefined): string | null {
  if (!pathname) return null
  const parts = pathname.split("?")[0].split("/").filter(Boolean)
  if (parts[0] === "c") return parts[2] ?? (parts[1] ? "dashboard" : null)
  return parts[0] ?? null
}

export function buildAppMapBlock(pathname?: string, companyName?: string): string {
  const pages = Object.values(PAGE_PURPOSE).map((purpose) => `- ${purpose}`)
  for (const [slug, label] of NAV_LABEL) if (!(slug in PAGE_PURPOSE)) pages.push(`- ${label}.`)

  const slug = pageSlugFromPath(pathname)
  const pageName = slug ? (PAGE_PURPOSE[slug]?.split(":")[0] ?? NAV_LABEL.get(slug) ?? slug) : null
  const here = pageName
    ? `\nRight now they are on the ${pageName} page${companyName ? ` of ${companyName}` : ""}. If the question says "this" or "here", it most likely means that page.`
    : ""

  return `

About Alacrán, the app you live in — use it to answer where things are and how to do something:
Each company is a folder on this computer. Jobs, run by the company's AI agent by hand or on a schedule, read the company's files and connected tools and write DRAFTS. A draft lands in Approvals, and only an approval saves it to the company. The app never sends, pays or publishes anything; the person does that themselves.
Pages:
${pages.join("\n")}${here}`
}
