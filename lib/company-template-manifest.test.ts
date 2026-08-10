import { describe, it, expect } from "vitest"
import { TEMPLATE_MANIFEST } from "./company-template-manifest"

describe("TEMPLATE_MANIFEST", () => {
  it("never ships .github/workflows — it needs the `workflow` OAuth scope just to be pushed, which gh's default scopes don't include, breaking every new company's first backup (see v55)", () => {
    expect(TEMPLATE_MANIFEST.some((p) => p.startsWith(".github/workflows"))).toBe(false)
  })
})
