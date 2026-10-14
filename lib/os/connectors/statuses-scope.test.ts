import { describe, it, expect } from "vitest"
import { paymentsDetail, reducePaymentsSource, emailSource } from "./statuses"

describe("paymentsDetail", () => {
  it("names the machine default when that is where the key came from", () => {
    expect(paymentsDetail(["Stripe"], "machine")).toBe("Stripe configured — machine default")
  })

  it("does not say machine default for a company's own key", () => {
    expect(paymentsDetail(["Stripe"], "company")).toBe("Stripe configured")
  })

  it("tells the user where to add one when unset", () => {
    expect(paymentsDetail([], "unset")).toContain("Connections")
  })
})

describe("reducePaymentsSource", () => {
  it("reduces a mix of company and machine sources to machine", () => {
    expect(reducePaymentsSource(["company", "machine"])).toBe("machine")
  })

  it("reduces all-company sources to company", () => {
    expect(reducePaymentsSource(["company", "company"])).toBe("company")
  })

  it("reduces no sources to unset", () => {
    expect(reducePaymentsSource([])).toBe("unset")
  })
})

describe("emailSource", () => {
  it("reports the machine when the only working inbox is a fallback key", () => {
    // INBOX_2_USER / GMAIL_USER / SMTP_USER are read straight off .env.local,
    // so a row connected through one of them is inheriting the machine's.
    expect(emailSource(null, true)).toBe("machine")
  })

  it("keeps INBOX_1's own source when INBOX_1 is the one in use", () => {
    expect(emailSource("company", true)).toBe("company")
    expect(emailSource("machine", false)).toBe("machine")
  })

  it("is unset only when no inbox is configured anywhere", () => {
    expect(emailSource(null, false)).toBe("unset")
  })
})
