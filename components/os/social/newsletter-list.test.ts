import { describe, it, expect } from "vitest";
import { NewsletterList } from "./newsletter-list";
import { SEED_NEWSLETTERS } from "@/lib/os/newsletters/types";

describe("NewsletterList", () => {
  it("renders empty message when list is empty", () => {
    const list = NewsletterList({ newsletters: [] });
    expect(list).toBeDefined();
    expect(list.type).toBe("p");
  });

  it("renders list with newsletter issues without crashing in Node", () => {
    const list = NewsletterList({ newsletters: SEED_NEWSLETTERS });
    expect(list).toBeDefined();
    expect(list.type).toBe("div");
  });
});
