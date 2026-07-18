import { describe, expect, it } from "vitest";
import {
  DAILY_CACHE_PREFIX,
  getDailyCacheKey,
  getRequestFingerprint,
  localDateKey,
} from "@/lib/cache-key";
import { validProfile, validWardrobe } from "./fixtures/factories";

const context = {
  provider: "ECNU",
  model: "ecnu-max",
  source: "model" as const,
  algorithmVersion: "visible-elements-v1",
  promptVersion: "style-v3-grounded-bazi-v4",
  schemaVersion: "daily-reading-v4",
};

describe("daily.v4 cache key", () => {
  it("uses the Asia/Shanghai calendar date around UTC midnight", () => {
    expect(localDateKey(new Date("2026-07-17T16:00:00.000Z"))).toBe("2026-07-18");
    expect(localDateKey(new Date("2026-07-18T15:59:59.999Z"))).toBe("2026-07-18");
  });

  it("includes the explicit China date and v4 prefix", () => {
    expect(getDailyCacheKey(validProfile, validWardrobe, context, "2026-07-18"))
      .toMatch(new RegExp(`^${DAILY_CACHE_PREFIX.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}2026-07-18:`));
  });

  it.each([
    ["provider", { ...context, provider: "Other" }],
    ["model", { ...context, model: "other-model" }],
    ["algorithm", { ...context, algorithmVersion: "visible-elements-v2" }],
    ["prompt", { ...context, promptVersion: "style-v4" }],
    ["schema", { ...context, schemaVersion: "daily-reading-v5" }],
    ["source", { ...context, source: "demo" as const }],
  ])("changes when %s changes", (_label, changed) => {
    expect(getDailyCacheKey(validProfile, validWardrobe, context, "2026-07-18"))
      .not.toBe(getDailyCacheKey(validProfile, validWardrobe, changed, "2026-07-18"));
  });

  it("changes with profile and wardrobe input", () => {
    const profileChanged = { ...validProfile, birthTime: "23:00" };
    const wardrobeChanged = validWardrobe.map((item) => item.id === "white-shirt"
      ? { ...item, enabled: false }
      : item);
    const base = getDailyCacheKey(validProfile, validWardrobe, context, "2026-07-18");
    expect(getDailyCacheKey(profileChanged, validWardrobe, context, "2026-07-18")).not.toBe(base);
    expect(getDailyCacheKey(validProfile, wardrobeChanged, context, "2026-07-18")).not.toBe(base);
    expect(getRequestFingerprint(profileChanged, validWardrobe)).not.toBe(getRequestFingerprint(validProfile, validWardrobe));
  });

  it("is stable when wardrobe ordering and unordered tags/scenes change", () => {
    const reordered = [...validWardrobe].reverse().map((item) => ({
      ...item,
      scenes: [...item.scenes].reverse(),
      seasons: [...item.seasons].reverse(),
      tags: [...item.tags].reverse(),
    }));
    expect(getDailyCacheKey(validProfile, reordered, context, "2026-07-18"))
      .toBe(getDailyCacheKey(validProfile, validWardrobe, context, "2026-07-18"));
  });
});
