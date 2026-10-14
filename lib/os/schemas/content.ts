import { z } from "zod"
import { ProvenanceItemSchema } from "./funnel"

export const ContentStatusEnum = z.enum([
  "idea",
  "draft",
  "review",
  "scheduled",
  "published",
  "archived",
])
export type ContentStatus = z.infer<typeof ContentStatusEnum>

export const ContentTypeEnum = z.enum([
  "post",
  "article",
  "newsletter",
  "video",
  "changelog",
  "documentation",
  "other",
])
export type ContentType = z.infer<typeof ContentTypeEnum>

export const ContentItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  status: ContentStatusEnum,
  type: ContentTypeEnum,
  channel: z.string(),
  author: z.enum(["agent", "human"]),
  publish_date: z.string().optional(),
  url: z.string().optional(),
  summary: z.string().optional(),
  provenance: z.array(ProvenanceItemSchema).optional(),
})
export type ContentItem = z.infer<typeof ContentItemSchema>

export const ContentItemsFileSchema = z.object({
  schema_version: z.number().int().positive(),
  records: z.array(ContentItemSchema),
})
export type ContentItemsFile = z.infer<typeof ContentItemsFileSchema>
