import { describe, it, expect } from "vitest";
import { CANONICAL_PERSONAS } from "@/lib/os/personas/seed";
import { PersonaCard } from "@/components/os/personas/persona-card";
import { PersonasViewer } from "@/components/os/personas/personas-viewer";

describe("PersonaCard & PersonasViewer", () => {
  const sample = CANONICAL_PERSONAS[0];

  it("renders PersonaCard with expected structure and styling", () => {
    const card = PersonaCard({ p: sample, cover: false });
    expect(card).toBeDefined();
    expect(card.type).toBe("article");
    expect(card.props.style?.borderTop).toBe(`2px solid ${sample.accent}`);
  });

  it("renders PersonasViewer with initial persona and jump rail without throwing in Node", () => {
    const viewer = PersonasViewer({ personas: CANONICAL_PERSONAS });
    expect(viewer).toBeDefined();
    expect(viewer?.type).toBe("div");
  });
});
