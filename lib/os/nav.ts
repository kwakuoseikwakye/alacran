export type NavItem = {
  slug: string
  label: string
  /** A lucide-react export name. Resolved in the component so this module
   *  carries no JSX and stays testable under vitest's node environment. */
  icon: string
  scope: "company" | "system"
  advancedOnly?: boolean
  href?: string
}

export type NavGroup = { id: string; label: string; items: NavItem[] }

/** The word is "Companies" everywhere the app speaks to a user, so a company
 *  route is what a destination means unless it is explicitly machine-wide. */

/**
 * `advancedOnly` has existed on this type since simple mode shipped and was
 * never set on a single item, so simple mode still rendered all 21
 * destinations — the mechanism was built and left unwired.
 *
 * What stays in simple mode is what a business owner has a word for: their
 * companies, a dashboard, their company's own details, the things waiting on
 * their approval, the tools they connect, and settings. Everything hidden
 * assumes either terminal literacy (Terminal, Workflows, Skills, System
 * Doctor) or a vocabulary the app invented (Knowledge Core, Org & Gate,
 * Value Pipeline, Distribution).
 *
 * The five departments are hidden here and NOT hidden from the product: every
 * one of them is a tile on the dashboard that links straight through. That is
 * what keeps this inside the standing rule — hiding a card must never remove
 * the only control that reaches it. When records can be written from the UI
 * rather than only by an agent, this should become dynamic (show a department
 * once it holds anything) rather than a static flag.
 */
export const NAV_GROUPS: NavGroup[] = [
  {
    id: "primary",
    label: "Workspace",
    items: [
      { slug: "dashboard", label: "Home", icon: "Home", scope: "company" },
      { slug: "ask", label: "Ask Alacrán", icon: "Search", scope: "company" },
      { slug: "tasks", label: "Approvals", icon: "CircleCheck", scope: "company" },
    ],
  },
  {
    id: "company",
    label: "Company",
    items: [
      { slug: "records", label: "Records", icon: "FolderTree", scope: "company" },
      { slug: "brain", label: "What Alacrán knows", icon: "Brain", scope: "company" },
      { slug: "agents", label: "Company profile", icon: "Building2", scope: "company" },
      { slug: "connectors", label: "Connected tools", icon: "Plug", scope: "system" },
      { slug: "settings", label: "Preferences", icon: "Settings", scope: "system" },
    ],
  },
  // Advanced mode's pages, shown in the sidebar under "Developer". The sidebar
  // replaced the advanced top strip and its More menu (2026-09-28), so this
  // group holds every page those two reached — hiding one here removes the
  // only way to it. Terminal is first: the phone nav takes this group's first
  // item as its "More" tab. Files has no entry here (removed on request); its
  // route still exists.
  {
    id: "advanced",
    label: "Developer",
    items: [
      { slug: "terminal", advancedOnly: true, label: "Terminal", icon: "Terminal", scope: "company" },
      { slug: "org", advancedOnly: true, label: "Departments", icon: "Users", scope: "company" },
      { slug: "workflows", advancedOnly: true, label: "Automations", icon: "Workflow", scope: "company" },
      { slug: "jobs", advancedOnly: true, label: "Unattended jobs", icon: "CalendarClock", scope: "company" },
      { slug: "skills", advancedOnly: true, label: "Skills", icon: "Sparkles", scope: "company" },
      { slug: "analytics", advancedOnly: true, label: "Analytics", icon: "BarChart3", scope: "company" },
      { slug: "doctor", advancedOnly: true, label: "Diagnostics", icon: "Activity", scope: "company" },
    ],
  },
]

const ALL_ITEMS = NAV_GROUPS.flatMap((g) => g.items)

export function hrefFor(item: NavItem, companyId: string | null): string {
  if (item.href) return item.href
  if (item.scope === "system") return `/system/${item.slug}`
  return companyId ? `/c/${companyId}/${item.slug}` : "/"
}

/**
 * Which nav item a URL lights up. Matches the segment after the company id (or
 * after /system), so a deep link like /c/acme/files/notes/todo.md still marks
 * Files rather than nothing.
 */
export function activeItem(pathname: string, search = ""): NavItem | null {
  void search
  if (pathname === "/") return ALL_ITEMS.find((i) => i.slug === "companies") ?? null
  const segments = pathname.split("/").filter(Boolean)
  let slug: string | undefined
  if (segments[0] === "c") slug = segments[2]
  else if (segments[0] === "system") slug = segments[1]
  if (!slug) return null
  if (["funnel", "finances", "content"].includes(slug)) slug = "records"
  return ALL_ITEMS.find((i) => i.slug === slug) ?? null
}

/** Keep the owner's three daily actions reachable on phones. Collapsing each
 * desktop group to one tab made Ask and Approvals disappear from mobile. */
export function mobileNavItems(advanced: boolean): NavItem[] {
  const groups = visibleGroups(advanced)
  const primary = groups.find((group) => group.id === "primary")?.items ?? []
  const company = groups.find((group) => group.id === "company")?.items.slice(0, 1) ?? []
  const more = groups.find((group) => group.id === "advanced")?.items.slice(0, 1) ?? []
  return [...primary, ...company, ...more]
}

export function visibleGroups(advanced: boolean): NavGroup[] {
  return NAV_GROUPS
    .map((g) => ({ ...g, items: advanced ? g.items : g.items.filter((i) => !i.advancedOnly) }))
    .filter((g) => g.items.length > 0)
}
