import { z } from "zod"

export const GateCheckpointEnum = z.enum([
  "money",
  "contracts",
  "irreversible",
  "publication",
  "credentials",
])
export type GateCheckpoint = z.infer<typeof GateCheckpointEnum>

export const WorkflowAutomationSchema = z.object({
  title: z.string(),
  state: z.enum(["live", "suggested"]),
  recovered_usd: z.number().nonnegative(),
})
export type WorkflowAutomation = z.infer<typeof WorkflowAutomationSchema>

export const WorkflowStepSchema = z.object({
  id: z.string(),
  title: z.string(),
  owner: z.string(),
  owner_kind: z.enum(["agent", "human"]),
  hours_per_week: z.number().nonnegative(),
  tools: z.array(z.string()).default([]),
  leak_usd: z.number().nonnegative().nullish(),
  gate_checkpoint: GateCheckpointEnum.nullish(),
  automation: WorkflowAutomationSchema.nullish(),
  edge_label: z.string().nullish(),
})
export type WorkflowStep = z.infer<typeof WorkflowStepSchema>

export const WorkflowSchema = z.object({
  id: z.string(),
  name: z.string(),
  department: z.string(),
  description: z.string(),
  steps: z.array(WorkflowStepSchema).default([]),
})
export type Workflow = z.infer<typeof WorkflowSchema>

export const WorkflowsFileSchema = z.object({
  schema_version: z.number().int().positive(),
  records: z.array(WorkflowSchema),
})
export type WorkflowsFile = z.infer<typeof WorkflowsFileSchema>
