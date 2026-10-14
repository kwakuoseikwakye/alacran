import { z } from "zod"

/** The canonical shape from docs/templates/ontology-starter.yaml — what
 *  /define-company writes. NOT the company_summary/stakeholders shape that
 *  lib/parse-company-ontology.ts reads for the in-app setup wizard. */
export const ontologySchema = z.object({
  meta: z.object({ version: z.number(), updated: z.string() }).partial().optional(),
  customer: z.object({
    segments: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        job_to_be_done: z.string().optional(),
        alternative: z.string().optional(),
      })
    ),
    acquisition: z.array(z.object({ channel: z.string(), notes: z.string().optional() })).default([]),
  }),
  org: z.object({
    roles: z.array(z.object({ id: z.string(), name: z.string(), owns: z.string().optional() })),
    decisions: z.array(z.object({ decision: z.string(), approver: z.string() })).default([]),
  }),
  product: z.object({
    offerings: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        promise: z.string().optional(),
        pricing: z.string().optional(),
      })
    ),
    value_flow: z.array(z.object({ step: z.string(), owner: z.string().optional() })).default([]),
    bottleneck: z.string().optional(),
  }),
})

export type Ontology = z.infer<typeof ontologySchema>
