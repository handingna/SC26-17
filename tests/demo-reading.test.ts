import { describe, expect, it } from "vitest";
import { demoReading } from "@/lib/demo-reading";
import { validateDailyReadingSemantics } from "@/lib/schemas";
import { validBirthChart, validProfile, validWardrobe } from "./fixtures/factories";

describe("demo reading semantic parity", () => {
  it("filters avoided-color wardrobe IDs and remains valid under final envelope semantics", () => {
    const avoidedBottom = {
      ...validWardrobe[0],
      id: "red-bottom",
      name: "通勤下装",
      category: "下装" as const,
      primaryColor: { name: "朱砂", hex: "#B33A2B" },
      tags: [],
    };
    const profile = { ...validProfile, avoidColors: ["红色"] };
    const wardrobe = [validWardrobe[0], avoidedBottom];
    const reading = demoReading({
      date: "2026-07-18",
      birthChart: validBirthChart,
      profile,
      wardrobe,
      promptVersion: "style-v3-grounded-bazi-v4",
    });

    expect(reading.dailyStyle.outfits[0].wardrobeItemIds).not.toContain("red-bottom");
    expect(reading.dailyStyle.outfits[0].missingPieces.length).toBeGreaterThan(0);
    expect(validateDailyReadingSemantics(reading, profile, wardrobe, reading.date)).toMatchObject({ success: true });
  });
});
