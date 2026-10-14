import { describe, it, expect, beforeEach, afterEach } from "vitest"
import fs from "node:fs/promises"
import path from "node:path"
import os from "node:os"
import yaml from "yaml"
import type { LeadStage } from "@/lib/os/schemas/funnel"
import type { TransactionStatus } from "@/lib/os/schemas/finances"
import type { ContentStatus } from "@/lib/os/schemas/content"
import {
  appendLead,
  appendTransaction,
  appendContentItem,
  updateLeadStage,
  updateTransactionStatus,
  updateContentStage,
  appendMilestone,
} from "./write"

describe("records write engine", () => {
  let tmpDir: string
  const mockExec = async () => ({ stdout: "", stderr: "" })

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "records-write-test-"))
    await fs.mkdir(path.join(tmpDir, "records", "funnel"), { recursive: true })
    await fs.mkdir(path.join(tmpDir, "records", "finances"), { recursive: true })
    await fs.mkdir(path.join(tmpDir, "records", "content"), { recursive: true })
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  it("appends a lead to an empty/non-existent leads.yaml", async () => {
    const res = await appendLead(
      tmpDir,
      {
        name: "Acme Corp",
        value: 15000,
        stage: "qualified",
        source: "outbound",
      },
      mockExec
    )

    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.record.name).toBe("Acme Corp")
    expect(res.record.owner).toBe("human")
    expect(res.record.id).toMatch(/^lead_/)

    const raw = await fs.readFile(path.join(tmpDir, "records", "funnel", "leads.yaml"), "utf8")
    const parsed = yaml.parse(raw)
    expect(parsed.schema_version).toBe(1)
    expect(parsed.records).toHaveLength(1)
    expect(parsed.records[0].name).toBe("Acme Corp")
  })

  it("refuses to overwrite corrupt YAML file", async () => {
    const filePath = path.join(tmpDir, "records", "funnel", "leads.yaml")
    await fs.writeFile(filePath, "invalid: [yaml: unclosed", "utf8")

    const res = await appendLead(
      tmpDir,
      {
        name: "Acme Corp",
        value: 15000,
        stage: "qualified",
        source: "outbound",
      },
      mockExec
    )

    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(res.error).toContain("contains invalid formatting")

    // Verify original corrupted content wasn't destroyed
    const raw = await fs.readFile(filePath, "utf8")
    expect(raw).toBe("invalid: [yaml: unclosed")
  })

  it("updates lead stage and refreshes last_touch", async () => {
    await appendLead(
      tmpDir,
      {
        name: "Beta Inc",
        value: 5000,
        stage: "new",
        source: "referral",
      },
      mockExec
    )

    const raw = await fs.readFile(path.join(tmpDir, "records", "funnel", "leads.yaml"), "utf8")
    const parsed = yaml.parse(raw)
    const leadId = parsed.records[0].id

    const updateRes = await updateLeadStage(tmpDir, leadId, "won", mockExec)
    expect(updateRes.ok).toBe(true)
    if (!updateRes.ok) return
    expect(updateRes.record.stage).toBe("won")

    const updatedRaw = await fs.readFile(path.join(tmpDir, "records", "funnel", "leads.yaml"), "utf8")
    const updatedParsed = yaml.parse(updatedRaw)
    expect(updatedParsed.records[0].stage).toBe("won")
  })

  it("appends and updates transaction status", async () => {
    const addRes = await appendTransaction(
      tmpDir,
      {
        description: "Cloud Hosting",
        amount: 250,
        type: "expense",
        category: "Infrastructure",
        account: "Operating",
        status: "pending",
      },
      mockExec
    )

    expect(addRes.ok).toBe(true)
    if (!addRes.ok) return
    expect(addRes.record.status).toBe("pending")

    const updateRes = await updateTransactionStatus(tmpDir, addRes.record.id, "cleared", mockExec)
    expect(updateRes.ok).toBe(true)
    if (!updateRes.ok) return
    expect(updateRes.record.status).toBe("cleared")
  })

  // Roadmap was a page that could only ever be empty: its only instruction was
  // to hand-edit milestones.yaml.
  it("adds a milestone to the starter's empty roadmap file, keeping what else is in it", async () => {
    await fs.mkdir(path.join(tmpDir, "records", "roadmap"), { recursive: true })
    const file = path.join(tmpDir, "records", "roadmap", "milestones.yaml")
    await fs.writeFile(file, "records: []\nphases: []\n")

    const res = await appendMilestone(tmpDir, { title: "Open a second kitchen", quarter: "2027-Q1" }, mockExec)

    expect(res.ok).toBe(true)
    const saved = yaml.parse(await fs.readFile(file, "utf8"))
    expect(saved.milestones).toHaveLength(1)
    expect(saved.milestones[0]).toMatchObject({ title: "Open a second kitchen", quarter: "2027-Q1", status: "next", description: "" })
    expect(saved.records).toEqual([])
  })

  it("refuses a milestone with a malformed quarter", async () => {
    const res = await appendMilestone(tmpDir, { title: "Something", quarter: "next spring" }, mockExec)
    expect(res.ok).toBe(false)
  })

  it("appends and updates content item status", async () => {
    const addRes = await appendContentItem(
      tmpDir,
      {
        title: "Product Announcement",
        type: "article",
        channel: "blog",
        status: "idea",
      },
      mockExec
    )

    expect(addRes.ok).toBe(true)
    if (!addRes.ok) return
    expect(addRes.record.status).toBe("idea")

    const updateRes = await updateContentStage(tmpDir, addRes.record.id, "published", mockExec)
    expect(updateRes.ok).toBe(true)
    if (!updateRes.ok) return
    expect(updateRes.record.status).toBe("published")
  })

  it("returns error when updating a non-existent record", async () => {
    const leadRes = await updateLeadStage(tmpDir, "lead_nonexistent", "won", mockExec)
    expect(leadRes.ok).toBe(false)
    if (!leadRes.ok) {
      expect(leadRes.error).toContain("Lead not found: lead_nonexistent")
    }

    const txnRes = await updateTransactionStatus(tmpDir, "txn_nonexistent", "cleared", mockExec)
    expect(txnRes.ok).toBe(false)
    if (!txnRes.ok) {
      expect(txnRes.error).toContain("Transaction not found: txn_nonexistent")
    }

    const contentRes = await updateContentStage(tmpDir, "content_nonexistent", "published", mockExec)
    expect(contentRes.ok).toBe(false)
    if (!contentRes.ok) {
      expect(contentRes.error).toContain("Content item not found: content_nonexistent")
    }
  })

  it("validates input and rejects negative numbers", async () => {
    const res = await appendLead(
      tmpDir,
      {
        name: "Negative Value Corp",
        value: -100,
        stage: "qualified",
        source: "outbound",
      },
      mockExec
    )

    expect(res.ok).toBe(false)
    if (!res.ok) {
      expect(res.error).toBeDefined()
    }
  })

  it("serializes concurrent writes safely without losing records", async () => {
    const promises = Array.from({ length: 5 }, (_, i) =>
      appendLead(
        tmpDir,
        {
          name: `Concurrent Lead ${i}`,
          value: 1000 * (i + 1),
          stage: "new",
          source: "outbound",
        },
        mockExec
      )
    )

    const results = await Promise.all(promises)
    for (const r of results) {
      expect(r.ok).toBe(true)
    }

    const raw = await fs.readFile(path.join(tmpDir, "records", "funnel", "leads.yaml"), "utf8")
    const parsed = yaml.parse(raw)
    expect(parsed.records).toHaveLength(5)
  })

  it("invokes commitFile with expected commit message and relative path", async () => {
    const executed: Array<{ cmd: string; args: string[] }> = []
    const spyExec = async (cmd: string, args: string[]) => {
      executed.push({ cmd, args })
      return { stdout: "", stderr: "" }
    }

    const res = await appendLead(
      tmpDir,
      {
        name: "Test Corp",
        value: 1000,
        stage: "qualified",
        source: "outbound",
      },
      spyExec
    )

    expect(res.ok).toBe(true)
    expect(executed).toHaveLength(2)
    expect(executed[0]).toEqual({
      cmd: "git",
      args: ["-C", tmpDir, "add", "--", path.join("records", "funnel", "leads.yaml")],
    })
    expect(executed[1]).toEqual({
      cmd: "git",
      args: [
        "-C",
        tmpDir,
        "commit",
        "-m",
        "feat(funnel): add lead Test Corp",
        "--",
        path.join("records", "funnel", "leads.yaml"),
      ],
    })
  })

  it("handles git commit failure gracefully without throwing unhandled exception", async () => {
    const failingExec = async () => {
      throw new Error("Git index.lock exists: unable to create thread lock")
    }

    const res = await appendLead(
      tmpDir,
      {
        name: "Fail Corp",
        value: 2000,
        stage: "new",
        source: "outbound",
      },
      failingExec
    )

    expect(res.ok).toBe(false)
    if (!res.ok) {
      expect(res.error).toContain("Git index.lock exists")
    }

    // Now test update with failing commit
    const failedNotFound = await updateLeadStage(
      tmpDir,
      "any_id",
      "won",
      failingExec
    )
    expect(failedNotFound.ok).toBe(false)
    // Non-existent id fails first, but let's test on existing lead with failing exec:
    const addSuccess = await appendLead(
      tmpDir,
      {
        name: "Second Corp",
        value: 3000,
        stage: "new",
        source: "outbound",
      },
      mockExec
    )
    expect(addSuccess.ok).toBe(true)
    if (!addSuccess.ok) return

    const updateWithFail = await updateLeadStage(
      tmpDir,
      addSuccess.record.id,
      "won",
      failingExec
    )
    expect(updateWithFail.ok).toBe(false)
    if (!updateWithFail.ok) {
      expect(updateWithFail.error).toContain("Git index.lock exists")
    }
  })

  it("validates status transitions at runtime and rejects invalid enum values", async () => {
    // 1. Lead stage transition
    const leadAdd = await appendLead(
      tmpDir,
      {
        name: "Stage Test",
        value: 1000,
        stage: "new",
        source: "inbound",
      },
      mockExec
    )
    expect(leadAdd.ok).toBe(true)
    if (!leadAdd.ok) return

    const badStageRes = await updateLeadStage(
      tmpDir,
      leadAdd.record.id,
      "bogus_stage" as unknown as LeadStage,
      mockExec
    )
    expect(badStageRes.ok).toBe(false)

    // Verify disk was NOT updated with bogus stage
    const rawLeads = await fs.readFile(path.join(tmpDir, "records", "funnel", "leads.yaml"), "utf8")
    const parsedLeads = yaml.parse(rawLeads)
    expect(parsedLeads.records[0].stage).toBe("new")

    // 2. Transaction status transition
    const txnAdd = await appendTransaction(
      tmpDir,
      {
        description: "Payment",
        amount: 50,
        type: "income",
        category: "Sales",
      },
      mockExec
    )
    expect(txnAdd.ok).toBe(true)
    if (!txnAdd.ok) return

    const badTxnRes = await updateTransactionStatus(
      tmpDir,
      txnAdd.record.id,
      "disputed" as unknown as TransactionStatus,
      mockExec
    )
    expect(badTxnRes.ok).toBe(false)

    // 3. Content status transition
    const contentAdd = await appendContentItem(
      tmpDir,
      {
        title: "Post",
        channel: "twitter",
      },
      mockExec
    )
    expect(contentAdd.ok).toBe(true)
    if (!contentAdd.ok) return

    const badContentRes = await updateContentStage(
      tmpDir,
      contentAdd.record.id,
      "rejected" as unknown as ContentStatus,
      mockExec
    )
    expect(badContentRes.ok).toBe(false)
  })
})


