import { describe, expect, it } from "vitest";
import {
  hasCompleteOutfit,
  isWardrobeItemEligible,
  seasonForShanghaiDate,
  validateModelOutput,
} from "@/lib/schemas";
import type { WardrobeItemV3 } from "@/lib/types";
import { makeModelOutput, validProfile, validWardrobe } from "./fixtures/factories";

const WINTER_DATE = "2026-01-15";

function item(overrides: Partial<WardrobeItemV3>): WardrobeItemV3 {
  return {
    ...validWardrobe[0],
    id: "synthetic-item",
    scenes: ["通勤"],
    seasons: ["冬"],
    enabled: true,
    ...overrides,
  };
}

describe("season and category wardrobe grounding", () => {
  it("derives the presentation season from an explicit Shanghai date", () => {
    expect(seasonForShanghaiDate("2026-01-15")).toBe("冬");
    expect(seasonForShanghaiDate("2026-04-15")).toBe("春");
    expect(seasonForShanghaiDate("2026-07-15")).toBe("夏");
    expect(seasonForShanghaiDate("2026-10-15")).toBe("秋");
  });

  it("requires enabled, scene-matched, season-matched items while 四季 remains eligible", () => {
    expect(isWardrobeItemEligible(item({}), "通勤", "冬")).toBe(true);
    expect(isWardrobeItemEligible(item({ seasons: ["四季"] }), "通勤", "冬")).toBe(true);
    expect(isWardrobeItemEligible(item({ seasons: ["夏"] }), "通勤", "冬")).toBe(false);
    expect(isWardrobeItemEligible(item({ scenes: ["休闲"] }), "通勤", "冬")).toBe(false);
    expect(isWardrobeItemEligible(item({ enabled: false }), "通勤", "冬")).toBe(false);
    expect(isWardrobeItemEligible(item({
      primaryColor: { name: "朱砂", hex: "#B33A2B" },
    }), "通勤", "冬", ["红色"])).toBe(false);
    expect(isWardrobeItemEligible(item({
      secondaryColor: { name: "酒红", hex: "#722F37" },
    }), "通勤", "冬", ["红色"])).toBe(false);
  });

  it("defines a complete clothing formula as a dress or top plus bottom", () => {
    expect(hasCompleteOutfit([item({ category: "连衣裙" })])).toBe(true);
    expect(hasCompleteOutfit([
      item({ id: "top", category: "上装" }),
      item({ id: "bottom", category: "下装" }),
    ])).toBe(true);
    expect(hasCompleteOutfit([item({ category: "上装" })])).toBe(false);
    expect(hasCompleteOutfit([item({ category: "鞋履" })])).toBe(false);
  });

  it("validates against the fixed server date, not the month when the test runs", () => {
    const winterTop = item({ id: "winter-top", category: "上装" });
    const summerBottom = item({ id: "summer-bottom", category: "下装", seasons: ["夏"] });
    const output = makeModelOutput();
    output.dailyStyle.outfits[0].wardrobeItemIds = [winterTop.id, summerBottom.id];
    output.dailyStyle.outfits[0].missingPieces = [];

    const result = validateModelOutput(output, validProfile, [winterTop, summerBottom], WINTER_DATE);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.issues.join("\n")).toMatch(/季节|winter|不适用|下装/iu);
    }
  });

  it("requires missing pieces when eligible selected IDs do not form a complete formula", () => {
    const winterTop = item({ id: "winter-top", category: "上装" });
    const output = makeModelOutput();
    output.dailyStyle.outfits[0].wardrobeItemIds = [winterTop.id];
    output.dailyStyle.outfits[0].missingPieces = [];

    expect(validateModelOutput(output, validProfile, [winterTop], WINTER_DATE).success).toBe(false);
    output.dailyStyle.outfits[0].missingPieces = ["一件适合冬季通勤的下装"];
    expect(validateModelOutput(output, validProfile, [winterTop], WINTER_DATE)).toMatchObject({ success: true });
  });

  it("never exposes or accepts wardrobe IDs whose primary or secondary color is avoided", () => {
    const winterTop = item({ id: "winter-top", category: "上装" });
    const avoidedBottom = item({
      id: "red-bottom",
      category: "下装",
      primaryColor: { name: "朱砂", hex: "#B33A2B" },
    });
    const output = makeModelOutput();
    output.dailyStyle.outfits[0].wardrobeItemIds = [winterTop.id, avoidedBottom.id];
    output.dailyStyle.outfits[0].missingPieces = [];

    expect(validateModelOutput(
      output,
      { ...validProfile, avoidColors: ["红色"] },
      [winterTop, avoidedBottom],
      WINTER_DATE,
    ).success).toBe(false);
  });
});
