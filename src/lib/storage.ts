import { z } from "zod";
import type { DailyReadingV5, UserProfileV3, WardrobeItemV3 } from "./types";
import { DAILY_CACHE_PREFIX, localDateKey } from "./cache-key";
import {
  birthChartSchema,
  birthTimeSchema,
  dailyReadingV5Schema,
  validateDailyReadingSemantics,
  userProfileV3Schema,
  wardrobeItemV3Schema,
  wardrobeV3Schema,
} from "./schemas";

const NEW_KEYS = {
  profile: "wuxing.profile.v3",
  wardrobe: "wuxing.wardrobe.v3",
  privacy: "wuxing.privacy.v2",
} as const;

const LEGACY_KEYS = {
  profile: "wuxing.profile.v2",
  wardrobe: "wuxing.wardrobe.v2",
  reading: "wuxing.reading.v2",
  privacy: "wuxing.privacy.v1",
} as const;

const LEGACY_DAILY_PREFIX = "wuxing.daily.v3:";
const MAX_DAILY_CACHE_ENTRIES = 30;
const MAX_DAILY_CACHE_AGE_MS = 30 * 24 * 60 * 60 * 1_000;
// Missing birth time is the only storage-only state retained for v2 migration.
export const userProfileStorageSchema = userProfileV3Schema.safeExtend({
  birthTime: z.union([z.literal(""), birthTimeSchema]),
});
export const wardrobeItemStorageSchema = wardrobeItemV3Schema;
export const wardrobeStorageSchema = wardrobeV3Schema;
export const birthChartStorageSchema = birthChartSchema;
export const dailyReadingStorageSchema = dailyReadingV5Schema;

let storageError: string | null = null;

function storageAvailable() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function raw(key: string) {
  if (!storageAvailable()) return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    storageError = "浏览器阻止了本地数据读取；本次修改可能无法保留。";
    return null;
  }
}

function parsed(key: string): unknown {
  const value = raw(key);
  if (value === null) return null;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown) {
  if (!storageAvailable()) return false;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    storageError = null;
    return true;
  } catch {
    storageError = "本地保存失败。请检查浏览器存储权限或剩余空间。";
    return false;
  }
}

function remove(key: string) {
  if (!storageAvailable()) return false;
  try {
    window.localStorage.removeItem(key);
    return true;
  } catch {
    storageError = "本地数据清理失败，请检查浏览器存储权限。";
    return false;
  }
}

function colorHex(name: string) {
  const colors: Record<string, string> = {
    玉白: "#F5F2E8", 苔藓绿: "#667A51", 雾蓝: "#91A8B9", 茶褐: "#8A6C4A",
    黑色: "#242724", 白色: "#F7F7F3", 米色: "#D9CDB8", 灰色: "#858983",
    蓝色: "#55778C", 绿色: "#667A51", 红色: "#A34A3E", 棕色: "#795B45",
  };
  return colors[name] ?? "#8A8F87";
}

function uniqueTextValues(value: unknown, maximum: number, itemMaximum: number) {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.flatMap((item) => {
    if (typeof item !== "string") return [];
    const text = item.trim();
    const key = text.toLocaleLowerCase("zh-CN");
    if (!text || text.length > itemMaximum || seen.has(key)) return [];
    seen.add(key);
    return [text];
  }).slice(0, maximum);
}

function migrateProfile(): UserProfileV3 | null {
  const legacy = parsed(LEGACY_KEYS.profile);
  if (!legacy || typeof legacy !== "object") return null;
  const value = legacy as Record<string, unknown>;
  const scenes = uniqueTextValues(value.scenes, 3, 2).filter((item): item is "通勤" | "休闲" | "约会" =>
    item === "通勤" || item === "休闲" || item === "约会"
  );
  const styles = uniqueTextValues(value.styles, 6, 30);
  const favoriteColors = uniqueTextValues(value.favoriteColors, 12, 30);
  const favorites = new Set(favoriteColors.map((color) => color.toLocaleLowerCase("zh-CN")));
  const candidate = {
    birthDate: typeof value.birthDate === "string" ? value.birthDate : "",
    birthTime: typeof value.birthTime === "string" && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value.birthTime) ? value.birthTime : "",
    scenes: scenes.length ? scenes : ["通勤" as const],
    styles: styles.length ? styles : ["自然简约"],
    favoriteColors,
    avoidColors: uniqueTextValues(value.avoidColors, 12, 30).filter((color) => !favorites.has(color.toLocaleLowerCase("zh-CN"))),
  };
  const result = userProfileStorageSchema.safeParse(candidate);
  if (!result.success) return null;
  write(NEW_KEYS.profile, result.data);
  return result.data as UserProfileV3;
}

