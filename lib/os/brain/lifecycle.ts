import path from "node:path"
import type { Ontology } from "../ontology/schema"

export type Stage = "source" | "signal" | "claim" | "fact" | "memory"

export type LifecycleCard = { id: string; stage: Stage; label: string; detail: string }

export type LifecycleInput = {
  sources: string[]
  signals: string[]
  claims: { agentId: string; commandId: string; touchesDefinitions: boolean }[]
  ontology: Ontology | null
  memories: string[]
}

const fileCard = (stage: Stage, relPath: string): LifecycleCard => ({
  id: `${stage}:${relPath}`,
  stage,
  label: path.basename(relPath),
  detail: relPath,
})

/**
 * Alacrán stores no "claims" of its own, and this does not invent a store. The
 * five stages are a reading of files that already exist: sweeps are sources,
 * digests are signals, a pending review that would edit definitions/ IS a
 * claim awaiting promotion, the ontology is the facts, and the summary plus
 * the decision log are the durable memory.
 *
 * A review that touches only notes/ is work, not a claim, so it is excluded —
 * otherwise every scheduled log run would appear as pending knowledge.
 */
export function buildLifecycle(input: LifecycleInput): Record<Stage, LifecycleCard[]> {
  const facts: LifecycleCard[] = []
  if (input.ontology) {
    for (const segment of input.ontology.customer.segments) {
      facts.push({ id: `fact:segment:${segment.id}`, stage: "fact", label: segment.name, detail: "customer.segments" })
    }
    for (const role of input.ontology.org.roles) {
      facts.push({ id: `fact:role:${role.id}`, stage: "fact", label: role.name, detail: "org.roles" })
    }
    for (const offering of input.ontology.product.offerings) {
      facts.push({ id: `fact:offering:${offering.id}`, stage: "fact", label: offering.name, detail: "product.offerings" })
    }
  }

  return {
    source: input.sources.map((p) => fileCard("source", p)),
    signal: input.signals.map((p) => fileCard("signal", p)),
    claim: input.claims
      .filter((c) => c.touchesDefinitions)
      .map((c) => ({
        id: `claim:${c.agentId}:${c.commandId}`,
        stage: "claim" as const,
        label: c.commandId,
        detail: `${c.agentId} — awaiting review`,
      })),
    fact: facts,
    memory: input.memories.map((p) => fileCard("memory", p)),
  }
}
