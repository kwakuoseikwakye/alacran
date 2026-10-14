import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  ACTIVE_COMPANY_COOKIE,
  resolveActiveCompany,
} from "@/lib/os/active-company";
import { getEffectiveAgents } from "@/lib/get-effective-agents";

export const dynamic = "force-dynamic";

export default async function LegacySocialPlatform({
  params,
}: {
  params: Promise<{ platform: string }>;
}) {
  const { platform } = await params;
  const store = await cookies();
  const agents = await getEffectiveAgents();
  const active = resolveActiveCompany(
    store.get(ACTIVE_COMPANY_COOKIE)?.value,
    agents.map((a) => a.id),
  );
  if (!active) {
    redirect("/");
  }
  redirect(`/c/${active}/social/${platform}`);
}
