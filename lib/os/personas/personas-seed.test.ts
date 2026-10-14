import { describe, it, expect } from "vitest";
import { PersonaSchema } from "@/lib/os/schemas/personas";
import { CANONICAL_PERSONAS } from "@/lib/os/personas/seed";

describe("PersonaSchema & CANONICAL_PERSONAS", () => {
  it("ships exactly 11 canonical archetypes matching FounderOS reference", () => {
    expect(CANONICAL_PERSONAS).toHaveLength(11);
  });

  it("validates every canonical archetype against PersonaSchema", () => {
    CANONICAL_PERSONAS.forEach((p) => {
      const result = PersonaSchema.safeParse(p);
      expect(
        result.success,
        `Persona ${p.id} failed validation: ${JSON.stringify(result.error?.issues)}`,
      ).toBe(true);
    });
  });

  it("ensures sequential ordering from 1 to 11", () => {
    const orders = CANONICAL_PERSONAS.map((p) => p.order);
    expect(orders).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  });

  it("ensures valid hex color accents", () => {
    CANONICAL_PERSONAS.forEach((p) => {
      expect(p.accent).toMatch(/^#[0-9a-fA-F]{6}$/);
    });
  });

  it("ensures every archetype has 5 pillars with assigned agents", () => {
    CANONICAL_PERSONAS.forEach((p) => {
      expect(p.pillars.length).toBe(5);
      p.pillars.forEach((pillar) => {
        expect(pillar.agents.length).toBeGreaterThan(0);
      });
    });
  });
});
