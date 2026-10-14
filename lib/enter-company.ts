"use server"

import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { ACTIVE_COMPANY_COOKIE } from "@/lib/os/active-company"

// A year, not a session cookie: this is the front door's remembered choice
// ("pick a company, then enter its OS"), and a session-length cookie would
// forget it every time the app (a local server, not a browser tab someone
// keeps open) restarts — the user would have to re-pick on every launch.
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365

/**
 * The front door: sets the active-company cookie and enters that company's
 * OS. A server action because `cookies().set()` cannot run during render in
 * Next 15 — this is what a company tile's click calls instead.
 */
export async function enterCompany(companyId: string) {
  const store = await cookies()
  store.set(ACTIVE_COMPANY_COOKIE, companyId, {
    path: "/",
    sameSite: "lax",
    maxAge: COOKIE_MAX_AGE_SECONDS,
  })
  redirect(`/c/${companyId}/dashboard`)
}
