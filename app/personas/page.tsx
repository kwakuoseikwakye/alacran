import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  ACTIVE_COMPANY_COOKIE,
  resolveActiveCompany,
  legacyRedirect,
} from "@/lib/os/active-company";
import { getEffectiveAgents } from "@/lib/get-effective-agents";

export const dynamic = "force-dynamic";

export default async function LegacyPersonas() {
  const store = await cookies();
  const agents = await getEffectiveAgents();
  const active = resolveActiveCompany(
    store.get(ACTIVE_COMPANY_COOKIE)?.value,
    agents.map((a) => a.id),
  );
  redirect(legacyRedirect("/personas", active) ?? "/");
}
