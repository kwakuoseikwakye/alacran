import { describe, it, expect } from "vitest";
import { GrowthBadge } from "./growth-badge";
import { FollowerBarChart } from "./follower-bar-chart";
import type { FollowerPoint } from "@/lib/os/social/chart";

describe("GrowthBadge & FollowerBarChart", () => {
  it("renders GrowthBadge with formatted percentage and label", () => {
    const badge = GrowthBadge({ label: "7d", value: 4.2 });
    expect(badge).toBeDefined();
    expect(badge.type).toBe("div");
  });

  it("renders GrowthBadge with em-dash when value is null", () => {
    const badge = GrowthBadge({ label: "30d", value: null });
    expect(badge).toBeDefined();
  });

  it("renders FollowerBarChart empty fallback when series is empty", () => {
    const chart = FollowerBarChart({ series: [] });
    expect(chart).toBeDefined();
    expect(chart.type).toBe("p");
  });

  it("renders FollowerBarChart SVG when series is provided", () => {
    const series: FollowerPoint[] = [
      { date: "2026-09-01", followers: 1000 },
      { date: "2026-09-02", followers: 1050 },
    ];
    const chart = FollowerBarChart({ series });
    expect(chart).toBeDefined();
    expect(chart.type).toBe("svg");
    expect(chart.props.role).toBe("img");
    expect(chart.props.viewBox).toBe("0 0 920 240");
  });
});
