import { describe, it, expect } from "vitest";
import {
  NewsletterSchema,
  SEED_NEWSLETTERS,
} from "./types";
import { readNewsletters, newsletterSummary } from "./read";

describe("Newsletters Schema & Reader", () => {
  it("validates all SEED_NEWSLETTERS against NewsletterSchema", () => {
    expect(SEED_NEWSLETTERS.length).toBeGreaterThan(0);
    SEED_NEWSLETTERS.forEach((n) => {
      const parsed = NewsletterSchema.safeParse(n);
      expect(parsed.success).toBe(true);
    });
  });

  it("calculates newsletter summary correctly", () => {
    const summary = newsletterSummary(SEED_NEWSLETTERS);
    expect(summary.count).toBe(SEED_NEWSLETTERS.length);
    expect(summary.totalRecipients).toBeGreaterThan(0);
    expect(summary.avgOpenRate).toBeGreaterThan(0);
    expect(summary.bestOpenRate).toBeGreaterThan(0);
  });

  it("returns unconfigured honest empty state when no Beehiiv keys are configured", async () => {
    const result = await readNewsletters("non-existent-company-root");
    expect(result.newsletters).toEqual([]);
    expect(result.subscribers).toBeNull();
    expect(result.isLive).toBe(false);
    expect(result.summary.count).toBe(0);
  });

  it("returns seeded preview when fallbackToSeed is requested", async () => {
    const result = await readNewsletters("non-existent-company-root", { fallbackToSeed: true });
    expect(result.newsletters).toEqual(SEED_NEWSLETTERS);
    expect(result.subscribers).toBe(15400);
    expect(result.isLive).toBe(false);
    expect(result.summary.count).toBe(SEED_NEWSLETTERS.length);
  });
});
