"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { saveCompanyOntology } from "@/lib/save-company-ontology"
import type { Stakeholder } from "@/lib/build-company-ontology"
import { formatDefineCompanyFields } from "@/lib/format-define-company-fields"
import { DefineCompanyAiDraft } from "@/components/define-company-ai-draft"

const STEPS = ["about", "stakeholders", "value-flow", "bottleneck", "review"] as const
type Step = (typeof STEPS)[number]

export function CompanySetupWizard({ agentId, companyName }: { agentId: string; companyName: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<Step>("about")
  const [domain, setDomain] = useState("")
  const [employeeCount, setEmployeeCount] = useState("")
  const [stakeholders, setStakeholders] = useState<Stakeholder[]>([{ role: "", position: "" }])
  const [valueFlow, setValueFlow] = useState({ input: "", transform: "", output: "" })
  const [bottleneck, setBottleneck] = useState("")
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [aiDraftFields, setAiDraftFields] = useState<Record<string, string> | null>(null)

  const stepIndex = STEPS.indexOf(step)

  function resetAndClose() {
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

  function handleStartAiDraft() {
    setMessage(null)
    setAiDraftFields(formatDefineCompanyFields({ domain, stakeholders, valueFlow, bottleneck }))
  }

  function handleCancelAiDraft() {
    setAiDraftFields(null)
  }

  function handleAiDraftCommitted() {
    resetAndClose()
    router.refresh()
  }

  function goNext() {
    setStep(STEPS[stepIndex + 1])
  }

  function goBack() {
    setStep(STEPS[stepIndex - 1])
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
    const result = await saveCompanyOntology(agentId, {
      domain,
      employeeCount: employeeCount.trim() ? Number(employeeCount) : undefined,
      stakeholders: stakeholders.filter((s) => s.role.trim() && s.position.trim()),
      valueFlow,
      bottleneck,
    })
    setPending(false)
    if (result.ok) {
      resetAndClose()
      router.refresh()
    } else {
      setMessage(result.message)
    }
  }

  const aboutValid = domain.trim().length > 0
  const stakeholdersValid = stakeholders.some((s) => s.role.trim() && s.position.trim())
  const valueFlowValid = Boolean(valueFlow.input.trim() && valueFlow.transform.trim() && valueFlow.output.trim())
  const bottleneckValid = bottleneck.trim().length > 0

  const canGoNext =
    (step === "about" && aboutValid) ||
    (step === "stakeholders" && stakeholdersValid) ||
    (step === "value-flow" && valueFlowValid) ||
    (step === "bottleneck" && bottleneckValid)

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        Set up your company
      </Button>
      <Sheet open={open} onOpenChange={(next) => !next && resetAndClose()}>
        <SheetContent className="w-full sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>Set up {companyName}</SheetTitle>
          </SheetHeader>
          <div className="space-y-4 px-4 pb-4">
            {step === "about" && (
              <div className="space-y-3">
                <div className="space-y-1">
                  <label className="text-sm font-medium">What problem does your company solve?</label>
                  <p className="text-xs text-muted-foreground">
                    A plain-language description of what you do and who it&apos;s for — no jargon needed.
                  </p>
                  <Textarea
                    value={domain}
                    onChange={(e) => setDomain(e.target.value)}
                    className="min-h-24"
                    placeholder="e.g. We help small clinics manage patient appointments and billing, so front-desk staff spend less time on the phone."
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">How many employees? (optional)</label>
                  <Input
                    type="number"
                    min="0"
                    value={employeeCount}
                    onChange={(e) => setEmployeeCount(e.target.value)}
                  />
                </div>
              </div>
            )}
            {step === "stakeholders" && (
              <div className="space-y-3">
                <div className="space-y-1">
                  <p className="text-sm font-medium">Who are your key stakeholders?</p>
                  <p className="text-xs text-muted-foreground">
                    Anyone who cares about or is affected by the business — customers, employees, managers,
                    partners, investors.
                  </p>
                </div>
                {stakeholders.map((s, i) => (
                  <div key={i} className="flex gap-2">
                    <Input
                      value={s.role}
                      onChange={(e) => updateStakeholder(i, "role", e.target.value)}
                      placeholder="Role (e.g. Client)"
                    />
                    <Input
                      value={s.position}
                      onChange={(e) => updateStakeholder(i, "position", e.target.value)}
                      placeholder="Their position (e.g. Pays for the service)"
                    />
                    {stakeholders.length > 1 && (
                      <Button size="sm" variant="ghost" onClick={() => removeStakeholder(i)}>
                        Remove
                      </Button>
                    )}
                  </div>
                ))}
                <Button size="sm" variant="ghost" onClick={addStakeholder}>
                  Add another stakeholder
                </Button>
              </div>
            )}
            {step === "value-flow" && (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  Describe your business as a simple chain: something comes in, you do something to it, something
                  goes out.
                </p>
                <div className="space-y-1">
                  <label className="text-sm font-medium">What do you receive?</label>
                  <p className="text-xs text-muted-foreground">
                    The raw material, request, or information that starts the work.
                  </p>
                  <Textarea
                    value={valueFlow.input}
                    onChange={(e) => setValueFlow((v) => ({ ...v, input: e.target.value }))}
                    placeholder="e.g. A customer's appointment request, or raw materials from a supplier"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">What do you do with it?</label>
                  <p className="text-xs text-muted-foreground">
                    The work, process, or transformation your company applies to it.
                  </p>
                  <Textarea
                    value={valueFlow.transform}
                    onChange={(e) => setValueFlow((v) => ({ ...v, transform: e.target.value }))}
                    placeholder="e.g. We schedule it, prepare it, review it, or manufacture it"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">What do you deliver?</label>
                  <p className="text-xs text-muted-foreground">
                    The finished result the other side ends up with.
                  </p>
                  <Textarea
                    value={valueFlow.output}
                    onChange={(e) => setValueFlow((v) => ({ ...v, output: e.target.value }))}
                    placeholder="e.g. A confirmed appointment, a finished product, a signed report"
                  />
                </div>
              </div>
            )}
            {step === "bottleneck" && (
              <div className="space-y-1">
                <label className="text-sm font-medium">
                  What&apos;s the most time-consuming or tribal-knowledge-dependent work right now?
                </label>
                <p className="text-xs text-muted-foreground">
                  Something that eats a lot of manual time, or that only one person really knows how to do.
                </p>
                <Textarea
                  value={bottleneck}
                  onChange={(e) => setBottleneck(e.target.value)}
                  className="min-h-24"
                  placeholder="e.g. Only Maria knows how to reconcile the monthly invoices, and it takes her a full day"
                />
              </div>
            )}
            {step === "review" && !aiDraftFields && (
              <div className="space-y-3 text-sm">
                <div>
                  <p className="font-medium">Your company</p>
                  <p className="text-muted-foreground">{domain || "—"}</p>
                  {employeeCount && <p className="text-muted-foreground">{employeeCount} employees</p>}
                </div>
                <div>
                  <p className="font-medium">Stakeholders</p>
                  {stakeholders
                    .filter((s) => s.role.trim() || s.position.trim())
                    .map((s, i) => (
                      <p key={i} className="text-muted-foreground">
                        {s.role} — {s.position}
                      </p>
                    ))}
                </div>
                <div>
                  <p className="font-medium">Value flow</p>
                  <p className="text-muted-foreground">Receive: {valueFlow.input || "—"}</p>
                  <p className="text-muted-foreground">Do: {valueFlow.transform || "—"}</p>
                  <p className="text-muted-foreground">Deliver: {valueFlow.output || "—"}</p>
                </div>
                <div>
                  <p className="font-medium">Biggest bottleneck</p>
                  <p className="text-muted-foreground">{bottleneck || "—"}</p>
                </div>
              </div>
            )}
            {step === "review" && aiDraftFields && (
              <DefineCompanyAiDraft
                agentId={agentId}
                fieldValues={aiDraftFields}
                onCancel={handleCancelAiDraft}
                onCommitted={handleAiDraftCommitted}
              />
            )}
            {!aiDraftFields && message && <p className="text-xs text-destructive">{message}</p>}
            {!aiDraftFields && (
              <div className="flex justify-between pt-2">
                <Button size="sm" variant="ghost" onClick={goBack} disabled={stepIndex === 0 || pending}>
                  Back
                </Button>
                {step === "review" ? (
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={handleStartAiDraft} disabled={pending}>
                      Let AI draft tailored entities
                    </Button>
                    <Button size="sm" onClick={handleSave} disabled={pending}>
                      {pending ? "Saving…" : "Save now"}
                    </Button>
                  </div>
                ) : (
                  <Button size="sm" onClick={goNext} disabled={pending || !canGoNext}>
                    Next
                  </Button>
                )}
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
