import fs from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import { PersonaSchema, type Persona } from "@/lib/os/schemas/personas";
import { CANONICAL_PERSONAS } from "@/lib/os/personas/seed";
import { getActiveCompanyRoot } from "@/lib/os/active-company";

export interface ReadPersonasOptions {
  companyRoot?: string;
}

/**
 * Reads personas for the given company.
 * If <companyRoot>/definitions/personas/archetypes.yaml exists and is valid,
 * loads and validates those custom archetypes.
 * Otherwise, falls back to the 11 canonical FounderOS archetypes.
 */
export async function readPersonas(
  companyId: string,
  options?: ReadPersonasOptions,
): Promise<Persona[]> {
  try {
    let root = options?.companyRoot;
    if (!root) {
      root = (await getActiveCompanyRoot(companyId)) || undefined;
    }

    // If companyId itself is an existing directory path (e.g. during local tests)
    if (!root) {
      try {
        const stat = await fs.stat(companyId);
        if (stat.isDirectory()) {
          root = companyId;
        }
      } catch {
        // companyId is not a directory path
      }
    }

    if (!root) {
      return CANONICAL_PERSONAS;
    }

    const overridePath = path.join(
      root,
      "definitions",
      "personas",
      "archetypes.yaml",
    );

    let raw: string;
    try {
      raw = await fs.readFile(overridePath, "utf-8");
    } catch {
      return CANONICAL_PERSONAS;
    }

    if (!raw.trim()) {
      return CANONICAL_PERSONAS;
    }

    const parsed = YAML.parse(raw);
    if (!Array.isArray(parsed)) {
      return CANONICAL_PERSONAS;
    }

    const validPersonas: Persona[] = [];
    for (const item of parsed) {
      const result = PersonaSchema.safeParse(item);
      if (result.success) {
        validPersonas.push(result.data);
      }
    }

    if (validPersonas.length === 0) {
      return CANONICAL_PERSONAS;
    }

    // Sort sequentially by order
    return validPersonas.sort((a, b) => a.order - b.order);
  } catch {
    return CANONICAL_PERSONAS;
  }
}
