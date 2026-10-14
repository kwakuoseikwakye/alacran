"use client"

import React from "react"
import Link from "next/link"
import {
  ArrowRight,
  AlertTriangle,
  Layers,
  Cpu,
  PackageCheck,
  Radio,
  CheckCircle2,
  GitPullRequest,
  ExternalLink,
  Users,
  FileCode,
  Copy,
  Check,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"

export interface AcquisitionChannel {
  channel: string
  notes?: string
}

export interface CustomerSegment {
  id: string
  name: string
  job_to_be_done?: string
  alternative?: string
}

export interface ValuePipelineFlowObject {
  input: string
  transform: string
  output: string
}

export interface ValuePipelineFlowStep {
  step: string
  owner?: string
}

export type ValuePipelineFlow = ValuePipelineFlowObject | ValuePipelineFlowStep[]

export interface ValuePipelineViewProps {
  companyId: string
  domain: string
  acquisition: AcquisitionChannel[]
  valueFlow: ValuePipelineFlow
  bottleneck?: string
  segments: CustomerSegment[]
  rawYaml?: string
}

export function ValuePipelineView({
  companyId,
  domain,
  acquisition = [],
  valueFlow,
  bottleneck,
  segments = [],
  rawYaml = "",
}: ValuePipelineViewProps) {
  const [ontologyModalOpen, setOntologyModalOpen] = React.useState(false)
  const [copied, setCopied] = React.useState(false)

  const handleCopy = React.useCallback(() => {
    if (!rawYaml) return
    navigator.clipboard.writeText(rawYaml)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [rawYaml])

  const isObjectFlow =
    valueFlow &&
    typeof valueFlow === "object" &&
    !Array.isArray(valueFlow) &&
    ("input" in valueFlow || "transform" in valueFlow || "output" in valueFlow)

  const objectFlow = isObjectFlow ? (valueFlow as ValuePipelineFlowObject) : null
  const stepsFlow = Array.isArray(valueFlow) ? (valueFlow as ValuePipelineFlowStep[]) : []

  // If array steps, distribute them across the 3 phases
  const inboundSteps = stepsFlow.length <= 3 ? stepsFlow.slice(0, 1) : stepsFlow.slice(0, 2)
  const transformSteps =
    stepsFlow.length <= 3
      ? stepsFlow.slice(1, 2)
      : stepsFlow.slice(2, Math.max(2, stepsFlow.length - 1))
  const outputSteps = stepsFlow.length <= 3 ? stepsFlow.slice(2) : stepsFlow.slice(-1)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-lg border border-border bg-card p-5 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="outline" className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                Value Pipeline &amp; Acquisition Engine
              </Badge>
              <button
                type="button"
                onClick={() => setOntologyModalOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-full border border-os-border bg-muted/60 hover:bg-muted px-2.5 py-0.5 text-[11px] font-mono text-foreground transition-colors cursor-pointer"
                title="View definitions/ontology/company.yaml"
              >
                <FileCode className="h-3 w-3 text-os-accent" />
                <span>ontology: company.yaml</span>
              </button>
            </div>
            <h1 className="text-xl font-bold tracking-tight text-foreground">
              {domain || "Company Value Pipeline"}
            </h1>
            <p className="max-w-2xl text-xs text-muted-foreground leading-relaxed">
              Value creation architecture projected from <code className="rounded bg-muted px-1 py-0.5 text-[11px] font-mono">definitions/ontology/company.yaml</code>.
              Customer segments, acquisition channels, transformation stages, and bottlenecks.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/c/${companyId}/workflows`}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              <GitPullRequest className="h-3.5 w-3.5 text-muted-foreground" />
              Workflow Engine
            </Link>
            <Link
              href={`/c/${companyId}/org`}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              <Users className="h-3.5 w-3.5 text-muted-foreground" />
              Stakeholders
            </Link>
          </div>
        </div>

        {/* Customer Segments Pills */}
        {segments.length > 0 && (
          <div className="mt-5 border-t border-border/60 pt-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider mr-1">
                Target Segments:
              </span>
              {segments.map((segment) => (
                <div
                  key={segment.id}
                  title={segment.job_to_be_done || segment.name}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-muted/40 px-3 py-1 text-xs font-medium text-foreground"
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  <span>{segment.name}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Primary Bottleneck Banner */}
      {bottleneck && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 dark:border-amber-500/20 dark:bg-amber-500/5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 rounded-md bg-amber-500/20 p-1.5 text-amber-600 dark:text-amber-400">
                <AlertTriangle className="h-4 w-4" />
              </div>
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-400">
                    Primary Operational Bottleneck
                  </span>
                  <Badge variant="outline" className="border-amber-500/30 text-[10px] text-amber-700 dark:text-amber-400 font-mono">
                    §6 Human Gate
                  </Badge>
                </div>
                <p className="text-sm font-medium text-foreground leading-snug">
                  {bottleneck}
                </p>
              </div>
            </div>

            <div className="shrink-0 self-end sm:self-center">
              <Link
                href={`/c/${companyId}/workflows?run=/decision`}
                className="inline-flex items-center gap-1.5 rounded-md bg-amber-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm transition-colors hover:bg-amber-700 dark:bg-amber-500 dark:hover:bg-amber-600"
              >
                <span>Record decision with /decision</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* 3-Column Value Pipeline Flow */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Column 1: 01 Inbound / Acquisition */}
        <div className="flex flex-col rounded-lg border border-border bg-card shadow-sm">
          <div className="flex items-center justify-between border-b border-border px-4 py-3 bg-muted/20">
            <div className="flex items-center gap-2">
              <div className="flex h-6 w-6 items-center justify-center rounded bg-blue-500/10 text-blue-600 dark:text-blue-400">
                <Radio className="h-3.5 w-3.5" />
              </div>
              <h2 className="text-sm font-semibold text-foreground tracking-tight">
                01 Inbound / Acquisition
              </h2>
            </div>
            <Badge variant="outline" className="text-[10px] font-mono">
              Inbound Stage
            </Badge>
          </div>

          <div className="flex flex-1 flex-col p-4 space-y-4">
            {/* Value Input */}
            {objectFlow?.input && (
              <div className="rounded-md border border-border/70 bg-background p-3.5 space-y-1.5">
                <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <Layers className="h-3.5 w-3.5 text-blue-500" />
                  <span>Declared Inbound Input</span>
                </div>
                <p className="text-xs text-foreground leading-relaxed font-mono">
                  {objectFlow.input}
                </p>
              </div>
            )}

            {/* Array Inbound Steps */}
            {inboundSteps.length > 0 && (
              <div className="space-y-2">
                <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Intake Steps
                </div>
                {inboundSteps.map((s, idx) => (
                  <div key={idx} className="rounded-md border border-border/70 bg-background p-3 space-y-1">
                    <p className="text-xs text-foreground leading-relaxed">{s.step}</p>
                    {s.owner && (
                      <span className="inline-block text-[10px] font-mono text-muted-foreground">
                        owner: {s.owner}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Acquisition Channels */}
            <div className="flex-1 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Acquisition Channels ({acquisition.length})
                </span>
              </div>

              {acquisition.length === 0 ? (
                <div className="rounded-md border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
                  No acquisition channels declared yet in company.yaml.
                </div>
              ) : (
                <div className="space-y-2.5">
                  {acquisition.map((ch, idx) => (
                    <div
                      key={idx}
                      className="rounded-md border border-border/80 bg-background p-3 space-y-1.5 transition-colors hover:border-blue-500/40"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-foreground">
                          {ch.channel}
                        </span>
                        <Badge variant="secondary" className="text-[10px]">
                          channel
                        </Badge>
                      </div>
                      {ch.notes && (
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          {ch.notes}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Column 2: 02 Operations / Transform */}
        <div className="flex flex-col rounded-lg border border-border bg-card shadow-sm">
          <div className="flex items-center justify-between border-b border-border px-4 py-3 bg-muted/20">
            <div className="flex items-center gap-2">
              <div className="flex h-6 w-6 items-center justify-center rounded bg-purple-500/10 text-purple-600 dark:text-purple-400">
                <Cpu className="h-3.5 w-3.5" />
              </div>
              <h2 className="text-sm font-semibold text-foreground tracking-tight">
                02 Operations / Transform
              </h2>
            </div>
            <Badge variant="outline" className="text-[10px] font-mono">
              Execution Stage
            </Badge>
          </div>

          <div className="flex flex-1 flex-col p-4 space-y-4">
            {/* Core Transformation */}
            {objectFlow?.transform && (
              <div className="rounded-md border border-border/70 bg-background p-3.5 space-y-1.5">
                <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <Cpu className="h-3.5 w-3.5 text-purple-500" />
                  <span>Core Transformation Engine</span>
                </div>
                <p className="text-xs text-foreground leading-relaxed font-mono">
                  {objectFlow.transform}
                </p>
              </div>
            )}

            {/* Array Operations Steps */}
            {transformSteps.length > 0 && (
              <div className="space-y-2">
                <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Operational Transformations
                </div>
                {transformSteps.map((s, idx) => (
                  <div key={idx} className="rounded-md border border-border/70 bg-background p-3 space-y-1">
                    <p className="text-xs text-foreground leading-relaxed">{s.step}</p>
                    {s.owner && (
                      <span className="inline-block text-[10px] font-mono text-muted-foreground">
                        owner: {s.owner}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Operational Integrity / Automation Info */}
            <div className="flex-1 rounded-md border border-dashed border-border/80 bg-muted/10 p-3.5 space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                <span>Autonomous Pipeline Integrity</span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Autonomous and assistant-guided workflows execute through scoped command packs. Any money, contract, or irreversible actions pause at designated §6 human approval gates.
              </p>
              <div className="pt-1">
                <Link
                  href={`/c/${companyId}/workflows`}
                  className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                >
                  <span>Inspect Command Flow Tracks</span>
                  <ExternalLink className="h-3 w-3" />
                </Link>
              </div>
            </div>
          </div>
        </div>

        {/* Column 3: 03 Delivered Value / Output */}
        <div className="flex flex-col rounded-lg border border-border bg-card shadow-sm">
          <div className="flex items-center justify-between border-b border-border px-4 py-3 bg-muted/20">
            <div className="flex items-center gap-2">
              <div className="flex h-6 w-6 items-center justify-center rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                <PackageCheck className="h-3.5 w-3.5" />
              </div>
              <h2 className="text-sm font-semibold text-foreground tracking-tight">
                03 Delivered Value / Output
              </h2>
            </div>
            <Badge variant="outline" className="text-[10px] font-mono">
              Delivery Stage
            </Badge>
          </div>

          <div className="flex flex-1 flex-col p-4 space-y-4">
            {/* Value Output */}
            {objectFlow?.output && (
              <div className="rounded-md border border-border/70 bg-background p-3.5 space-y-1.5">
                <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <PackageCheck className="h-3.5 w-3.5 text-emerald-500" />
                  <span>Delivered Customer Output</span>
                </div>
                <p className="text-xs text-foreground leading-relaxed font-mono">
                  {objectFlow.output}
                </p>
              </div>
            )}

            {/* Array Output Steps */}
            {outputSteps.length > 0 && (
              <div className="space-y-2">
                <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Delivered Outputs &amp; Releases
                </div>
                {outputSteps.map((s, idx) => (
                  <div key={idx} className="rounded-md border border-border/70 bg-background p-3 space-y-1">
                    <p className="text-xs text-foreground leading-relaxed">{s.step}</p>
                    {s.owner && (
                      <span className="inline-block text-[10px] font-mono text-muted-foreground">
                        owner: {s.owner}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Customer Value Retention */}
            <div className="flex-1 rounded-md border border-dashed border-border/80 bg-muted/10 p-3.5 space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                <Layers className="h-3.5 w-3.5 text-emerald-500" />
                <span>Value Fulfillment Guarantee</span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Outputs are verified against customer promises defined in ontology offerings before release or deployment.
              </p>
              <div className="pt-1">
                <Link
                  href={`/c/${companyId}/records`}
                  className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                >
                  <span>View Customer Records</span>
                  <ExternalLink className="h-3 w-3" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Ontology company.yaml Modal */}
      <Dialog open={ontologyModalOpen} onOpenChange={setOntologyModalOpen}>
        <DialogContent className="max-w-2xl sm:max-w-3xl max-h-[85vh] flex flex-col p-0 gap-0 overflow-hidden bg-card border-border">
          <DialogHeader className="p-4 border-b border-border bg-muted/30 flex flex-row items-center justify-between space-y-0">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <FileCode className="h-4 w-4 text-os-accent" />
                <DialogTitle className="text-sm font-semibold font-mono text-foreground">
                  definitions/ontology/company.yaml
                </DialogTitle>
              </div>
              <DialogDescription className="text-xs text-muted-foreground">
                Declarative ground truth facts governing business ontology and execution boundaries.
              </DialogDescription>
            </div>
            <div className="flex items-center gap-2 mr-6">
              {rawYaml && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs gap-1 font-mono cursor-pointer"
                  onClick={handleCopy}
                >
                  {copied ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-emerald-500" />
                      <span>Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" />
                      <span>Copy YAML</span>
                    </>
                  )}
                </Button>
              )}
            </div>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto p-4 bg-muted/10 font-mono text-xs text-foreground">
            {rawYaml ? (
              <pre className="whitespace-pre-wrap break-words leading-relaxed text-[11px] p-3 rounded-md bg-muted/40 border border-border/60 select-text">
                {rawYaml}
              </pre>
            ) : (
              <div className="py-12 text-center text-muted-foreground text-xs">
                No company.yaml file found yet. Run <code className="text-os-accent font-semibold">/define-company</code> in the terminal to establish company ontology.
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