function migrateWardrobe(): WardrobeItemV3[] | null {
  const legacy = parsed(LEGACY_KEYS.wardrobe);
  if (!Array.isArray(legacy)) return null;
  const candidates = legacy.flatMap((entry) => {
    const value = entry && typeof entry === "object" ? entry as Record<string, unknown> : {};
    const primaryName = typeof value.primaryColor === "string" ? value.primaryColor : "中性灰";
    const secondaryName = typeof value.secondaryColor === "string" ? value.secondaryColor : null;
    const candidate = {
      id: value.id,
      name: value.name,
      category: value.category,
      primaryColor: { name: primaryName, hex: colorHex(primaryName) },
      ...(secondaryName ? { secondaryColor: { name: secondaryName, hex: colorHex(secondaryName) } } : {}),
      scenes: value.scenes,
      seasons: uniqueTextValues(value.seasons, 5, 2).filter((season) => season === "春" || season === "夏" || season === "秋" || season === "冬" || season === "四季"),
      tags: uniqueTextValues(value.tags, 8, 30),
      enabled: typeof value.enabled === "boolean" ? value.enabled : true,
    };
    if (!candidate.seasons.length) candidate.seasons = ["四季"];
    const result = wardrobeItemStorageSchema.safeParse(candidate);
    return result.success ? [result.data as WardrobeItemV3] : [];
  });
  const seen = new Set<string>();
  const candidate = candidates.filter((item) => !seen.has(item.id) && Boolean(seen.add(item.id))).slice(0, 60);
  const result = wardrobeStorageSchema.safeParse(candidate);
  if (!result.success) return null;
  write(NEW_KEYS.wardrobe, result.data);
  return result.data as WardrobeItemV3[];
}

function clearLegacyReadings() {
  if (!storageAvailable()) return;
  try {
    for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
      const key = window.localStorage.key(index);
      if (key?.startsWith(LEGACY_DAILY_PREFIX)) window.localStorage.removeItem(key);
    }
    window.localStorage.removeItem(LEGACY_KEYS.reading);
  } catch {
    storageError = "旧版灵感缓存未能清理，但不会被当前版本读取。";
  }
}

function clearDailyReadings() {
  if (!storageAvailable()) return;
  try {
    for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
      const key = window.localStorage.key(index);
      if (key?.startsWith(DAILY_CACHE_PREFIX)) window.localStorage.removeItem(key);
    }
  } catch {
    storageError = "灵感缓存清理失败，请检查浏览器存储权限。";
  }
}

function cacheDateFromKey(key: string) {
  const value = key.slice(DAILY_CACHE_PREFIX.length, DAILY_CACHE_PREFIX.length + 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

export function pruneDailyReadings(now = Date.now()) {
  if (!storageAvailable()) return;
  const valid: Array<{ key: string; generatedAt: number }> = [];
  const cutoff = now - MAX_DAILY_CACHE_AGE_MS;
  try {
    for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
      const key = window.localStorage.key(index);
      if (!key?.startsWith(DAILY_CACHE_PREFIX)) continue;
      const result = dailyReadingStorageSchema.safeParse(parsed(key));
      const generatedAt = result.success ? Date.parse(result.data.generatedAt) : Number.NaN;
      const keyDate = cacheDateFromKey(key);
      if (
        !result.success
        || result.data.source !== "model"
        || !keyDate
        || result.data.date !== keyDate
        || !Number.isFinite(generatedAt)
        || generatedAt < cutoff
      ) {
        window.localStorage.removeItem(key);
        continue;
      }
      valid.push({ key, generatedAt });
    }
    valid.sort((left, right) => right.generatedAt - left.generatedAt);
    valid.slice(MAX_DAILY_CACHE_ENTRIES).forEach(({ key }) => window.localStorage.removeItem(key));
  } catch {
    storageError = "旧的灵感缓存未能自动整理，但不会影响当前生成。";
  }
}

function dailyReadingCount() {
  if (!storageAvailable()) return 0;
  pruneDailyReadings();
  let count = 0;
  try {
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (key?.startsWith(DAILY_CACHE_PREFIX)) {
        const result = dailyReadingStorageSchema.safeParse(parsed(key));
        if (result.success && result.data.source === "model") count += 1;
      }
    }
  } catch {
    storageError = "无法统计本地灵感缓存。";
  }
  return count;
}

