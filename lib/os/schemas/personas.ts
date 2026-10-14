import { z } from "zod";

export const PersonaPillarSchema = z.object({
  name: z.string().min(1),
  focus: z.string().min(1),
  agents: z.array(z.string().min(1)),
});

export type PersonaPillar = z.infer<typeof PersonaPillarSchema>;

export const PersonaSchema = z.object({
  id: z.string().min(1),
  order: z.number().int().positive(),
  name: z.string().min(1),
  archetype: z.string().min(1),
  accent: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  tagline: z.string().min(1),
  summary: z.string().min(1),
  northStar: z.string().min(1),
  pillars: z.array(PersonaPillarSchema).min(1),
  connectors: z.array(z.string().min(1)),
  metrics: z.array(z.string().min(1)),
  brainUse: z.string().min(1),
  signaturePlay: z.string().min(1),
});

export type Persona = z.infer<typeof PersonaSchema>;
