import path from "node:path"
import { COMPANY_COMMANDS_DATA_DIR } from "@/lib/company-commands/paths"
import { hasPendingPreferenceReview } from "./pending"
import { loadPreferenceOffer, type PreferenceOffer } from "./offer"

/** What pages call: the default per-company run-data dir lives here, so offer.ts stays injectable. */
export async function loadPreferenceOfferFor(agentId: string, root: string): Promise<PreferenceOffer | null> {
  const dataDir = path.join(COMPANY_COMMANDS_DATA_DIR, agentId)
  // Pressing it again would fold the waiting proposal into the baseline; approve or discard first.
  if (await hasPendingPreferenceReview(dataDir, root)) return null
  return loadPreferenceOffer(dataDir).catch(() => null)
}
