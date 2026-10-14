import path from "node:path"
import { ExecutorGapNote } from "@/components/executor-gap-note"
import Link from "next/link"
import { notFound } from "next/navigation"
import { getEffectiveAgents } from "@/lib/get-effective-agents"
import { COMPANY_COMMANDS_DATA_DIR } from "@/lib/company-commands/paths"
import { listProspects } from "@/lib/leads-customers/prospects"
import { ResearchProspectsForm } from "@/components/leads-customers/research-prospects-form"
import { ProspectList } from "@/components/leads-customers/prospect-list"
import { Globe, FileSpreadsheet } from "lucide-react"

export const dynamic = "force-dynamic"

export default async function FunnelPage({
  params,
}: {
  params: Promise<{ companyId: string }>
}) {
  const { companyId } = await params
  const agents = await getEffectiveAgents()
  const agent = agents.find((a) => a.id === companyId)
  if (!agent) notFound()

  const runRecordPath = path.join(COMPANY_COMMANDS_DATA_DIR, agent.id, "research-prospects.run.json")
  const prospects = await listProspects(agent.rootPath, runRecordPath)

  const waiting = prospects.filter((p) => p.state === "waiting")
  const ready = prospects.filter((p) => p.state === "ready")
  const contacted = prospects.filter((p) => p.state === "contacted").reverse()

  return (
    <main className="dash-content space-y-8 pb-12" aria-labelledby="leads-title">
      <header>
        <h1 id="leads-title" className="text-3xl font-semibold text-foreground">Leads & customers</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Alacrán researches target companies against your ontology and drafts tailored outreach angles. Nothing is sent without you.
        </p>
      </header>

      {/* 1. Connected Tools */}
      <section aria-labelledby="leads-tools" className="space-y-3">
        <h2 id="leads-tools" className="text-sm font-semibold tracking-wider uppercase text-muted-foreground">Connected tools</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex items-center justify-between p-4 rounded-xl border border-os-border bg-os-surface">
            <div className="flex items-center gap-3">
              <Globe className="h-5 w-5 text-os-accent" />
              <div>
                <strong className="block text-sm font-medium text-foreground">Web & Market Research</strong>
                <span className="text-xs text-muted-foreground">Inspects target domains and industry context</span>
              </div>
            </div>
            <span className="text-xs font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">Ready</span>
          </div>

          <div className="flex items-center justify-between p-4 rounded-xl border border-os-border bg-os-surface">
            <div className="flex items-center gap-3">
              <FileSpreadsheet className="h-5 w-5 text-muted-foreground" />
              <div>
                <strong className="block text-sm font-medium text-foreground">Spreadsheet & CRM Export</strong>
                <span className="text-xs text-muted-foreground">Format active prospects for Sheets or HubSpot</span>
              </div>
            </div>
            <span className="text-xs font-mono text-muted-foreground bg-muted/20 px-2 py-0.5 rounded border border-os-border">Available</span>
          </div>
        </div>
      </section>

      {/* 2. Jobs */}
      <section aria-labelledby="leads-jobs" className="space-y-3">
        <h2 id="leads-jobs" className="text-sm font-semibold tracking-wider uppercase text-muted-foreground">Find & research prospects</h2>
        <div className="rounded-xl border border-os-border bg-os-surface p-5">
          <ResearchProspectsForm agentId={agent.id} />
          <ExecutorGapNote agentId={agent.id} need="outside-text" />
        </div>
      </section>

      {/* 3. Waiting for you */}
      <section aria-labelledby="leads-waiting" className="space-y-3">
        <h2 id="leads-waiting" className="text-sm font-semibold tracking-wider uppercase text-muted-foreground">
          Waiting for you {waiting.length > 0 && `(${waiting.length})`}
        </h2>
        <ProspectList
          prospects={waiting}
          agentId={agent.id}
          empty="Nothing waiting. Prospects you research appear here to approve."
        />
      </section>

      {/* 4. Ready to reach out */}
      <section aria-labelledby="leads-ready" className="space-y-3">
        <h2 id="leads-ready" className="text-sm font-semibold tracking-wider uppercase text-muted-foreground">
          Ready to reach out {ready.length > 0 && `(${ready.length})`}
        </h2>
        <ProspectList
          prospects={ready}
          agentId={agent.id}
          empty="Approved prospects appear here, ready to copy and contact."
        />
      </section>

      {/* 5. What Alacrán remembers */}
      <section aria-labelledby="leads-memory" className="space-y-3">
        <h2 id="leads-memory" className="text-sm font-semibold tracking-wider uppercase text-muted-foreground">What Alacrán remembers</h2>
        <div className="rounded-xl border border-os-border bg-os-surface p-5 text-sm space-y-4">
          {contacted.length === 0 ? (
            <p className="text-muted-foreground italic">
              Prospects you mark as contacted are remembered here, preventing duplicate outreach in future runs.
            </p>
          ) : (
            <ul className="divide-y divide-os-border/50">
              {contacted.map((c) => (
                <li key={c.fileName} className="py-2 flex items-center justify-between text-xs">
                  <div>
                    <strong className="text-foreground font-medium">{c.company}</strong>
                    <span className="text-muted-foreground ml-2">({c.name} · {c.role})</span>
                  </div>
                  <span className="font-mono text-muted-foreground">Contacted {c.contactedOn || c.updated}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="pt-2 flex items-center justify-between border-t border-os-border/60 text-xs">
            <span className="text-muted-foreground">Canonical index: records/funnel/leads.yaml</span>
            <Link href={`/c/${agent.id}/files`} className="text-os-accent hover:underline">
              Inspect raw files →
            </Link>
          </div>
        </div>
      </section>
    </main>
  )
}
