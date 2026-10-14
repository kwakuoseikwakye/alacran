import type { Ontology } from "../ontology/schema"

export type GraphNode = {
  id: string
  label: string
  kind: "root" | "segment" | "channel" | "role" | "offering" | "step"
  /** "fact" renders in the accent, "dim" renders muted. A step whose owner
   *  does not name a real role is dim: the ontology asserts it, nothing
   *  corroborates it. */
  state: "fact" | "dim"
}

export type GraphEdge = { source: string; target: string }

const ROOT = "root:company"

/**
 * The ontology is already a graph — three domains, each a list of entities,
 * with value_flow steps naming the role that owns them. This makes those
 * relationships explicit rather than inventing any.
 *
 * A domain with no entities contributes no node and no edge, so an empty
 * ontology renders one lonely root rather than a fake structure.
 */
export function buildGraph(ontology: Ontology): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const nodes: GraphNode[] = [{ id: ROOT, label: "Company", kind: "root", state: "fact" }]
  const edges: GraphEdge[] = []

  for (const segment of ontology.customer.segments) {
    nodes.push({ id: `segment:${segment.id}`, label: segment.name, kind: "segment", state: "fact" })
    edges.push({ source: ROOT, target: `segment:${segment.id}` })
  }

  ontology.customer.acquisition.forEach((entry, index) => {
    nodes.push({ id: `channel:${index}`, label: entry.channel, kind: "channel", state: "fact" })
    edges.push({ source: ROOT, target: `channel:${index}` })
  })

  const roleIds = new Set(ontology.org.roles.map((r) => r.id))
  for (const role of ontology.org.roles) {
    nodes.push({ id: `role:${role.id}`, label: role.name, kind: "role", state: "fact" })
    edges.push({ source: ROOT, target: `role:${role.id}` })
  }

  for (const offering of ontology.product.offerings) {
    nodes.push({ id: `offering:${offering.id}`, label: offering.name, kind: "offering", state: "fact" })
    edges.push({ source: ROOT, target: `offering:${offering.id}` })
  }

  ontology.product.value_flow.forEach((entry, index) => {
    const owned = entry.owner !== undefined && roleIds.has(entry.owner)
    nodes.push({
      id: `step:${index}`,
      label: entry.step,
      kind: "step",
      state: owned ? "fact" : "dim",
    })
    if (owned) edges.push({ source: `role:${entry.owner}`, target: `step:${index}` })
  })

  return { nodes, edges }
}
