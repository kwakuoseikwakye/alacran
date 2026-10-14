import { getCompanyCommand } from "@/lib/company-commands/registry"
import type { PreferenceOffer } from "./offer"

const defaultLabel = (id: string) => getCompanyCommand(id)?.label ?? id

function join(names: string[]): string {
  return names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`
}

export function describeOffer(offer: PreferenceOffer, labelOf: (id: string) => string = defaultLabel): { text: string; label: string; title: string } {
  const names = join(offer.commands.map((c) => labelOf(c.id)))
  const total = offer.commands.reduce((sum, c) => sum + c.revisions, 0)
  return {
    text: `You've asked for changes to ${names} ${total} times. Alacrán can look for what you keep asking for and suggest preferences for you to approve.`,
    label: "Learn from my feedback",
    title: "Reads your recent change requests and proposes preference lines for you to approve. Nothing changes until you approve it.",
  }
}
