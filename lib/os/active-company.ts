import { getEffectiveAgents } from "@/lib/get-effective-agents"

/** Server-readable so the root layout can resolve a redirect during SSR.
 *  Deliberately a cookie and not localStorage: the redirect happens before
 *  any client script runs. */
export const ACTIVE_COMPANY_COOKIE = "alacran-active-company"

/**
 * The cookie is a hint, never a promise. A company folder can be deleted or
 * renamed between two launches, so the id is only honoured when it is still
 * in the list read off disk; otherwise the caller sends the user to the picker.
 */
export function resolveActiveCompany(
  cookieValue: string | undefined,
  knownIds: string[]
): string | null {
  if (!cookieValue) return null
  return knownIds.includes(cookieValue) ? cookieValue : null
}

const MACHINE_SCOPED: Record<string, string> = {
  "/connect": "/system/connectors",
  "/integrations": "/system/connectors",
  "/connections": "/system/connectors",
  "/network": "/system/connectors",
  "/settings": "/system/settings",
}

const COMPANY_SCOPED: Record<string, string> = {
  "/files": "files",
  "/activity": "activity",
  "/skills": "skills",
  "/assistant": "dashboard?dock=open",
  "/doctor": "doctor",
  "/roadmap": "roadmap",
  "/analytics": "analytics",
  "/personas": "personas",
  "/social": "social",
  "/social/beehiiv": "social/beehiiv",
  "/funnel": "funnel",
  "/brain": "brain",
  "/org": "org",
  "/terminal": "terminal",
}

/**
 * Where a pre-OS-shell URL goes now. Returns null for paths this owns nothing
 * of, so the caller can fall through rather than redirecting everything.
 */
export function legacyRedirect(pathname: string, activeId: string | null): string | null {
  const machine = MACHINE_SCOPED[pathname]
  if (machine) return machine

  const company = COMPANY_SCOPED[pathname]
  if (!company) return null
  return activeId ? `/c/${activeId}/${company}` : "/"
}

export async function getActiveCompanyRoot(companyId: string): Promise<string | null> {
  const agents = await getEffectiveAgents()
  const match = agents.find((a) => a.id === companyId)
  return match ? match.rootPath : null
}
