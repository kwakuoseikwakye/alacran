import { describe, it, expect } from "vitest";
import { CANONICAL_PERSONAS } from "@/lib/os/personas/seed";
import { PersonaOrgChart } from "@/components/os/personas/persona-org-chart";
import { PersonaBrainGraph } from "@/components/os/personas/persona-brain-graph";

describe("Persona SVG Components", () => {
  const sample = CANONICAL_PERSONAS[0]; // Agency Owner

  it("renders PersonaOrgChart with correct SVG structure, role, and labels", () => {
    const element = PersonaOrgChart({ persona: sample });
    expect(element).toBeDefined();
    expect(element.type).toBe("svg");
    expect(element.props.role).toBe("img");
    expect(element.props.viewBox).toBe("0 0 760 150");
    expect(element.props["aria-label"]).toBe(`${sample.name} org chart`);
  });

  it("renders PersonaBrainGraph with radial constellation nodes, obsidian core, and synaptic edges", () => {
    const element = PersonaBrainGraph({ persona: sample });
    expect(element).toBeDefined();
    expect(element.type).toBe("svg");
    expect(element.props.role).toBe("img");
    expect(element.props.viewBox).toBe("0 0 900 760");
    expect(element.props["aria-label"]).toBe(`${sample.name} knowledge graph`);
  });
});
