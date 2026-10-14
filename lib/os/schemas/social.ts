import { z } from "zod"
import { ProvenanceItemSchema } from "./funnel"

export const SocialPlatformEnum = z.enum([
  "x",
  "linkedin",
  "youtube",
  "instagram",
  "github",
  "bluesky",
  "threads",
  "other",
])
export type SocialPlatform = z.infer<typeof SocialPlatformEnum>

export const SocialAccountSchema = z.object({
  id: z.string(),
  platform: SocialPlatformEnum,
  handle: z.string(),
  url: z.string(),
  followers: z.number().nonnegative(),
  following: z.number().nonnegative().optional(),
  last_sync: z.string(),
  provenance: z.array(ProvenanceItemSchema).optional(),
})
export type SocialAccount = z.infer<typeof SocialAccountSchema>

export const SocialAccountsFileSchema = z.object({
  schema_version: z.number().int().positive(),
  records: z.array(SocialAccountSchema),
})
export type SocialAccountsFile = z.infer<typeof SocialAccountsFileSchema>

export const SocialSnapshotSchema = z.preprocess(
  (val: unknown) => {
    if (val && typeof val === "object") {
      const copy = { ...(val as Record<string, unknown>) }
      if (!copy.date && typeof copy.timestamp === "string") {
        copy.date = copy.timestamp.slice(0, 10)
      }
      if (!copy.account_id && typeof copy.platform === "string") {
        copy.account_id = `${copy.platform}-alacran`
      }
      return copy
    }
    return val
  },
  z.object({
    id: z.string(),
    account_id: z.string(),
    date: z.string(),
    followers: z.number().nonnegative(),
    impressions: z.number().nonnegative().optional(),
    engagements: z.number().nonnegative().optional(),
    posts_count: z.number().nonnegative().optional(),
  })
)
export type SocialSnapshot = z.infer<typeof SocialSnapshotSchema>

export const SocialSnapshotsFileSchema = z.object({
  schema_version: z.number().int().positive(),
  records: z.array(SocialSnapshotSchema),
})
export type SocialSnapshotsFile = z.infer<typeof SocialSnapshotsFileSchema>
