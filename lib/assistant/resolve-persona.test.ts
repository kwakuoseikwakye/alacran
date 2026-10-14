import { describe, it, expect, vi } from "vitest"
import { resolvePersona } from "./resolve-persona"
import type { AssistantPersona } from "./persona"

const COMPANY_PERSONA: AssistantPersona = {
  assistantName: "Acme Assistant",
  userName: "Alex",
  spokenLanguage: "en-US",
  replyLanguage: "en-US",
  voiceURI: "",
}

const MACHINE_PERSONA: AssistantPersona = {
  assistantName: "Machine Assistant",
  userName: "Alex",
  spokenLanguage: "en-US",
  replyLanguage: "en-US",
  voiceURI: "",
}

describe("resolvePersona", () => {
  it("returns the company's own persona, tagged as such, when it has one", async () => {
    const readCompany = vi.fn(async () => COMPANY_PERSONA)
    const readMachine = vi.fn(async () => MACHINE_PERSONA)

    const result = await resolvePersona("/companies/acme", readCompany, readMachine)

    expect(result).toEqual({ persona: COMPANY_PERSONA, source: "company" })
    expect(readCompany).toHaveBeenCalledWith("/companies/acme")
    // Never needs the machine one once the company's own is found.
    expect(readMachine).not.toHaveBeenCalled()
  })

  it("falls back to the machine persona when the company has none", async () => {
    const readCompany = vi.fn(async () => null)
    const readMachine = vi.fn(async () => MACHINE_PERSONA)

    const result = await resolvePersona("/companies/acme", readCompany, readMachine)

    expect(result).toEqual({ persona: MACHINE_PERSONA, source: "machine" })
  })

  it("goes straight to the machine persona for a null root, without touching any company file", async () => {
    const readCompany = vi.fn(async () => COMPANY_PERSONA)
    const readMachine = vi.fn(async () => MACHINE_PERSONA)

    const result = await resolvePersona(null, readCompany, readMachine)

    expect(result).toEqual({ persona: MACHINE_PERSONA, source: "machine" })
    expect(readCompany).not.toHaveBeenCalled()
  })

  it("reports unset when neither the company nor the machine has one", async () => {
    const readCompany = vi.fn(async () => null)
    const readMachine = vi.fn(async () => null)

    const result = await resolvePersona("/companies/acme", readCompany, readMachine)

    expect(result).toEqual({ persona: null, source: "unset" })
  })

  it("reports unset for a null root when even the machine has none", async () => {
    const readCompany = vi.fn(async () => COMPANY_PERSONA)
    const readMachine = vi.fn(async () => null)

    const result = await resolvePersona(null, readCompany, readMachine)

    expect(result).toEqual({ persona: null, source: "unset" })
    expect(readCompany).not.toHaveBeenCalled()
  })
})
