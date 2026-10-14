export type CompanyCtx = { scope: string; companies: { id: string; name: string }[] }

const text = (v: unknown) => (typeof v === "string" ? v.trim() : "")

/**
 * A named company must match exactly (case-insensitive); an unknown name never falls back to the
 * dock's company, because the card would then carry another company's words. With no name, the
 * dock's company is used, and scope "all" with no name asks which one.
 */
export function resolveCompany(
  rawName: unknown,
  ctx: CompanyCtx
): { ok: true; company: { id: string; name: string } } | { ok: false; text: string } {
  const listing = `Which company is this for? The companies here are: ${ctx.companies.map((c) => c.name).join(", ")}. Ask the user which one.`
  const named = text(rawName).toLowerCase()
  if (named) {
    const byName = ctx.companies.find((c) => c.name.toLowerCase() === named)
    return byName ? { ok: true, company: byName } : { ok: false, text: listing }
  }
  const byScope = ctx.scope !== "all" ? ctx.companies.find((c) => c.id === ctx.scope) : undefined
  return byScope ? { ok: true, company: byScope } : { ok: false, text: listing }
}
