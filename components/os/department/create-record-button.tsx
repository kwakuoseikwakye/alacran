"use client"

import { useState } from "react"
import { Plus } from "lucide-react"
import {
  AddLeadModal,
  AddTransactionModal,
  AddContentModal,
} from "./modals"

export function CreateRecordButton({
  departmentName,
  companyId,
  variant = "header",
}: {
  departmentName: string
  companyId: string
  variant?: "header" | "empty-state"
}) {
  const [isOpen, setIsOpen] = useState(false)
  const norm = departmentName.toLowerCase()

  const labels: Record<string, string> = {
    funnel: "New Lead",
    finances: "Log Transaction",
    content: "New Content",
  }

  const emptyLabels: Record<string, string> = {
    funnel: "Add your first lead",
    finances: "Log your first transaction",
    content: "Add your first content item",
  }

  const label = labels[norm]
  if (!label) return null

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className={
          variant === "header"
            ? "px-3 py-1.5 rounded text-xs font-mono font-medium border border-primary/40 bg-primary/20 hover:bg-primary/30 text-primary flex items-center gap-1.5 transition-colors"
            : "px-4 py-2 rounded text-xs font-mono font-medium border border-primary/50 bg-primary/20 hover:bg-primary/30 text-primary flex items-center gap-1.5 mx-auto transition-colors"
        }
      >
        <Plus className="w-3.5 h-3.5" />
        {variant === "empty-state" ? emptyLabels[norm] : `+ ${label}`}
      </button>

      {norm === "funnel" ? (
        <AddLeadModal companyId={companyId} isOpen={isOpen} onClose={() => setIsOpen(false)} />
      ) : norm === "finances" ? (
        <AddTransactionModal companyId={companyId} isOpen={isOpen} onClose={() => setIsOpen(false)} />
      ) : norm === "content" ? (
        <AddContentModal companyId={companyId} isOpen={isOpen} onClose={() => setIsOpen(false)} />
      ) : null}
    </>
  )
}
