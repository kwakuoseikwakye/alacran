"use client"

import Link from "next/link"
import { useState } from "react"
import { useSearchParams } from "next/navigation"
import {
  ArrowRight,
  BarChart3,
  FileText,
  Lightbulb,
  ListChecks,
  Database,
  Receipt,
} from "lucide-react"
import { AddContentModal, AddLeadModal, AddTransactionModal } from "@/components/os/department/modals"
import { Composer, sendToAssistant } from "@/components/os/composer"
import { LoopStrip } from "@/components/os/loop-strip"

const OUTCOME_STARTERS = [
  { title: "Prepare my daily brief", detail: "Summarize what changed and what needs my attention.", icon: ListChecks },
  { title: "Think through a decision", detail: "Compare the options using my company context.", icon: Lightbulb },
  { title: "Summarize customer feedback", detail: "Find patterns, risks, and the strongest next move.", icon: BarChart3 },
  { title: "Draft an update", detail: "Turn recent progress into a clear team or stakeholder update.", icon: FileText },
]

export function AskWorkspace({ companyId = "alacran-app" }: { companyId?: string }) {
  const searchParams = useSearchParams()
  // The three "add" shortcuts used to stage made-up records (an Acme lead, a
  // $145 hosting bill, an article about AI operating systems) that one click
  // committed into the user's real files. They open the same empty forms the
  // department pages use instead.
  const [saved, setSaved] = useState<"lead" | "money" | "content" | null>(null)
  function recordSaved(kind: "lead" | "money" | "content") { setSaved(kind) }
  const [adding, setAdding] = useState<"lead" | "money" | "content" | null>(null)

  return (
    <main className="ask-workspace" aria-labelledby="ask-title">
      <header className="ask-workspace-header">
        <h1 id="ask-title">What do you want to get done?</h1>
        <p>Turn your questions into progress. Tell Alacrán what you need, and it will help you get there.</p>
        <LoopStrip current="ask" />
      </header>

      <Composer
        companyId={companyId}
        initial={searchParams.get("starter") ?? ""}
        placeholder="Ask anything, or describe what you want to get done"
      />
      <p className="ask-workspace-privacy">Your files stay on this computer. AI requests go only to your chosen provider.</p>

      {saved && <p role="status" className="mb-4 rounded-lg border border-os-border p-4 text-sm">Saved. <Link className="underline" href={`/c/${companyId}/${saved === "lead" ? "funnel" : saved === "money" ? "finances" : "content"}`}>View {saved === "lead" ? "leads" : saved === "money" ? "money records" : "content ideas"}</Link></p>}
      <Link href={`/c/${companyId}/records`} className="mb-5 inline-block text-sm underline">Browse all saved records</Link>
      <section className="mb-6 space-y-3" aria-labelledby="record-actions-title">
        <div className="ask-workspace-section-heading">
          <p>Quick add</p>
          <h2 id="record-actions-title">Add to your records</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {([
            { id: "lead", title: "Add a lead", detail: "Someone who might buy from you", icon: Database, tone: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" },
            { id: "money", title: "Log money in or out", detail: "A sale, a bill, or an expense", icon: Receipt, tone: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20" },
            { id: "content", title: "Add a content idea", detail: "A post, newsletter, or article", icon: FileText, tone: "bg-indigo-500/10 text-indigo-400 border-indigo-500/20" },
          ] as const).map(({ id, title, detail, icon: Icon, tone }) => (
            <button
              key={id}
              type="button"
              onClick={() => setAdding(id)}
              className="flex items-start gap-3 p-3.5 rounded-lg border border-os-border bg-os-surface hover:bg-os-surface2 text-left transition-colors"
            >
              <span className={`p-2 rounded-md border ${tone}`}>
                <Icon className="w-4 h-4" />
              </span>
              <div>
                <strong className="block text-xs font-semibold text-os-text">{title}</strong>
                <small className="text-[11px] text-muted-foreground">{detail}</small>
              </div>
            </button>
          ))}
        </div>
        <AddLeadModal onSaved={() => recordSaved("lead")} companyId={companyId} isOpen={adding === "lead"} onClose={() => setAdding(null)} />
        <AddTransactionModal onSaved={() => recordSaved("money")} companyId={companyId} isOpen={adding === "money"} onClose={() => setAdding(null)} />
        <AddContentModal onSaved={() => recordSaved("content")} companyId={companyId} isOpen={adding === "content"} onClose={() => setAdding(null)} />
      </section>

      {/* Outcome Starters */}
      <section className="ask-workspace-starters" aria-labelledby="starter-title">
        <div className="ask-workspace-section-heading">
          <p>Get started</p>
          <h2 id="starter-title">Choose an outcome</h2>
        </div>
        <div className="ask-workspace-list">
          {OUTCOME_STARTERS.map(({ title, detail, icon: Icon }) => (
            <button key={title} type="button" onClick={() => sendToAssistant(title, companyId)}>
              <span className="ask-workspace-icon"><Icon aria-hidden /></span>
              <span><strong>{title}</strong><small>{detail}</small></span>
              <ArrowRight aria-hidden />
            </button>
          ))}
        </div>
      </section>

    </main>
  )
}
