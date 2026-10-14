import { describe, it, expect } from "vitest";
import { followerBarModel, type FollowerPoint } from "./chart";

describe("followerBarModel", () => {
  it("returns empty model when series is empty", () => {
    const model = followerBarModel([]);
    expect(model.bars).toEqual([]);
    expect(model.yTicks).toEqual([]);
    expect(model.floor).toBe(0);
    expect(model.ceil).toBe(0);
  });

  it("computes normalized heights, deltas, and round yTicks", () => {
    const series: FollowerPoint[] = [
      { date: "2026-09-01", followers: 1000 },
      { date: "2026-09-02", followers: 1050 },
      { date: "2026-09-03", followers: 1030 },
      { date: "2026-09-04", followers: 1100 },
    ];
    const model = followerBarModel(series);
    expect(model.bars).toHaveLength(4);
    expect(model.bars[0].delta).toBeNull();
    expect(model.bars[1].delta).toBe(50);
    expect(model.bars[2].delta).toBe(-20);
    expect(model.bars[3].delta).toBe(70);
    expect(model.yTicks.length).toBeGreaterThan(0);
    expect(model.bars[3].h).toBe(1);
  });
});