export function isReadingCompatible(
  reading: DailyReadingV5,
  profile: UserProfileV3,
  wardrobe: WardrobeItemV3[],
  expectedDate = localDateKey(),
) {
  return validateDailyReadingSemantics(reading, profile, wardrobe, expectedDate).success;
}

export const storage = {
  initialize: () => {
    clearLegacyReadings();
    remove(LEGACY_KEYS.privacy);
    pruneDailyReadings();
  },
  profile: (): UserProfileV3 | null => {
    const result = userProfileStorageSchema.safeParse(parsed(NEW_KEYS.profile));
    return result.success ? result.data as UserProfileV3 : migrateProfile();
  },
  setProfile: (value: UserProfileV3) => {
    const result = userProfileStorageSchema.safeParse(value);
    return result.success ? write(NEW_KEYS.profile, result.data) : false;
  },
  clearProfile: () => remove(NEW_KEYS.profile),
  wardrobe: (): WardrobeItemV3[] | null => {
    const value = raw(NEW_KEYS.wardrobe);
    if (value === null) return migrateWardrobe();
    const result = wardrobeStorageSchema.safeParse(parsed(NEW_KEYS.wardrobe));
    return result.success ? result.data as WardrobeItemV3[] : null;
  },
  setWardrobe: (value: WardrobeItemV3[]) => {
    const result = wardrobeStorageSchema.safeParse(value);
    return result.success ? write(NEW_KEYS.wardrobe, result.data) : false;
  },
  // An explicit empty wardrobe is different from never initialized.
  clearWardrobe: () => write(NEW_KEYS.wardrobe, []),
  dailyReading: (cacheKey: string, expectedDate = localDateKey()): DailyReadingV5 | null => {
    if (!cacheKey.startsWith(DAILY_CACHE_PREFIX)) return null;
    const result = dailyReadingStorageSchema.safeParse(parsed(cacheKey));
    const keyDate = cacheDateFromKey(cacheKey);
    if (!result.success || result.data.source !== "model" || !keyDate || result.data.date !== keyDate || result.data.date !== expectedDate) {
      if (raw(cacheKey) !== null) remove(cacheKey);
      return null;
    }
    return result.data as DailyReadingV5;
  },
  setDailyReading: (cacheKey: string, value: DailyReadingV5) => {
    if (!cacheKey.startsWith(DAILY_CACHE_PREFIX) || value.source !== "model") return false;
    const result = dailyReadingStorageSchema.safeParse(value);
    if (!result.success || cacheDateFromKey(cacheKey) !== result.data.date) return false;
    const saved = write(cacheKey, result.data);
    if (saved) pruneDailyReadings();
    return saved;
  },
  clearDailyReadings,
  dailyReadingCount,
  privacyAccepted: () => raw(NEW_KEYS.privacy) === "accepted",
  acceptPrivacy: () => {
    if (!storageAvailable()) return false;
    try {
      window.localStorage.setItem(NEW_KEYS.privacy, "accepted");
      return true;
    } catch {
      storageError = "无法记住隐私确认；下次生成时会再次询问。";
      return false;
    }
  },
  lastError: () => storageError,
  clearAll: () => {
    storageError = null;
    remove(NEW_KEYS.profile);
    remove(NEW_KEYS.wardrobe);
    remove(NEW_KEYS.privacy);
    remove(LEGACY_KEYS.privacy);
    remove(LEGACY_KEYS.profile);
    remove(LEGACY_KEYS.wardrobe);
    clearLegacyReadings();
    clearDailyReadings();
  },
};
