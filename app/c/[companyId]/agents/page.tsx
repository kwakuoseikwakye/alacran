import { notFound } from "next/navigation"
import { readFile } from "node:fs/promises"
import path from "node:path"
import { Building2, ChevronRight, Cpu, Lock, Package, Settings2, Target, Users } from "lucide-react"
import { getEffectiveAgents, getEffectiveAdapters } from "@/lib/get-effective-agents"
import { getAllActivities, mergeAndSortActivities } from "@/lib/get-all-activities"
import { getAgentCardFlags } from "@/lib/agent-card-flags"
import { getAvatars } from "@/lib/avatars-registry"
import { listGoogleAccountEmails } from "@/lib/google-accounts"
import { getCompanyTerminalStatus } from "@/lib/terminal/sessions"
import { AgentCard } from "@/components/agent-card"
import { CompanySetupWizard } from "@/components/company-setup-wizard"
import { CompanyGuideLink } from "@/components/company-guide"
import { AiExecutorPicker } from "@/components/ai-executor-picker"
import { DEFAULT_AI_EXECUTOR_ID } from "@/lib/ai-executors"
import { SectionTabs } from "@/components/section-tabs"
import { readProfile } from "@/lib/company-profile"
import { aiExecutorStatusesImpl, companyAiStatusImpl } from "@/lib/connect/connect-status-impl"
import { readinessMap } from "@/lib/executor-readiness"

export const dynamic = "force-dynamic"

export default async function AgentsPage({ params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await params
  const allAgents = await getEffectiveAgents()
  const agent = allAgents.find((entry) => entry.id === companyId)
  if (!agent) notFound()

  const [adapters, avatars, availableGoogleAccounts, source] = await Promise.all([
    getEffectiveAdapters().catch(() => ({})),
    getAvatars().catch(() => []),
    listGoogleAccountEmails().catch(() => []),
    readFile(path.join(agent.rootPath, "definitions", "ontology", "company.yaml"), "utf8").catch(() => ""),
  ])
  const result = (await getAllActivities([agent], adapters).catch(() => []))[0]
  const latest = result ? mergeAndSortActivities([result])[0] ?? null : null
  const flags = result
    ? await getAgentCardFlags(agent).catch(() => null)
    : null
  const readiness = flags?.showAiExecutorPicker
    ? readinessMap(await aiExecutorStatusesImpl().catch(() => []))
    : undefined
  // Unknown counts as ready: a wrong "connect your AI" is worse than a run that reports its own failure.
  const aiReady = (await companyAiStatusImpl(agent.id).catch(() => null))?.connected ?? true
  const profile = readProfile(source)
  const customers = profile.customers.join(", ") || "Not added yet"
  const offerings = profile.offerings.join(", ") || "Not added yet"
  const roles = profile.roles.join(", ") || "Not added yet"
  const complete = [agent.name, profile.customers.length, profile.offerings.length, profile.roles.length].filter(Boolean).length
  const avatar = avatars.find((item) => item.agentId === agent.id)?.imageUrl ?? null

  return (
    <main className="company-info-native">
      <aside className="company-info-index" aria-label="Company information sections">
        <header><h1>Company profile</h1><p>{complete} of 4 essentials added</p></header>
        <SectionTabs className="company-info-section-tabs" items={[
          ...(flags?.showAiExecutorPicker ? [{ id: "ai", label: "Your AI", icon: <Cpu /> }] : []),
          { id: "basics", label: "Basics", icon: <Building2 /> },
          { id: "customers", label: "Customers", icon: <Users /> },
          { id: "offers", label: "Offers", icon: <Package /> },
          { id: "work", label: "How you work", icon: <Target /> },
          { id: "privacy", label: "Privacy", icon: <Lock /> },
          { id: "advanced", label: "Advanced settings", icon: <Settings2 /> },
        ]} />
      </aside>

      <div className="company-info-editor">
        {/* This page shows the profile; the wizard is where it changes. The
            edit button used to live only under Advanced settings, below
            fields that looked editable and weren't. */}
        <header>
          <h2>What Alacrán knows about your business</h2>
          <span>Alacrán reads this before it answers your questions. Keep it current.</span>
          <div className="company-info-actions">
            {flags && (flags.showSetupCompanyButton || flags.showEditCompanyButton) ? (
              <div className="company-info-edit">
                <CompanySetupWizard
                  agentId={agent.id}
                  companyName={agent.name}
                  mode={flags.showSetupCompanyButton ? undefined : "edit"}
                  showVisibleRunOption={flags.showVisibleRunOption}
                  aiReady={aiReady}
                />
              </div>
            ) : null}
            {flags?.showCompanyGuide ? <CompanyGuideLink /> : null}
          </div>
        </header>

        {/* Asking a question here, and every command, runs on this AI
            (ask-company-impl resolves it per company). It used to be
            advanced-only and inside the collapsed panel below. */}
        {flags?.showAiExecutorPicker ? (
          <section id="ai" className="company-info-ai">
            <h3>Your AI</h3>
            <AiExecutorPicker agentId={agent.id} currentExecutorId={flags.aiExecutorId ?? DEFAULT_AI_EXECUTOR_ID} readiness={readiness} />
            <p>Pick the AI that answers your questions and does the work for this company, using your own account. Switch any time.</p>
          </section>
        ) : null}

        <section id="basics"><h3>Business name</h3><div className="company-info-value">{agent.name}</div><p>The name people know your business by.</p></section>
        <section id="customers"><h3>Who you help</h3><div className="company-info-value">{customers}</div><p>The customers and communities your work is for.</p></section>
        <section id="offers"><h3>What you offer</h3><div className="company-info-value">{offerings}</div><p>Your main products or services.</p></section>
        <section id="work"><h3>Team and responsibilities</h3><div className="company-info-value">{roles}</div><p>The people and roles responsible for moving work forward.</p></section>
        <section id="privacy" className="company-info-privacy"><Lock /><div><strong>Your files stay on this computer</strong><p>When you ask Alacrán something, the relevant part of this is sent to the AI you&apos;ve connected (Claude, unless you chose another) so it can answer.</p></div></section>

        <details id="advanced" className="company-info-advanced">
          <summary><span><Settings2 />Advanced settings</span><ChevronRight /></summary>
          {result && flags ? <AgentCard agent={agent} latestActivity={latest} error={result.error} avatarUrl={avatar} availableGoogleAccounts={availableGoogleAccounts} terminalStatus={getCompanyTerminalStatus(agent.id)} layout="panel" {...flags} /> : null}
        </details>
      </div>
    </main>
  )
}
