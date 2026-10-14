import type { Stakeholder } from "./build-company-ontology"

export function formatDefineCompanyFields(input: {
  domain: string
  stakeholders: Stakeholder[]
  valueFlow: { input: string; transform: string; output: string }
  bottleneck: string
}): Record<string, string> {
  return {
    domain: input.domain,
    stakeholders: input.stakeholders
      .filter((s) => s.role.trim() && s.position.trim())
      .map((s) => `- ${s.role}: ${s.position}`)
      .join("\n"),
    valueFlow: `Input: ${input.valueFlow.input}\nTransform: ${input.valueFlow.transform}\nOutput: ${input.valueFlow.output}`,
    bottleneck: input.bottleneck,
  }
}
