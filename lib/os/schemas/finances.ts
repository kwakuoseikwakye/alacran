import { z } from "zod"
import { ProvenanceItemSchema } from "./funnel"

export const TransactionTypeEnum = z.enum(["income", "expense"])
export type TransactionType = z.infer<typeof TransactionTypeEnum>

export const TransactionStatusEnum = z.enum(["cleared", "pending"])
export type TransactionStatus = z.infer<typeof TransactionStatusEnum>

export const TransactionSchema = z.object({
  id: z.string(),
  date: z.string(),
  description: z.string(),
  amount: z.number().nonnegative(),
  currency: z.string().default("USD"),
  type: TransactionTypeEnum,
  category: z.string(),
  account: z.string(),
  status: TransactionStatusEnum,
  provenance: z.array(ProvenanceItemSchema).optional(),
})
export type Transaction = z.infer<typeof TransactionSchema>

export const TransactionsFileSchema = z.object({
  schema_version: z.number().int().positive(),
  records: z.array(TransactionSchema),
})
export type TransactionsFile = z.infer<typeof TransactionsFileSchema>

export const FinancialCategorySchema = z.object({
  id: z.string(),
  name: z.string(),
  type: TransactionTypeEnum,
  budget: z.number().nonnegative().optional(),
  color: z.string().optional(),
})
export type FinancialCategory = z.infer<typeof FinancialCategorySchema>

export const FinancialCategoriesFileSchema = z.object({
  schema_version: z.number().int().positive(),
  records: z.array(FinancialCategorySchema),
})
export type FinancialCategoriesFile = z.infer<typeof FinancialCategoriesFileSchema>
