import { describe, it, expect } from "vitest"
import { readCompanyPersona, COMPANY_PERSONA_RELATIVE_PATH } from "./company-persona"

describe("readCompanyPersona", () => {
  it("reads a persona out of the company's own yaml", async () => {
    const read = async (p: string) => {
      expect(p).toContain(COMPANY_PERSONA_RELATIVE_PATH)
      return "assistantName: Alacrán\nuserName: Alex\nspokenLanguage: en-GB\nreplyLanguage: en-GB\n"
    }
    const persona = await readCompanyPersona("/tmp/company", read)
    expect(persona?.assistantName).toBe("Alacrán")
    expect(persona?.userName).toBe("Alex")
  })

  it("returns null when the file is absent", async () => {
    const read = async () => { throw new Error("ENOENT") }
    expect(await readCompanyPersona("/tmp/company", read)).toBeNull()
  })

  it("returns null for unparseable yaml rather than throwing", async () => {
    const read = async () => "assistantName: [unclosed"
    expect(await readCompanyPersona("/tmp/company", read)).toBeNull()
  })
})
