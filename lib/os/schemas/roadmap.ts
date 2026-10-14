import { z } from "zod"
import { GateCheckpointEnum } from "./workflows"

export const RoadmapStatusEnum = z.enum(["done", "now", "next", "later"])
export type RoadmapStatus = z.infer<typeof RoadmapStatusEnum>

export const RoadmapPhaseSchema = z.object({
  id: z.string(),
  number: z.number().int().positive(),
  title: z.string(),
  status: RoadmapStatusEnum,
  items: z.array(z.string()),
})
export type RoadmapPhase = z.infer<typeof RoadmapPhaseSchema>

export const RoadmapMilestoneSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  quarter: z.string().regex(/^\d{4}-Q[1-4]$/, "Quarter must be in format YYYY-QX (e.g. 2026-Q1)"),
  status: RoadmapStatusEnum,
  departmentId: z.string().nullish(),
  targetDate: z.string().nullish(),
  deliverable: z.string().nullish(),
  gateCheckpoint: GateCheckpointEnum.nullish(),
})
export type RoadmapMilestone = z.infer<typeof RoadmapMilestoneSchema>

export const RoadmapFileSchema = z.object({
  phases: z.array(RoadmapPhaseSchema).default([]),
  milestones: z.array(RoadmapMilestoneSchema).default([]),
})
export type RoadmapFile = z.infer<typeof RoadmapFileSchema>
