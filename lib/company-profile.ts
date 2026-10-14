import { parse } from "yaml"

type UnknownRecord = Record<string, unknown>

function record(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as UnknownRecord : null
}

/** A starter placeholder ("<<TODO: ...>>") is a blank the owner hasn't filled in, not an entry. */
function names(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((entry) => {
    const item = record(entry)
    const name = typeof item?.name === "string" ? item.name.trim() : ""
    return name && !name.includes("<<TODO") ? [name] : []
  })
}

/** Company files predate the current ontology shape. Reading an older or
 * partially edited file must produce useful blanks, never take down the page. */
export function readProfile(source: string) {
  let profile: UnknownRecord = {}
  try { profile = record(source ? parse(source) : {}) ?? {} } catch { profile = {} }
  const customer = record(profile.customer)
  const product = record(profile.product)
  const org = record(profile.org)
  return {
    customers: names(customer?.segments),
    offerings: names(product?.offerings),
    roles: names(org?.roles),
  }
}
