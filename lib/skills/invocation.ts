/**
 * How a person runs an installed command in a terminal session of each agent.
 * Codex is the exception worth saying out loud: it has no custom slash commands,
 * so a skill is mentioned with a dollar sign instead.
 */
export function invocationFor(executorId: string, name: string): string {
  if (executorId === "codex") return `$${name}`
  if (executorId === "kimi") return `/skill:${name}`
  return `/${name}`
}

export function invocationSentence(executorId: string): string {
  if (executorId === "codex") {
    return "In Codex, run one by writing its name after a dollar sign, like $name (Codex has no custom slash commands)."
  }
  return `Run one by typing ${invocationFor(executorId, "name")}.`
}
