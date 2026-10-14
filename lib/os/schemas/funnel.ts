import { z } from "zod"

export const ProvenanceItemSchema = z.object({
  claim: z.string(),
  said_by: z.string(),
  said_on: z.string(),
  source: z.string(),
})
export type ProvenanceItem = z.infer<typeof ProvenanceItemSchema>

export const LeadStageEnum = z.enum(["new", "qualified", "negotiation", "won", "lost"])
export type LeadStage = z.infer<typeof LeadStageEnum>

export const LeadSchema = z.object({
  id: z.string(),
  name: z.string(),
  stage: LeadStageEnum,
  source: z.string(),
  owner: z.enum(["agent", "human"]),
  value: z.number().nonnegative(),
  currency: z.string().default("USD"),
  first_seen: z.string(),
  last_touch: z.string(),
  provenance: z.array(ProvenanceItemSchema).optional(),
})
export type Lead = z.infer<typeof LeadSchema>

export const LeadsFileSchema = z.object({
  schema_version: z.number().int().positive(),
  records: z.array(LeadSchema),
})
export type LeadsFile = z.infer<typeof LeadsFileSchema>

export const FunnelStageSchema = z.object({
  id: z.string(),
  name: z.string(),
  order: z.number().int().positive(),
  probability: z.number().min(0).max(1).optional(),
})
export type FunnelStage = z.infer<typeof FunnelStageSchema>

export const FunnelStagesFileSchema = z.object({
  schema_version: z.number().int().positive(),
  records: z.array(FunnelStageSchema),
})
export type FunnelStagesFile = z.infer<typeof FunnelStagesFileSchema>
