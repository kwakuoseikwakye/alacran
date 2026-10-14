"use client"

import { useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { createTransactionAction } from "@/lib/os/records/actions"
import type { TransactionStatus, TransactionType } from "@/lib/os/schemas/finances"
import { Loader2 } from "lucide-react"

export function AddTransactionModal({
  companyId,
  isOpen,
  onClose,
  onSaved,
}: {
  companyId: string
  isOpen: boolean
  onSaved?: () => void
  onClose: () => void
}) {
  const [description, setDescription] = useState("")
  // Empty, not a sample: a leftover $100 "Software" charge would be saved as real.
  const [amount, setAmount] = useState("")
  const [type, setType] = useState<TransactionType>("expense")
  const [category, setCategory] = useState("")
  const [status, setStatus] = useState<TransactionStatus>("cleared")
  const [account, setAccount] = useState("Operating")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (loading) return
    if (!description.trim()) {
      setError("Description is required")
      return
    }

    setLoading(true)
    setError(null)
    try {
      const res = await createTransactionAction(companyId, {
        description: description.trim(),
        amount: Math.max(0, Number(amount) || 0),
        type,
        category: category.trim() || "General",
        status,
        account: account.trim() || "Operating",
      })

      if (!res.ok) {
        setError(res.error)
        setLoading(false)
        return
      }

      setDescription("")
      setAmount("")
      setType("expense")
      setCategory("")
      setStatus("cleared")
      setAccount("Operating")
      setLoading(false)
      onSaved?.()
      onClose()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save transaction")
      setLoading(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLFormElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault()
      handleSubmit(e)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && !loading && onClose()}>
      <DialogContent className="max-w-md bg-background border border-border/80 text-foreground">
        <form onSubmit={handleSubmit} onKeyDown={handleKeyDown}>
          <DialogHeader>
            <DialogTitle className="font-display text-lg">Log Financial Transaction</DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              Record income or an expense directly into your ledger.
            </DialogDescription>
          </DialogHeader>

          {error ? (
            <div
              role="alert"
              className="mt-3 p-2 text-xs rounded bg-destructive/20 border border-destructive/40 text-destructive-foreground"
            >
              {error}
            </div>
          ) : null}

          <div className="space-y-3.5 py-4 text-xs font-mono">
            <div>
              <label className="block text-muted-foreground mb-1">Description / Counterparty *</label>
              <input
                type="text"
                required
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g. AWS Infrastructure, Client Retainer"
                className="w-full px-3 py-2 rounded bg-muted/20 border border-border text-foreground focus:outline-none focus:border-primary font-sans text-sm"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-muted-foreground mb-1">Type</label>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value as TransactionType)}
                  className="w-full px-3 py-2 rounded bg-muted/20 border border-border text-foreground focus:outline-none focus:border-primary text-sm capitalize"
                >
                  <option value="expense">Expense</option>
                  <option value="income">Income</option>
                </select>
              </div>

              <div>
                <label className="block text-muted-foreground mb-1">Amount ($ USD)</label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full px-3 py-2 rounded bg-muted/20 border border-border text-foreground focus:outline-none focus:border-primary text-sm font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-muted-foreground mb-1">Category</label>
                <input
                  type="text"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  placeholder="e.g. Software, Payroll"
                  className="w-full px-3 py-2 rounded bg-muted/20 border border-border text-foreground focus:outline-none focus:border-primary text-sm"
                />
              </div>

              <div>
                <label className="block text-muted-foreground mb-1">Status</label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as TransactionStatus)}
                  className="w-full px-3 py-2 rounded bg-muted/20 border border-border text-foreground focus:outline-none focus:border-primary text-sm capitalize"
                >
                  <option value="cleared">Cleared</option>
                  <option value="pending">Pending</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-muted-foreground mb-1">Account</label>
              <input
                type="text"
                value={account}
                onChange={(e) => setAccount(e.target.value)}
                placeholder="e.g. Operating, Payroll"
                className="w-full px-3 py-2 rounded bg-muted/20 border border-border text-foreground focus:outline-none focus:border-primary text-sm"
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-3 py-1.5 rounded text-xs border border-border hover:bg-muted/30 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-1.5 rounded text-xs font-semibold bg-primary hover:bg-primary/90 text-primary-foreground flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
              Save &amp; Commit
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
