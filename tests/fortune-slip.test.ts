import { describe, expect, it } from "vitest";
import { getFortuneSlip, SLIPS } from "@/lib/fortune-slip";
import type { BirthChart } from "@/lib/types";

function makeChart(elements: Array<{ element: string; count: number; band: string }>): BirthChart {
  return {
    pillars: {
      year: { stem: "甲", branch: "子", stemElement: "木", branchElement: "水" },
      month: { stem: "甲", branch: "子", stemElement: "木", branchElement: "水" },
      day: { stem: "甲", branch: "子", stemElement: "木", branchElement: "水" },
      hour: { stem: "甲", branch: "子", stemElement: "木", branchElement: "水" },
    },
    elements: elements.map((e) => ({ element: e.element as "木" | "火" | "土" | "金" | "水", count: e.count, band: e.band as "少" | "适中" | "多" })),
    timezone: "Asia/Shanghai",
    lateZiRule: "23:00-next-day",
    algorithmVersion: "visible-elements-v1",
  };
}

const ELEMENTS = ["木", "火", "土", "金", "水"] as const;

function allZeroExcept(dominant: string) {
  return ELEMENTS.map((e) => ({ element: e, count: e === dominant ? 5 : 0, band: e === dominant ? "多" : "少" }));
}

describe("getFortuneSlip", () => {
  it("returns deterministic result for same chart and date", () => {
    const chart = makeChart(allZeroExcept("木"));
    const a = getFortuneSlip(chart, "2026-07-05");
    const b = getFortuneSlip(chart, "2026-07-05");
    expect(a).toEqual(b);
  });

  it("index cycles via dayOfMonth % 7", () => {
    const chart = makeChart(allZeroExcept("火"));
    for (let day = 1; day <= 31; day++) {
      const date = `2026-07-${String(day).padStart(2, "0")}`;
      const slip = getFortuneSlip(chart, date);
      expect(slip.index).toBe(day % 7);
    }
  });

  it("selects the correct slip from SLIPS table", () => {
    const chart = makeChart(allZeroExcept("金"));
    const date = "2026-07-03"; // dayOfMonth=3, index=3%7=3
    const slip = getFortuneSlip(chart, date);
    expect(slip.element).toBe("金");
    expect(slip.index).toBe(3);
    const [title, body, intention] = SLIPS["金"][3];
    expect(slip.title).toBe(title);
    expect(slip.body).toBe(body);
    expect(slip.intention).toBe(intention);
  });

  it("covers all five elements", () => {
    for (const el of ELEMENTS) {
      const chart = makeChart(allZeroExcept(el));
      const slip = getFortuneSlip(chart, "2026-07-01");
      expect(slip.element).toBe(el);
    }
  });

  it("tie-break prefers 木 over 火 when counts are equal", () => {
    const chart = makeChart([
      { element: "木", count: 3, band: "多" },
      { element: "火", count: 3, band: "多" },
      { element: "土", count: 0, band: "少" },
      { element: "金", count: 0, band: "少" },
      { element: "水", count: 0, band: "少" },
    ]);
    expect(getFortuneSlip(chart, "2026-07-01").element).toBe("木");
  });

  it("tie-break priority: 木→火→土→金→水", () => {
    const pairs: Array<[typeof ELEMENTS[number], typeof ELEMENTS[number]]> = [
      ["木", "火"], ["火", "土"], ["土", "金"], ["金", "水"],
    ];
    for (const [winner, loser] of pairs) {
      const chart = makeChart([
        { element: "木", count: winner === "木" || loser === "木" ? (winner === "木" ? 2 : 2) : 0, band: "少" },
        { element: "火", count: winner === "火" || loser === "火" ? 2 : 0, band: "少" },
        { element: "土", count: winner === "土" || loser === "土" ? 2 : 0, band: "少" },
        { element: "金", count: winner === "金" || loser === "金" ? 2 : 0, band: "少" },
        { element: "水", count: winner === "水" || loser === "水" ? 2 : 0, band: "少" },
      ]);
      expect(getFortuneSlip(chart, "2026-07-01").element).toBe(winner);
    }
  });

  it("each element has exactly 7 slips", () => {
    for (const el of ELEMENTS) {
      expect(SLIPS[el]).toHaveLength(7);
    }
  });

  it("all slip entries have non-empty title, body, intention", () => {
    for (const el of ELEMENTS) {
      for (const [title, body, intention] of SLIPS[el]) {
        expect(title.length).toBeGreaterThan(0);
        expect(body.length).toBeGreaterThan(0);
        expect(intention.length).toBeGreaterThan(0);
      }
    }
  });

  it("returns index 0 for day 7 (7%7=0) and day 14 (14%7=0)", () => {
    const chart = makeChart(allZeroExcept("水"));
    expect(getFortuneSlip(chart, "2026-07-07").index).toBe(0);
    expect(getFortuneSlip(chart, "2026-07-14").index).toBe(0);
  });
});
