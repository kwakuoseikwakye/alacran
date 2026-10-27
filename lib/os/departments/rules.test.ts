import { describe, it, expect } from "vitest"
import { slugify, pickSlug, validateFields } from "./rules"

describe("slugify", () => {
  it("lowercases, strips accents and joins words with hyphens", () => {
    expect(slugify("Legal & Compliance")).toBe("legal-compliance")
    expect(slugify("Écoles  du soir")).toBe("ecoles-du-soir")
  })
  it("returns empty when nothing Latin survives", () => {
    expect(slugify("法務")).toBe("")
  })
  it("caps length without leaving a trailing hyphen", () => {
    const s = slugify("a".repeat(39) + " b")
    expect(s.length).toBeLessThanOrEqual(40)
    expect(s.endsWith("-")).toBe(false)
  })
})

describe("pickSlug", () => {
  it("uses the name's slug", () => {
    expect(pickSlug("Legal", new Set())).toBe("legal")
  })
  it("rejects reserved slugs, including built-ins", () => {
    expect(pickSlug("Finances", new Set())).toEqual({ error: expect.stringContaining("reserved") })
    expect(pickSlug("Company", new Set())).toEqual({ error: expect.stringContaining("reserved") })
  })
  it("rejects app-owned slugs", () => {
    expect(pickSlug("Roadmap", new Set())).toEqual({ error: expect.stringContaining("reserved") })
    expect(pickSlug("Workflows", new Set())).toEqual({ error: expect.stringContaining("reserved") })
    expect(pickSlug("Actions", new Set())).toEqual({ error: expect.stringContaining("reserved") })
  })
  it("falls back to department, department-2, … for names with no Latin letters", () => {
    expect(pickSlug("法務", new Set())).toBe("department")
    expect(pickSlug("法務", new Set(["department"]))).toBe("department-2")
    expect(pickSlug("法務", new Set(["department", "department-2"]))).toBe("department-3")
  })
})

describe("validateFields", () => {
  const ok = { name: " Legal ", purpose: " Contracts. ", color: "#0369A1" }
  it("trims and normalises the colour to lower case", () => {
    expect(validateFields(ok)).toEqual({ ok: true, value: { name: "Legal", purpose: "Contracts.", color: "#0369a1" } })
  })
  it.each([
    [{ ...ok, name: "" }, "name"],
    [{ ...ok, name: "x".repeat(41) }, "40"],
    [{ ...ok, name: "a/b" }, "slash"],
    [{ ...ok, name: ".hidden" }, "dot"],
    [{ ...ok, name: "bad\nname" }, "line"],
    [{ ...ok, purpose: "" }, "purpose"],
    [{ ...ok, purpose: "x".repeat(201) }, "200"],
    [{ ...ok, color: "#000000" }, "colour"],
    [{ ...ok, name: 5 as unknown as string }, "name"],
  ])("rejects %j (%s)", (input) => {
    expect(validateFields(input).ok).toBe(false)
  })
})
