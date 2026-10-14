"use client"

import { useState, Fragment } from "react"
import { Workflow as WorkflowIcon } from "lucide-react"
import type { Workflow } from "@/lib/os/schemas/workflows"
import { StepCard } from "./step-card"
import { Edge } from "./edge"
import { WorkflowLedger } from "./workflow-ledger"
import { computeWorkflowStats } from "@/lib/os/workflows/stats"

export function getWorkflowById(
  workflows: Workflow[],
  id?: string | null
): Workflow | null {
  if (!workflows || workflows.length === 0) {
    return null
  }
  if (id) {
    const found = workflows.find((w) => w.id === id)
    if (found) {
      return found
    }
  }
  return workflows[0]
}

export function WorkflowMap({
  workflows,
  companyId,
}: {
  workflows: Workflow[]
  companyId: string
}) {
  const [selectedId, setSelectedId] = useState<string | undefined>(
    workflows[0]?.id
  )
  const activeWorkflow = getWorkflowById(workflows, selectedId)

  if (workflows.length === 0 || !activeWorkflow) {
    return (
      <div className="rounded-xl border border-os-border bg-os-surface p-8 text-center flex flex-col items-center justify-center gap-3">
        <div className="w-10 h-10 rounded-full bg-os-surface2 border border-os-border flex items-center justify-center text-os-dim">
          <WorkflowIcon className="h-5 w-5" />
        </div>
        <div className="space-y-1">
          <h3 className="text-sm font-semibold text-os-text">
            No Workflows Declared
          </h3>
          <p className="text-xs text-os-muted max-w-md">
            No workflows are declared yet. Declare recurring operational
            processes and automation maps in{" "}
            <code className="font-mono text-os-accent bg-os-surface2 px-1.5 py-0.5 rounded border border-os-border/50">
              records/workflows/processes.yaml
            </code>
            .
          </p>
        </div>
      </div>
    )
  }

  const stats = computeWorkflowStats(activeWorkflow.steps)

  return (
    <div className="flex flex-col gap-6">
      {/* Top Bar: Tabs Strip */}
      <div className="flex flex-wrap items-center gap-2 border-b border-os-border/60 pb-3">
        {workflows.map((w) => {
          const isActive = w.id === activeWorkflow.id
          return (
            <button
              key={w.id}
              type="button"
              onClick={() => setSelectedId(w.id)}
              className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                isActive
                  ? "border-os-accent bg-os-accent/10 text-os-accent shadow-sm"
                  : "border-os-border bg-os-surface text-os-muted hover:border-os-border-strong hover:text-os-text"
              }`}
            >
              <span>{w.name}</span>
              <span
                className={`rounded px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider ${
                  isActive
                    ? "bg-os-accent/20 text-os-accent font-semibold"
                    : "bg-os-surface2 text-os-dim border border-os-border/50"
                }`}
              >
                {w.department}
              </span>
            </button>
          )
        })}
      </div>

      {/* Workflow Description */}
      {activeWorkflow.description && (
        <div className="text-xs text-os-muted -mt-2">
          <p>{activeWorkflow.description}</p>
        </div>
      )}

      {/* Horizontal Canvas */}
      <div className="rounded-xl border border-os-border bg-os-surface/40 p-4">
        <div className="overflow-x-auto py-6">
          <div className="flex items-center min-w-max px-2">
            {activeWorkflow.steps.length === 0 ? (
              <p className="text-xs text-os-dim py-4 italic">
                No steps defined for this workflow.
              </p>
            ) : (
              activeWorkflow.steps.map((step, index) => (
                <Fragment key={step.id}>
                  <StepCard step={step} companyId={companyId} />
                  {index < activeWorkflow.steps.length - 1 && (
                    <Edge label={step.edge_label} />
                  )}
                </Fragment>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Bottom: Workflow Ledger */}
      <WorkflowLedger stats={stats} />
    </div>
  )
}
