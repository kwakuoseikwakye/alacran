import { readCompanyPersona } from "./company-persona"
import { readAssistantPersonaImpl } from "../voice/settings-impl"
import type { AssistantPersona } from "./persona"

export type ReadCompanyPersonaFn = (agentRootPath: string) => Promise<AssistantPersona | null>
export type ReadMachinePersonaFn = () => Promise<AssistantPersona | null>

/**
 * Company-first resolution for the two ask paths (askCompanyImpl's
 * per-company question, askAllCompaniesImpl's cross-company one, and the
 * streaming route both back) and for anywhere else that needs to know who
 * the assistant is *for a given company*: a company that has set its own
 * persona (`definitions/integrations/assistant.yaml`, via
 * `company-persona.ts`) is answered by it; everyone else falls back to the
 * machine-wide one from `voice.json` (via `settings-impl.ts`), and a
 * machine with neither is "unset" — which is what triggers first-run setup.
 *
 * This is the ONLY module that imports both leaves. `company-persona.ts` and
 * `settings-impl.ts` know nothing about each other or about this file, which
 * is what keeps the dependency a tree instead of a cycle: both statically
 * importable here, no `await import(...)` needed on either side.
 *
 * The two readers are injectable (real defaults) so this branching — the
 * crux of the whole feature — can be tested against fakes rather than real
 * files, same DI rule this repo applies to every filesystem-touching
 * function.
 */
export async function resolvePersona(
  agentRootPath: string | null,
  readCompany: ReadCompanyPersonaFn = readCompanyPersona,
  readMachine: ReadMachinePersonaFn = readAssistantPersonaImpl
): Promise<{ persona: AssistantPersona | null; source: "company" | "machine" | "unset" }> {
  if (agentRootPath) {
    const own = await readCompany(agentRootPath)
    if (own) return { persona: own, source: "company" }
  }
  const machine = await readMachine()
  return machine ? { persona: machine, source: "machine" } : { persona: null, source: "unset" }
}

/**
 * Adapter matching `ReadPersonaFn`'s shape (`lib/ask-company-impl.ts`) — the
 * persona alone, not the source — for the two ask paths that only ever
 * wanted the value and previously read it straight off `settings-impl.ts`.
 */
export async function readPersonaForCompany(agentRootPath: string | null): Promise<AssistantPersona | null> {
  return (await resolvePersona(agentRootPath)).persona
}
