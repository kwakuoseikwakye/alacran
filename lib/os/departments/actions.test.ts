import { describe, it, expect, vi } from "vitest"
import { createDepartmentActionImpl, addRecordActionImpl, getDepartmentForEditActionImpl } from "./actions"

const ok = { ok: true as const, slug: "legal", committed: true, commitPaths: ["definitions/departments.yaml"], commitMessage: "m" }

describe("department actions", () => {
  it("resolves the root from the company id only, calls the service, revalidates", async () => {
    const create = vi.fn().mockResolvedValue(ok)
    const revalidate = vi.fn()
    const res = await createDepartmentActionImpl("acme", { name: "Legal", purpose: "p", color: "#0369a1" }, { resolveRoot: async (id) => (id === "acme" ? "/tmp/acme" : null), create, revalidate })
    expect(create).toHaveBeenCalledWith("/tmp/acme", { name: "Legal", purpose: "p", color: "#0369a1" })
    expect(res).toMatchObject({ ok: true, slug: "legal" })
    expect(revalidate).toHaveBeenCalledWith("/c/acme/records")
    expect(revalidate).toHaveBeenCalledWith("/c/acme/dashboard")
  })
  it("an unknown company never reaches the service", async () => {
    const create = vi.fn()
    const res = await createDepartmentActionImpl("ghost", { name: "x", purpose: "p", color: "#0369a1" }, { resolveRoot: async () => null, create, revalidate: vi.fn() })
    expect(res).toEqual({ ok: false, code: "not-found", error: "Company not found: ghost" })
    expect(create).not.toHaveBeenCalled()
  })
  it("a throwing service becomes an error result, not an exception", async () => {
    const res = await addRecordActionImpl("acme", { slug: "legal", title: "t", body: "b" }, { resolveRoot: async () => "/tmp/acme", add: vi.fn().mockRejectedValue(new Error("boom")), revalidate: vi.fn() })
    expect(res).toMatchObject({ ok: false, code: "failed" })
  })
})

describe("getDepartmentForEditActionImpl", () => {
  const read = () => ({ ok: true as const, revision: "rev1", text: "", departments: [{ slug: "sales", name: "Sales", purpose: "Win deals", color: "#aabbcc" }] })
  it("returns the department and the revision it was read at", async () => {
    const out = await getDepartmentForEditActionImpl("acme", "sales", { resolveRoot: async () => "/r", read })
    expect(out).toEqual({ ok: true, department: { slug: "sales", name: "Sales", purpose: "Win deals", color: "#aabbcc" }, revision: "rev1" })
  })
  it("says so plainly for an unknown slug, an unknown company, or an unreadable file", async () => {
    expect(await getDepartmentForEditActionImpl("acme", "ghost", { resolveRoot: async () => "/r", read })).toMatchObject({ ok: false, code: "not-found", error: "Only departments you created can be edited here." })
    expect(await getDepartmentForEditActionImpl("nope", "sales", { resolveRoot: async () => null, read })).toMatchObject({ ok: false, code: "not-found" })
    expect(await getDepartmentForEditActionImpl("acme", "sales", { resolveRoot: async () => "/r", read: () => ({ ok: false as const, error: "can't be read", revision: "unreadable" }) })).toMatchObject({ ok: false, error: "can't be read" })
  })
  it("a throwing read becomes an error result, not an exception", async () => {
    const out = await getDepartmentForEditActionImpl("acme", "sales", { resolveRoot: async () => "/r", read: () => { throw new Error("boom") } })
    expect(out).toMatchObject({ ok: false, code: "failed" })
  })
})
