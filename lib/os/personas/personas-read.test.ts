import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { readPersonas } from "@/lib/os/personas/read";
import { CANONICAL_PERSONAS } from "@/lib/os/personas/seed";

describe("readPersonas", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "personas-test-"));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("returns canonical seed when no archetypes.yaml file exists", async () => {
    const personas = await readPersonas("non-existent-company-xyz");
    expect(personas).toEqual(CANONICAL_PERSONAS);
  });

  it("loads and validates custom archetypes from definitions/personas/archetypes.yaml", async () => {
    const personasDir = path.join(tmpDir, "definitions", "personas");
    await fs.mkdir(personasDir, { recursive: true });

    const customYaml = `
- id: "custom-operator"
  order: 1
  name: "Custom Operator"
  archetype: "Custom Solo Founder"
  accent: "#ff0077"
  tagline: "Ultra specialized operator"
  summary: "A customized operator summary."
  northStar: "$1M ARR"
  pillars:
    - name: "Core"
      focus: "Automation"
      agents: ["AutoBot"]
  connectors: ["Stripe", "HubSpot", "Slack", "Asana", "Harvest"]
  metrics: ["MRR", "Churn", "LTV", "CAC"]
  brainUse: "Custom knowledge graph"
  signaturePlay: "Execute autonomous pipeline"
`;
    await fs.writeFile(
      path.join(personasDir, "archetypes.yaml"),
      customYaml,
      "utf-8",
    );

    const personas = await readPersonas("any-id", { companyRoot: tmpDir });
    expect(personas).toHaveLength(1);
    expect(personas[0].id).toBe("custom-operator");
    expect(personas[0].name).toBe("Custom Operator");
    expect(personas[0].accent).toBe("#ff0077");
  });

  it("falls back gracefully to canonical personas if yaml is malformed", async () => {
    const personasDir = path.join(tmpDir, "definitions", "personas");
    await fs.mkdir(personasDir, { recursive: true });
    await fs.writeFile(
      path.join(personasDir, "archetypes.yaml"),
      "invalid: yaml: [",
      "utf-8",
    );

    const personas = await readPersonas("any-id", { companyRoot: tmpDir });
    expect(personas).toEqual(CANONICAL_PERSONAS);
  });
});
