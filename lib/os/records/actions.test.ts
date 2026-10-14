import { describe, it, expect, vi, beforeEach } from "vitest"
import {
  createLeadActionImpl,
  updateLeadStageActionImpl,
  createTransactionActionImpl,
  updateTransactionStatusActionImpl,
  createContentItemActionImpl,
  updateContentStageActionImpl,
  createLeadAction,
  updateLeadStageAction,
  createTransactionAction,
  updateTransactionStatusAction,
  createContentItemAction,
  updateContentStageAction,
} from "./actions"
import * as getEffectiveAgentsModule from "../../get-effective-agents"
import * as writeModule from "./write"

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}))

vi.mock("../../get-effective-agents", () => ({
  getEffectiveAgents: vi.fn(),
}))

vi.mock("./write", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./write")>()
  return {
    ...actual,
    appendLead: vi.fn(),
    updateLeadStage: vi.fn(),
    appendTransaction: vi.fn(),
    updateTransactionStatus: vi.fn(),
    appendContentItem: vi.fn(),
    updateContentStage: vi.fn(),
  }
})


describe("records server actions", () => {
  const mockRevalidate = vi.fn()
  const mockResolveRoot = vi.fn()
  const mockAppendLead = vi.fn()
  const mockUpdateLeadStage = vi.fn()
  const mockAppendTransaction = vi.fn()
  const mockUpdateTransactionStatus = vi.fn()
  const mockAppendContentItem = vi.fn()
  const mockUpdateContentStage = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("createLeadActionImpl", () => {
    it("fails if company is not found", async () => {
      mockResolveRoot.mockResolvedValue(null)

      const res = await createLeadActionImpl(
        "unknown-co",
        { name: "Test", value: 100, stage: "new", source: "web" },
        { resolveRoot: mockResolveRoot, appendLead: mockAppendLead, revalidate: mockRevalidate }
      )

      expect(res.ok).toBe(false)
      if (res.ok) return
      expect(res.error).toContain("Company not found")
      expect(mockRevalidate).not.toHaveBeenCalled()
    })

    it("fails if appendLead returns error", async () => {
      mockResolveRoot.mockResolvedValue("/tmp/company")
      mockAppendLead.mockResolvedValue({ ok: false, error: "Validation failed" })

      const res = await createLeadActionImpl(
        "acme-co",
        { name: "Bad Lead", value: -50, stage: "new", source: "web" },
        { resolveRoot: mockResolveRoot, appendLead: mockAppendLead, revalidate: mockRevalidate }
      )

      expect(res.ok).toBe(false)
      if (res.ok) return
      expect(res.error).toBe("Validation failed")
      expect(mockRevalidate).not.toHaveBeenCalled()
    })

    it("appends lead and calls revalidatePath on success", async () => {
      mockResolveRoot.mockResolvedValue("/tmp/company")
      mockAppendLead.mockResolvedValue({ ok: true, record: { id: "lead_123" } })

      const res = await createLeadActionImpl(
        "acme-co",
        { name: "Valid Lead", value: 5000, stage: "qualified", source: "inbound" },
        { resolveRoot: mockResolveRoot, appendLead: mockAppendLead, revalidate: mockRevalidate }
      )

      expect(res.ok).toBe(true)
      if (!res.ok) return
      expect(res.id).toBe("lead_123")
      expect(mockRevalidate).toHaveBeenCalledWith("/c/acme-co/funnel")
      expect(mockRevalidate).toHaveBeenCalledWith("/c/acme-co/dashboard")
    })
  })

  describe("updateLeadStageActionImpl", () => {
    it("fails if company is not found", async () => {
      mockResolveRoot.mockResolvedValue(null)

      const res = await updateLeadStageActionImpl(
        "unknown-co",
        "lead_123",
        "won",
        { resolveRoot: mockResolveRoot, updateLeadStage: mockUpdateLeadStage, revalidate: mockRevalidate }
      )

      expect(res.ok).toBe(false)
      if (res.ok) return
      expect(res.error).toContain("Company not found")
    })

    it("fails if updateLeadStage returns error", async () => {
      mockResolveRoot.mockResolvedValue("/tmp/company")
      mockUpdateLeadStage.mockResolvedValue({ ok: false, error: "Lead not found" })

      const res = await updateLeadStageActionImpl(
        "acme-co",
        "lead_999",
        "won",
        { resolveRoot: mockResolveRoot, updateLeadStage: mockUpdateLeadStage, revalidate: mockRevalidate }
      )

      expect(res.ok).toBe(false)
      if (res.ok) return
      expect(res.error).toBe("Lead not found")
      expect(mockRevalidate).not.toHaveBeenCalled()
    })

    it("updates lead stage and revalidates", async () => {
      mockResolveRoot.mockResolvedValue("/tmp/company")
      mockUpdateLeadStage.mockResolvedValue({ ok: true, record: { id: "lead_123", stage: "won" } })

      const res = await updateLeadStageActionImpl(
        "acme-co",
        "lead_123",
        "won",
        { resolveRoot: mockResolveRoot, updateLeadStage: mockUpdateLeadStage, revalidate: mockRevalidate }
      )

      expect(res.ok).toBe(true)
      expect(mockRevalidate).toHaveBeenCalledWith("/c/acme-co/funnel")
      expect(mockRevalidate).toHaveBeenCalledWith("/c/acme-co/dashboard")
    })
  })

  describe("createTransactionActionImpl", () => {
    it("fails if company is not found", async () => {
      mockResolveRoot.mockResolvedValue(null)

      const res = await createTransactionActionImpl(
        "unknown-co",
        { description: "Hosting", amount: 200, type: "expense", category: "Infrastructure" },
        { resolveRoot: mockResolveRoot, appendTransaction: mockAppendTransaction, revalidate: mockRevalidate }
      )

      expect(res.ok).toBe(false)
      if (res.ok) return
      expect(res.error).toContain("Company not found")
      expect(mockRevalidate).not.toHaveBeenCalled()
    })

    it("fails if appendTransaction returns error", async () => {
      mockResolveRoot.mockResolvedValue("/tmp/company")
      mockAppendTransaction.mockResolvedValue({ ok: false, error: "Amount must be positive" })

      const res = await createTransactionActionImpl(
        "acme-co",
        { description: "Invalid", amount: -10, type: "expense", category: "General" },
        { resolveRoot: mockResolveRoot, appendTransaction: mockAppendTransaction, revalidate: mockRevalidate }
      )

      expect(res.ok).toBe(false)
      if (res.ok) return
      expect(res.error).toBe("Amount must be positive")
      expect(mockRevalidate).not.toHaveBeenCalled()
    })

    it("appends transaction and revalidates finances and dashboard", async () => {
      mockResolveRoot.mockResolvedValue("/tmp/company")
      mockAppendTransaction.mockResolvedValue({ ok: true, record: { id: "txn_456" } })

      const res = await createTransactionActionImpl(
        "acme-co",
        { description: "Client payment", amount: 1500, type: "income", category: "Consulting" },
        { resolveRoot: mockResolveRoot, appendTransaction: mockAppendTransaction, revalidate: mockRevalidate }
      )

      expect(res.ok).toBe(true)
      if (!res.ok) return
      expect(res.id).toBe("txn_456")
      expect(mockRevalidate).toHaveBeenCalledWith("/c/acme-co/finances")
      expect(mockRevalidate).toHaveBeenCalledWith("/c/acme-co/dashboard")
    })
  })

  describe("updateTransactionStatusActionImpl", () => {
    it("fails if company is not found", async () => {
      mockResolveRoot.mockResolvedValue(null)

      const res = await updateTransactionStatusActionImpl(
        "unknown-co",
        "txn_456",
        "cleared",
        { resolveRoot: mockResolveRoot, updateTransactionStatus: mockUpdateTransactionStatus, revalidate: mockRevalidate }
      )

      expect(res.ok).toBe(false)
      if (res.ok) return
      expect(res.error).toContain("Company not found")
    })

    it("fails if updateTransactionStatus returns error", async () => {
      mockResolveRoot.mockResolvedValue("/tmp/company")
      mockUpdateTransactionStatus.mockResolvedValue({ ok: false, error: "Transaction not found: txn_456" })

      const res = await updateTransactionStatusActionImpl(
        "acme-co",
        "txn_456",
        "cleared",
        { resolveRoot: mockResolveRoot, updateTransactionStatus: mockUpdateTransactionStatus, revalidate: mockRevalidate }
      )

      expect(res.ok).toBe(false)
      if (res.ok) return
      expect(res.error).toBe("Transaction not found: txn_456")
      expect(mockRevalidate).not.toHaveBeenCalled()
    })

    it("updates transaction status and revalidates finances and dashboard", async () => {
      mockResolveRoot.mockResolvedValue("/tmp/company")
      mockUpdateTransactionStatus.mockResolvedValue({ ok: true, record: { id: "txn_456", status: "cleared" } })

      const res = await updateTransactionStatusActionImpl(
        "acme-co",
        "txn_456",
        "cleared",
        { resolveRoot: mockResolveRoot, updateTransactionStatus: mockUpdateTransactionStatus, revalidate: mockRevalidate }
      )

      expect(res.ok).toBe(true)
      expect(mockRevalidate).toHaveBeenCalledWith("/c/acme-co/finances")
      expect(mockRevalidate).toHaveBeenCalledWith("/c/acme-co/dashboard")
    })
  })

  describe("createContentItemActionImpl", () => {
    it("fails if company is not found", async () => {
      mockResolveRoot.mockResolvedValue(null)

      const res = await createContentItemActionImpl(
        "unknown-co",
        { title: "Article", channel: "blog" },
        { resolveRoot: mockResolveRoot, appendContentItem: mockAppendContentItem, revalidate: mockRevalidate }
      )

      expect(res.ok).toBe(false)
      if (res.ok) return
      expect(res.error).toContain("Company not found")
      expect(mockRevalidate).not.toHaveBeenCalled()
    })

    it("fails if appendContentItem returns error", async () => {
      mockResolveRoot.mockResolvedValue("/tmp/company")
      mockAppendContentItem.mockResolvedValue({ ok: false, error: "Title is required" })

      const res = await createContentItemActionImpl(
        "acme-co",
        { title: "", channel: "blog" },
        { resolveRoot: mockResolveRoot, appendContentItem: mockAppendContentItem, revalidate: mockRevalidate }
      )

      expect(res.ok).toBe(false)
      if (res.ok) return
      expect(res.error).toBe("Title is required")
      expect(mockRevalidate).not.toHaveBeenCalled()
    })

    it("appends content item and revalidates content and dashboard", async () => {
      mockResolveRoot.mockResolvedValue("/tmp/company")
      mockAppendContentItem.mockResolvedValue({ ok: true, record: { id: "content_789" } })

      const res = await createContentItemActionImpl(
        "acme-co",
        { title: "Announcing v2", channel: "twitter", type: "post", status: "draft" },
        { resolveRoot: mockResolveRoot, appendContentItem: mockAppendContentItem, revalidate: mockRevalidate }
      )

      expect(res.ok).toBe(true)
      if (!res.ok) return
      expect(res.id).toBe("content_789")
      expect(mockRevalidate).toHaveBeenCalledWith("/c/acme-co/content")
      expect(mockRevalidate).toHaveBeenCalledWith("/c/acme-co/dashboard")
    })
  })

  describe("updateContentStageActionImpl", () => {
    it("fails if company is not found", async () => {
      mockResolveRoot.mockResolvedValue(null)

      const res = await updateContentStageActionImpl(
        "unknown-co",
        "content_789",
        "published",
        { resolveRoot: mockResolveRoot, updateContentStage: mockUpdateContentStage, revalidate: mockRevalidate }
      )

      expect(res.ok).toBe(false)
      if (res.ok) return
      expect(res.error).toContain("Company not found")
    })

    it("fails if updateContentStage returns error", async () => {
      mockResolveRoot.mockResolvedValue("/tmp/company")
      mockUpdateContentStage.mockResolvedValue({ ok: false, error: "Content item not found: content_789" })

      const res = await updateContentStageActionImpl(
        "acme-co",
        "content_789",
        "published",
        { resolveRoot: mockResolveRoot, updateContentStage: mockUpdateContentStage, revalidate: mockRevalidate }
      )

      expect(res.ok).toBe(false)
      if (res.ok) return
      expect(res.error).toBe("Content item not found: content_789")
      expect(mockRevalidate).not.toHaveBeenCalled()
    })

    it("updates content stage and revalidates content and dashboard", async () => {
      mockResolveRoot.mockResolvedValue("/tmp/company")
      mockUpdateContentStage.mockResolvedValue({ ok: true, record: { id: "content_789", status: "published" } })

      const res = await updateContentStageActionImpl(
        "acme-co",
        "content_789",
        "published",
        { resolveRoot: mockResolveRoot, updateContentStage: mockUpdateContentStage, revalidate: mockRevalidate }
      )

      expect(res.ok).toBe(true)
      expect(mockRevalidate).toHaveBeenCalledWith("/c/acme-co/content")
      expect(mockRevalidate).toHaveBeenCalledWith("/c/acme-co/dashboard")
    })
  })

  describe("exported server actions", () => {
    it("createLeadAction delegates to impl with resolved company root", async () => {
      vi.mocked(getEffectiveAgentsModule.getEffectiveAgents).mockResolvedValue([
        { id: "acme-co", name: "Acme", rootPath: "/path/to/acme", kind: "command-set" },
      ])
      vi.mocked(writeModule.appendLead).mockResolvedValue({
        ok: true,
        record: { id: "lead_123", name: "Test Lead", stage: "new", source: "web", owner: "human", value: 100, currency: "USD", first_seen: "2026-09-19", last_touch: "2026-09-19" },
      })

      const res = await createLeadAction("acme-co", { name: "Test Lead", value: 100, stage: "new", source: "web" })
      expect(res.ok).toBe(true)
      if (!res.ok) return
      expect(res.id).toBe("lead_123")
      expect(writeModule.appendLead).toHaveBeenCalledWith("/path/to/acme", expect.objectContaining({ name: "Test Lead" }))
    })

    it("updateLeadStageAction delegates to impl", async () => {
      vi.mocked(getEffectiveAgentsModule.getEffectiveAgents).mockResolvedValue([
        { id: "acme-co", name: "Acme", rootPath: "/path/to/acme", kind: "command-set" },
      ])
      vi.mocked(writeModule.updateLeadStage).mockResolvedValue({
        ok: true,
        record: { id: "lead_123", name: "Test Lead", stage: "won", source: "web", owner: "human", value: 100, currency: "USD", first_seen: "2026-09-19", last_touch: "2026-09-19" },
      })

      const res = await updateLeadStageAction("acme-co", "lead_123", "won")
      expect(res.ok).toBe(true)
      expect(writeModule.updateLeadStage).toHaveBeenCalledWith("/path/to/acme", "lead_123", "won")
    })

    it("createTransactionAction delegates to impl", async () => {
      vi.mocked(getEffectiveAgentsModule.getEffectiveAgents).mockResolvedValue([
        { id: "acme-co", name: "Acme", rootPath: "/path/to/acme", kind: "command-set" },
      ])
      vi.mocked(writeModule.appendTransaction).mockResolvedValue({
        ok: true,
        record: { id: "txn_123", date: "2026-09-19", description: "Invoice", amount: 500, currency: "USD", type: "income", category: "Services", account: "Main", status: "cleared" },
      })

      const res = await createTransactionAction("acme-co", { description: "Invoice", amount: 500, type: "income", category: "Services" })
      expect(res.ok).toBe(true)
      if (!res.ok) return
      expect(res.id).toBe("txn_123")
      expect(writeModule.appendTransaction).toHaveBeenCalledWith("/path/to/acme", expect.objectContaining({ description: "Invoice" }))
    })

    it("updateTransactionStatusAction delegates to impl", async () => {
      vi.mocked(getEffectiveAgentsModule.getEffectiveAgents).mockResolvedValue([
        { id: "acme-co", name: "Acme", rootPath: "/path/to/acme", kind: "command-set" },
      ])
      vi.mocked(writeModule.updateTransactionStatus).mockResolvedValue({
        ok: true,
        record: { id: "txn_123", date: "2026-09-19", description: "Invoice", amount: 500, currency: "USD", type: "income", category: "Services", account: "Main", status: "cleared" },
      })

      const res = await updateTransactionStatusAction("acme-co", "txn_123", "cleared")
      expect(res.ok).toBe(true)
      expect(writeModule.updateTransactionStatus).toHaveBeenCalledWith("/path/to/acme", "txn_123", "cleared")
    })

    it("createContentItemAction delegates to impl", async () => {
      vi.mocked(getEffectiveAgentsModule.getEffectiveAgents).mockResolvedValue([
        { id: "acme-co", name: "Acme", rootPath: "/path/to/acme", kind: "command-set" },
      ])
      vi.mocked(writeModule.appendContentItem).mockResolvedValue({
        ok: true,
        record: { id: "content_123", title: "Post", type: "post", channel: "twitter", status: "draft", author: "human" },
      })

      const res = await createContentItemAction("acme-co", { title: "Post", channel: "twitter" })
      expect(res.ok).toBe(true)
      if (!res.ok) return
      expect(res.id).toBe("content_123")
      expect(writeModule.appendContentItem).toHaveBeenCalledWith("/path/to/acme", expect.objectContaining({ title: "Post" }))
    })

    it("updateContentStageAction delegates to impl", async () => {
      vi.mocked(getEffectiveAgentsModule.getEffectiveAgents).mockResolvedValue([
        { id: "acme-co", name: "Acme", rootPath: "/path/to/acme", kind: "command-set" },
      ])
      vi.mocked(writeModule.updateContentStage).mockResolvedValue({
        ok: true,
        record: { id: "content_123", title: "Post", type: "post", channel: "twitter", status: "published", author: "human" },
      })

      const res = await updateContentStageAction("acme-co", "content_123", "published")
      expect(res.ok).toBe(true)
      expect(writeModule.updateContentStage).toHaveBeenCalledWith("/path/to/acme", "content_123", "published")
    })
  })

  describe("unexpected thrown errors handling (try/catch)", () => {
    it("returns error object if resolveRoot throws an exception", async () => {
      mockResolveRoot.mockRejectedValue(new Error("Filesystem failure"))

      const res = await createLeadActionImpl(
        "acme-co",
        { name: "Lead", value: 100, stage: "new", source: "web" },
        { resolveRoot: mockResolveRoot, appendLead: mockAppendLead, revalidate: mockRevalidate }
      )

      expect(res.ok).toBe(false)
      if (res.ok) return
      expect(res.error).toBe("Filesystem failure")
    })

    it("returns error object if appendLead throws an exception", async () => {
      mockResolveRoot.mockResolvedValue("/tmp/company")
      mockAppendLead.mockRejectedValue(new Error("Git execution crash"))

      const res = await createLeadActionImpl(
        "acme-co",
        { name: "Lead", value: 100, stage: "new", source: "web" },
        { resolveRoot: mockResolveRoot, appendLead: mockAppendLead, revalidate: mockRevalidate }
      )

      expect(res.ok).toBe(false)
      if (res.ok) return
      expect(res.error).toBe("Git execution crash")
    })

    it("returns error object if exported server action encounters an unhandled throw", async () => {
      vi.mocked(getEffectiveAgentsModule.getEffectiveAgents).mockRejectedValue(new Error("Registry unavailable"))

      const res = await createLeadAction("acme-co", { name: "Lead", value: 100, stage: "new", source: "web" })

      expect(res.ok).toBe(false)
      if (res.ok) return
      expect(res.error).toBe("Registry unavailable")
    })

    it("returns error object if non-Error is thrown", async () => {
      mockResolveRoot.mockRejectedValue("String error")

      const res = await updateLeadStageActionImpl(
        "acme-co",
        "lead_1",
        "won",
        { resolveRoot: mockResolveRoot, updateLeadStage: mockUpdateLeadStage, revalidate: mockRevalidate }
      )

      expect(res.ok).toBe(false)
      if (res.ok) return
      expect(res.error).toBe("String error")
    })
  })
})
