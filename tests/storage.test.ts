import { beforeEach, describe, expect, it, vi } from "vitest";
import { DAILY_CACHE_PREFIX } from "@/lib/cache-key";
import { isReadingCompatible, pruneDailyReadings, storage } from "@/lib/storage";
import { makeReading, validProfile, validWardrobe } from "./fixtures/factories";

describe("versioned browser storage", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it("distinguishes an uninitialized wardrobe from an explicit empty wardrobe", () => {
    expect(storage.wardrobe()).toBeNull();
    expect(storage.clearWardrobe()).toBe(true);
    expect(storage.wardrobe()).toEqual([]);
    expect(window.localStorage.getItem("wuxing.wardrobe.v3")).toBe("[]");
  });

  it("does not resurrect sample items after clearing", () => {
    expect(storage.setWardrobe(validWardrobe)).toBe(true);
    expect(storage.clearWardrobe()).toBe(true);
    expect(storage.wardrobe()).toEqual([]);
  });

  it("migrates useful legacy profile fields, preserves missing time, and drops obsolete fields", () => {
    window.localStorage.setItem("wuxing.profile.v2", JSON.stringify({
      birthDate: "1992-02-02",
      birthTime: "",
      scenes: ["通勤"],
      styles: ["自然简约"],
      favoriteColors: ["玉白"],
      avoidColors: [],
      lunarBirthDate: "旧农历文本",
      bazi: "旧手填八字",
      gender: "不再收集",
      birthPlace: "不再收集",
      reflectionAnswers: ["不再保留"],
    }));

    expect(storage.profile()).toEqual({ ...validProfile, birthTime: "", avoidColors: [] });
    const migrated = JSON.parse(window.localStorage.getItem("wuxing.profile.v3") ?? "null") as Record<string, unknown>;
    expect(migrated).not.toHaveProperty("lunarBirthDate");
    expect(migrated).not.toHaveProperty("bazi");
    expect(migrated).not.toHaveProperty("gender");
    expect(migrated.birthTime).toBe("");
  });

  it("migrates legacy wardrobe colors to name-plus-HEX and keeps an explicit enabled flag", () => {
    window.localStorage.setItem("wuxing.wardrobe.v2", JSON.stringify([{
      id: "legacy-shirt",
      name: "旧版玉白衬衫",
      category: "上装",
      primaryColor: "玉白",
      scenes: ["通勤"],
      seasons: ["四季"],
      tags: [],
      enabled: true,
    }]));
    expect(storage.wardrobe()).toEqual([expect.objectContaining({
      id: "legacy-shirt",
      primaryColor: { name: "玉白", hex: "#F5F2E8" },
      enabled: true,
    })]);
  });

  it("discards v3 inspiration caches during initialization", () => {
    window.localStorage.setItem("wuxing.daily.v3:old", JSON.stringify({ anything: true }));
    window.localStorage.setItem("wuxing.reading.v2", JSON.stringify({ anything: true }));
    storage.initialize();
    expect(window.localStorage.getItem("wuxing.daily.v3:old")).toBeNull();
    expect(window.localStorage.getItem("wuxing.reading.v2")).toBeNull();
  });

  it("treats damaged JSON and schema-invalid records as absent", () => {
    window.localStorage.setItem("wuxing.profile.v3", "{broken");
    window.localStorage.setItem("wuxing.wardrobe.v3", JSON.stringify([{ id: "missing-fields" }]));
    expect(storage.profile()).toBeNull();
    expect(storage.wardrobe()).toBeNull();
  });

  it("does not retain a legacy date that matches the pattern but is not a real calendar day", () => {
    window.localStorage.setItem("wuxing.profile.v2", JSON.stringify({
      ...validProfile,
      birthDate: "1992-02-30",
    }));
    expect(storage.profile()).toBeNull();
    expect(window.localStorage.getItem("wuxing.profile.v3")).toBeNull();
  });

  it("reports write failures instead of claiming persistence", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("quota", "QuotaExceededError");
    });
    expect(storage.setProfile(validProfile)).toBe(false);
    expect(storage.lastError()).toMatch(/保存失败|存储/);
  });

  it("caches only schema-valid model readings and counts actual v4 model entries", () => {
    const modelKey = `${DAILY_CACHE_PREFIX}2026-07-18:model`;
    const otherKey = `${DAILY_CACHE_PREFIX}2026-07-18:other`;
    const reading = makeReading();
    expect(storage.setDailyReading(modelKey, reading)).toBe(true);
    expect(storage.dailyReading(modelKey, "2026-07-18")).toEqual(reading);
    expect(storage.setDailyReading(otherKey, makeReading({ source: "demo" }))).toBe(false);
    expect(storage.dailyReadingCount()).toBe(1);
  });

  it("rejects a cache key whose embedded Shanghai date differs from the reading", () => {
    const reading = makeReading({ date: "2026-07-18" });
    expect(storage.setDailyReading(`${DAILY_CACHE_PREFIX}2026-07-19:mismatch`, reading)).toBe(false);
    expect(storage.dailyReadingCount()).toBe(0);
  });

  it("does not return a structurally valid reading after the expected Shanghai date crosses midnight", () => {
    const key = `${DAILY_CACHE_PREFIX}2026-07-18:model`;
    const reading = makeReading({ date: "2026-07-18" });
    expect(storage.setDailyReading(key, reading)).toBe(true);
    expect(storage.dailyReading(key, "2026-07-18")).toEqual(reading);
    expect(storage.dailyReading(key, "2026-07-19")).toBeNull();
    expect(isReadingCompatible(reading, validProfile, validWardrobe, "2026-07-19")).toBe(false);
  });

  it("prunes invalid, older-than-30-day, and overflow cache entries deterministically", () => {
    const now = new Date("2026-07-18T04:00:00.000Z");
    for (let offset = 0; offset < 32; offset += 1) {
      const instant = new Date(now.getTime() - offset * 86_400_000);
      const date = instant.toISOString().slice(0, 10);
      window.localStorage.setItem(
        `${DAILY_CACHE_PREFIX}${date}:entry-${offset}`,
        JSON.stringify(makeReading({ date, generatedAt: instant.toISOString() })),
      );
    }
    const invalidKey = `${DAILY_CACHE_PREFIX}2026-07-18:invalid`;
    window.localStorage.setItem(invalidKey, JSON.stringify({ source: "model", malformed: true }));

    pruneDailyReadings(now.getTime());

    expect(window.localStorage.getItem(invalidKey)).toBeNull();
    expect(window.localStorage.getItem(`${DAILY_CACHE_PREFIX}2026-06-17:entry-31`)).toBeNull();
    expect(storage.dailyReadingCount()).toBeLessThanOrEqual(30);
  });

  it("removes invalid cache data on read", () => {
    const key = `${DAILY_CACHE_PREFIX}2026-07-18:broken`;
    window.localStorage.setItem(key, JSON.stringify({ source: "model", malformed: true }));
    expect(storage.dailyReading(key)).toBeNull();
    expect(window.localStorage.getItem(key)).toBeNull();
  });

  it("clearAll removes profile, wardrobe, privacy and all daily caches", () => {
    storage.setProfile(validProfile);
    storage.setWardrobe(validWardrobe);
    storage.acceptPrivacy();
    storage.setDailyReading(`${DAILY_CACHE_PREFIX}2026-07-18:model`, makeReading());
    storage.clearAll();
    expect(storage.profile()).toBeNull();
    expect(storage.wardrobe()).toBeNull();
    expect(storage.privacyAccepted()).toBe(false);
    expect(storage.dailyReadingCount()).toBe(0);
  });
});
