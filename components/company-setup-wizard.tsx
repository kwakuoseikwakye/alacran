"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useAdvancedMode } from "@/components/advanced-only"
import {
  ArrowRight,
  ArrowLeft,
  Check,
  Sparkles,
  Plus,
  Trash2,
  Building2,
  Users,
  ArrowDownLeft,
  ArrowUpRight,
  Activity,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { saveCompanyOntology } from "@/lib/save-company-ontology"
import { getCompanyOntology } from "@/lib/get-company-ontology"
import type { Stakeholder } from "@/lib/build-company-ontology"
import { formatDefineCompanyFields } from "@/lib/format-define-company-fields"
import { DefineCompanyAiDraft } from "@/components/define-company-ai-draft"
import { VisibleRunToggle } from "@/components/visible-run-toggle"
import { SessionNotesToggle } from "@/components/session-notes-toggle"
import { SetupReviewActions } from "@/components/setup-review-actions"

export const COMPANY_SETUP_BLURB =
  "Tell your AI assistant about your business. This durable context powers every agent, decision, and autonomous workflow."

const STEPS = ["about", "stakeholders", "value-flow", "bottleneck", "review"] as const
type Step = (typeof STEPS)[number]

const STEP_LABELS: Record<Step, { num: string; title: string }> = {
  about: { num: "01", title: "What you do" },
  stakeholders: { num: "02", title: "Who's involved" },
  "value-flow": { num: "03", title: "How work flows" },
  bottleneck: { num: "04", title: "What's hardest" },
  review: { num: "05", title: "Check & save" },
}

export function CompanySetupWizard({
  agentId,
  companyName,
  mode = "create",
  showVisibleRunOption,
  aiReady = true,
}: {
  agentId: string
  companyName: string
  /** "edit" prefills every field from the company's saved company.yaml on open. */
  mode?: "create" | "edit"
  showVisibleRunOption?: boolean
  /** False when the company's AI is not ready: the AI path then says to connect it first. */
  aiReady?: boolean
}) {
  const router = useRouter()
  const advanced = useAdvancedMode()
  const [open, setOpen] = useState(false)
  const [loadingExisting, setLoadingExisting] = useState(false)
  const [step, setStep] = useState<Step>("about")
  const [domain, setDomain] = useState("")
  const [employeeCount, setEmployeeCount] = useState("")
  const [stakeholders, setStakeholders] = useState<Stakeholder[]>([{ role: "", position: "" }])
  const [valueFlow, setValueFlow] = useState({ input: "", transform: "", output: "" })
  const [bottleneck, setBottleneck] = useState("")
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [aiDraftFields, setAiDraftFields] = useState<Record<string, string> | null>(null)

  const draftKey = `alacran.company-setup.${agentId}`
  useEffect(() => {
    if (!open || loadingExisting) return
    try { localStorage.setItem(draftKey, JSON.stringify({ step, domain, employeeCount, stakeholders, valueFlow, bottleneck })) } catch { /* Storage can be disabled. */ }
  }, [open, loadingExisting, draftKey, step, domain, employeeCount, stakeholders, valueFlow, bottleneck])
  const stepIndex = STEPS.indexOf(step)

  function resetAndClose() {
    try { localStorage.removeItem(draftKey) } catch { /* Storage can be disabled. */ }
    setOpen(false)
    setStep("about")
    setDomain("")
    setEmployeeCount("")
    setStakeholders([{ role: "", position: "" }])
    setValueFlow({ input: "", transform: "", output: "" })
    setBottleneck("")
    setMessage(null)
    setAiDraftFields(null)
  }

  async function openWizard() {
    setOpen(true)
    try {
      const draft = JSON.parse(localStorage.getItem(draftKey) ?? "null")
      if (draft && typeof draft.domain === "string" && Array.isArray(draft.stakeholders) && draft.stakeholders.every((item: Stakeholder) => typeof item.role === "string" && typeof item.position === "string") && typeof draft.valueFlow?.input === "string" && typeof draft.valueFlow?.transform === "string" && typeof draft.valueFlow?.output === "string") {
        setDomain(draft.domain)
        setEmployeeCount(typeof draft.employeeCount === "string" ? draft.employeeCount : "")
        setStakeholders(draft.stakeholders)
        setValueFlow(draft.valueFlow)
        setBottleneck(typeof draft.bottleneck === "string" ? draft.bottleneck : "")
        setStep(STEPS.includes(draft.step) ? draft.step : "about")
        setMessage("Resuming your saved setup draft.")
        return
      }
    } catch { /* Use saved company details if the local draft cannot be read. */ }
    if (mode !== "edit") return
    setLoadingExisting(true)
    setMessage(null)
    try {
      const result = await getCompanyOntology(agentId)
      if (!result.ok) {
        // A new company has no answers saved yet (its file is a starter pack's
        // example): start empty. This used to show every new user a red
        // "company.yaml has no company_summary section".
        if (!result.nothingSaved) {
          setMessage("Couldn't read what you saved before. You can still fill this in; saving replaces it.")
        }
        return
      }
      const { answers } = result
      setDomain(answers.domain)
      setEmployeeCount(answers.employeeCount !== undefined ? String(answers.employeeCount) : "")
      setStakeholders(answers.stakeholders.length > 0 ? answers.stakeholders : [{ role: "", position: "" }])
      setValueFlow(answers.valueFlow)
      setBottleneck(answers.bottleneck)
    } catch (err) {
      setMessage(`Couldn't load company details: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setLoadingExisting(false)
    }
  }

  function handleStartAiDraft() {
    setMessage(null)
    setAiDraftFields(formatDefineCompanyFields({ domain, stakeholders, valueFlow, bottleneck }))
  }

  function handleCancelAiDraft() {
    setAiDraftFields(null)
  }

  // The draft is a pending review now, not something this dialog approves.
  // Its answers went into the run, so clear the local draft with the dialog.
  function handleReviewReady() {
    resetAndClose()
    router.push(`/c/${agentId}/tasks`)
  }

  function goNext() {
    if (stepIndex < STEPS.length - 1) {
      setStep(STEPS[stepIndex + 1])
    }
  }

  function goBack() {
    if (stepIndex > 0) {
      setStep(STEPS[stepIndex - 1])
    }
  }

  function updateStakeholder(index: number, field: keyof Stakeholder, value: string) {
    setStakeholders((prev) => prev.map((s, i) => (i === index ? { ...s, [field]: value } : s)))
  }

  function addStakeholder() {
    setStakeholders((prev) => [...prev, { role: "", position: "" }])
  }

  function removeStakeholder(index: number) {
    setStakeholders((prev) => prev.filter((_, i) => i !== index))
  }

  async function handleSave() {
    setPending(true)
    setMessage(null)
    try {
      const result = await saveCompanyOntology(agentId, {
        domain,
        employeeCount: employeeCount.trim() ? Number(employeeCount) : undefined,
        stakeholders: stakeholders.filter((s) => s.role.trim() && s.position.trim()),
        valueFlow,
        bottleneck,
      })
      if (result.ok) {
        resetAndClose()
        router.refresh()
      } else {
        setMessage(result.message)
      }
    } catch (err) {
      setMessage(`Couldn't save: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setPending(false)
    }
  }

  const canGoNext = step !== "about" || domain.trim().length > 0

  return (
    <>
      <Button
        size="sm"
        variant={mode === "edit" ? "outline" : "default"}
        className="w-full text-xs cursor-pointer border-os-border hover:border-os-border-strong"
        onClick={() => void openWizard()}
      >
        {mode === "edit" ? "Edit company details" : "Tell Alacrán about your business"}
      </Button>

      {/* Closing keeps the draft: this is a five-step form, and Esc or a stray
          click outside used to wipe every answer. Saving is what clears it. */}
      <Dialog open={open} onOpenChange={(next) => !next && setOpen(false)}>
        <DialogContent className="max-w-2xl bg-os-surface border border-os-border-strong text-os-text shadow-2xl p-6 rounded-2xl">
          <DialogHeader className="pb-4 border-b border-os-border/70">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-os-dim mb-1">
                  About your business
                </p>
                <DialogTitle className="text-xl font-bold text-os-text">
                  {mode === "edit" ? `Edit what Alacrán knows about ${companyName}` : `Tell me about ${companyName}`}
                </DialogTitle>
              </div>
              <span className="font-mono text-xs px-2 py-0.5 rounded-full border border-os-border bg-os-surface2 text-os-accent font-bold">
                {STEP_LABELS[step].num} / 05
              </span>
            </div>

            {/* Visual Step Progress Dots */}
            <div className="flex items-center gap-1.5 pt-3">
              {STEPS.map((s, idx) => {
                const isActive = s === step
                const isPast = idx < stepIndex
                return (
                  <button
                    type="button"
                    key={s}
                    onClick={() => {
                      if (isPast || (idx <= stepIndex + 1 && canGoNext)) {
                        setStep(s)
                      }
                    }}
                    className={`h-1.5 flex-1 rounded-full transition-all cursor-pointer ${
                      isActive
                        ? "bg-os-accent shadow-[0_0_8px_var(--accent-line)]"
                        : isPast
                        ? "bg-os-ok/70"
                        : "bg-os-border"
                    }`}
                    title={STEP_LABELS[s].title}
                  />
                )
              })}
            </div>
          </DialogHeader>

          <div className="py-4 space-y-4">
            {/* Terminal and session-note switches are for Advanced mode, not the
                first thing a new user reads when describing their business. */}
            {showVisibleRunOption && advanced && (
              <div className="flex flex-wrap gap-4 border-b border-os-border/60 pb-3">
                <VisibleRunToggle agentId={agentId} />
                <SessionNotesToggle agentId={agentId} />
              </div>
            )}

            {loadingExisting && (
              <div className="py-12 text-center font-mono text-sm text-os-dim animate-pulse">
                Loading what you saved before…
              </div>
            )}

            {!loadingExisting && step === "about" && (
              <div className="space-y-4">
                <div className="rounded-xl border border-os-border bg-os-surface2/50 p-4 space-y-3">
                  <div className="flex items-center gap-2 text-sm font-semibold text-os-text">
                    <Building2 className="h-4 w-4 text-os-accent" />
                    <span>What does your business do, and for whom?</span>
                  </div>
                  <p className="text-xs text-os-dim leading-relaxed">
                    A sentence or two in your own words is plenty.
                  </p>
                  <Textarea
                    value={domain}
                    onChange={(e) => setDomain(e.target.value)}
                    className="min-h-24 text-sm bg-os-surface border-os-border text-os-text focus:border-os-border-strong rounded-lg"
                    placeholder="e.g. We cater events for companies in Accra: office lunches, launches and weddings."
                  />
                </div>

                <div className="rounded-xl border border-os-border bg-os-surface2/40 p-4 space-y-2">
                  <label className="text-xs font-semibold text-os-text">
                    How many people work in it? (optional)
                  </label>
                  <Input
                    type="number"
                    min="0"
                    value={employeeCount}
                    onChange={(e) => setEmployeeCount(e.target.value)}
                    placeholder="e.g. 4"
                    className="text-sm bg-os-surface border-os-border text-os-text w-32 rounded-lg"
                  />
                </div>
              </div>
            )}

            {!loadingExisting && step === "stakeholders" && (
              <div className="space-y-4">
                <div className="rounded-xl border border-os-border bg-os-surface2/40 p-4 space-y-2">
                  <div className="flex items-center gap-2 text-sm font-semibold text-os-text">
                    <Users className="h-4 w-4 text-os-accent" />
                    <span>Who&apos;s involved?</span>
                  </div>
                  <p className="text-xs text-os-dim">
                    Your customers, your team, your suppliers: anyone the business depends on.
                  </p>
                </div>

                <div className="space-y-2.5 max-h-60 overflow-y-auto pr-1">
                  {stakeholders.map((s, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-2 rounded-lg border border-os-border bg-os-surface p-2"
                    >
                      <Input
                        value={s.role}
                        onChange={(e) => updateStakeholder(i, "role", e.target.value)}
                        placeholder="Who (e.g. Customer, Head chef)"
                        className="text-sm bg-os-surface2 border-os-border flex-1"
                      />
                      <Input
                        value={s.position}
                        onChange={(e) => updateStakeholder(i, "position", e.target.value)}
                        placeholder="What they do (e.g. Orders and pays, plans the menus)"
                        className="text-sm bg-os-surface2 border-os-border flex-1"
                      />
                      {stakeholders.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeStakeholder(i)}
                          className="p-1.5 text-os-dim hover:text-os-err transition-colors cursor-pointer"
                          title="Remove"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={addStakeholder}
                  className="text-xs border-os-border hover:border-os-border-strong cursor-pointer"
                >
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Add someone
                </Button>
              </div>
            )}

            {!loadingExisting && step === "value-flow" && (
              <div className="space-y-4">
                <div className="rounded-xl border border-os-border bg-os-surface2/40 p-4 space-y-1">
                  <div className="flex items-center gap-2 text-sm font-semibold text-os-text">
                    <Activity className="h-4 w-4 text-os-accent" />
                    <span>How work flows</span>
                  </div>
                  <p className="text-xs text-os-dim">
                    Where a job comes from, what you do with it, and what the customer gets at the end.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {/* Step 1: Inbound */}
                  <div className="rounded-xl border border-os-border bg-os-surface p-3.5 space-y-2">
                    <div className="flex items-center gap-1.5 font-mono text-[10px] text-os-accent font-bold uppercase tracking-wider">
                      <ArrowDownLeft className="h-3 w-3" />
                      <span>Work comes in</span>
                    </div>
                    <p className="text-[11px] text-os-dim">
                      How a job starts.
                    </p>
                    <Textarea
                      value={valueFlow.input}
                      onChange={(e) => setValueFlow((v) => ({ ...v, input: e.target.value }))}
                      placeholder="e.g. A WhatsApp message asking for a quote"
                      className="min-h-24 text-sm bg-os-surface2 border-os-border text-os-text"
                    />
                  </div>

                  {/* Step 2: Transform */}
                  <div className="rounded-xl border border-os-border bg-os-surface p-3.5 space-y-2">
                    <div className="flex items-center gap-1.5 font-mono text-[10px] text-os-ok font-bold uppercase tracking-wider">
                      <Sparkles className="h-3 w-3" />
                      <span>You do the work</span>
                    </div>
                    <p className="text-[11px] text-os-dim">
                      What you and your team do.
                    </p>
                    <Textarea
                      value={valueFlow.transform}
                      onChange={(e) => setValueFlow((v) => ({ ...v, transform: e.target.value }))}
                      placeholder="e.g. Send a quote, agree the menu, cook and deliver"
                      className="min-h-24 text-sm bg-os-surface2 border-os-border text-os-text"
                    />
                  </div>

                  {/* Step 3: Output */}
                  <div className="rounded-xl border border-os-border bg-os-surface p-3.5 space-y-2">
                    <div className="flex items-center gap-1.5 font-mono text-[10px] text-os-text font-bold uppercase tracking-wider">
                      <ArrowUpRight className="h-3 w-3" />
                      <span>The customer gets</span>
                    </div>
                    <p className="text-[11px] text-os-dim">
                      What they receive at the end.
                    </p>
                    <Textarea
                      value={valueFlow.output}
                      onChange={(e) => setValueFlow((v) => ({ ...v, output: e.target.value }))}
                      placeholder="e.g. A delivered event and an invoice"
                      className="min-h-24 text-sm bg-os-surface2 border-os-border text-os-text"
                    />
                  </div>
                </div>
              </div>
            )}

            {!loadingExisting && step === "bottleneck" && (
              <div className="space-y-4">
                <div className="rounded-xl border border-os-border bg-os-surface2/40 p-4 space-y-2">
                  <div className="flex items-center gap-2 text-sm font-semibold text-os-text">
                    <Sparkles className="h-4 w-4 text-os-warn" />
                    <span>What takes up most of your time right now?</span>
                  </div>
                  <p className="text-xs text-os-dim">
                    The thing you wish you could hand off. Alacrán will look for ways to help with it first.
                  </p>
                </div>

                <div className="rounded-xl border border-os-border bg-os-surface p-4 space-y-2">
                  <Textarea
                    value={bottleneck}
                    onChange={(e) => setBottleneck(e.target.value)}
                    className="min-h-28 text-sm bg-os-surface2 border-os-border text-os-text focus:border-os-border-strong rounded-lg"
                    placeholder="e.g. Chasing unpaid invoices by hand every Friday"
                  />
                </div>
              </div>
            )}

            {!loadingExisting && step === "review" && !aiDraftFields && (
              <div className="space-y-4">
                <div className="rounded-xl border border-os-border bg-os-surface2/40 p-3.5 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs text-os-muted">
                    <Check className="h-4 w-4 text-os-ok" />
                    <span>Check this looks right. You can change it any time.</span>
                  </div>
                </div>

                <div className="rounded-xl border border-os-border bg-os-surface p-4 text-sm space-y-3 max-h-60 overflow-y-auto">
                  <div>
                    <span className="text-os-dim uppercase text-[10px] tracking-wider block">What you do</span>
                    <p className="text-os-text">{domain || "Not filled in"}</p>
                    {employeeCount && <p className="text-os-dim mt-0.5">{employeeCount} {employeeCount === "1" ? "person" : "people"}</p>}
                  </div>

                  <div>
                    <span className="text-os-dim uppercase text-[10px] tracking-wider block">Who&apos;s involved</span>
                    {stakeholders.filter((s) => s.role.trim()).length > 0 ? (
                      stakeholders.map((s, i) => (
                        <div key={i} className="text-os-muted">
                          <span className="text-os-accent">{s.role}</span>: {s.position}
                        </div>
                      ))
                    ) : (
                      <p className="text-os-dim">No one added yet</p>
                    )}
                  </div>

                  <div>
                    <span className="text-os-dim uppercase text-[10px] tracking-wider block">How work flows</span>
                    <p className="text-os-muted">
                      <span className="text-os-dim">Comes in:</span> {valueFlow.input || "—"} →{" "}
                      <span className="text-os-dim">You do:</span> {valueFlow.transform || "—"} →{" "}
                      <span className="text-os-dim">They get:</span> {valueFlow.output || "—"}
                    </p>
                  </div>

                  <div>
                    <span className="text-os-dim uppercase text-[10px] tracking-wider block">Hardest right now</span>
                    <p className="text-os-muted">{bottleneck || "Not filled in"}</p>
                  </div>
                </div>
              </div>
            )}

            {!loadingExisting && step === "review" && aiDraftFields && (
              <DefineCompanyAiDraft
                agentId={agentId}
                fieldValues={aiDraftFields}
                onBack={handleCancelAiDraft}
                onReviewReady={handleReviewReady}
              />
            )}

            {!loadingExisting && !aiDraftFields && message && (
              <div className="rounded-lg border border-os-err/40 bg-os-err/10 p-2.5 font-mono text-xs text-os-err">
                {message}
              </div>
            )}
          </div>

          {!loadingExisting && !aiDraftFields && (
            <div className="flex items-center justify-between pt-3 border-t border-os-border/70">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={goBack}
                disabled={stepIndex === 0 || pending}
                className="font-mono text-xs text-os-dim cursor-pointer"
              >
                <ArrowLeft className="h-3.5 w-3.5 mr-1" />
                Back
              </Button>

              {step === "review" ? (
                <SetupReviewActions
                  aiReady={aiReady}
                  pending={pending}
                  connectHref={`/c/${agentId}/dashboard`}
                  onDraft={handleStartAiDraft}
                  onSave={handleSave}
                />
              ) : (
                <Button
                  type="button"
                  size="sm"
                  onClick={goNext}
                  disabled={pending || !canGoNext}
                  className="text-sm bg-os-surface2 text-os-text hover:bg-os-surface3 border border-os-border font-medium cursor-pointer"
                >
                  Continue
                  <ArrowRight className="h-3.5 w-3.5 ml-1" />
                </Button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
