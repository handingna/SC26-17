import type { UserProfileV3, WardrobeItemV3 } from "./types";

export const DAILY_CACHE_PREFIX = "wuxing.daily.v4:";
export const DEFAULT_ALGORITHM_VERSION = "visible-elements-v1";
export const DEFAULT_PROMPT_VERSION = "style-v3-grounded-bazi-v4";
export const DEFAULT_SCHEMA_VERSION = "daily-reading-v4";

export interface DailyCacheContext {
  provider: string;
  model: string;
  source: "model" | "demo";
  promptVersion?: string;
  schemaVersion?: string;
  algorithmVersion?: string;
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const entries = Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value);
}

function shortHash(input: string) {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

/** Returns the calendar date in China Standard Time, independent of host timezone. */
export function localDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function normalizedWardrobe(wardrobe: WardrobeItemV3[]) {
  return wardrobe
    .map((item) => ({
      id: item.id,
      name: item.name,
      category: item.category,
      primaryColor: item.primaryColor,
      secondaryColor: item.secondaryColor ?? null,
      scenes: [...item.scenes].sort(),
      seasons: [...item.seasons].sort(),
      tags: [...item.tags].sort(),
      enabled: item.enabled,
    }))
    .sort((left, right) => left.id.localeCompare(right.id));
}

export function getRequestFingerprint(
  profile: UserProfileV3 | null,
  wardrobe: WardrobeItemV3[] | null,
) {
  return shortHash(stableStringify({ profile, wardrobe: normalizedWardrobe(wardrobe ?? []) }));
}

export function getDailyCacheKey(
  profile: UserProfileV3 | null,
  wardrobe: WardrobeItemV3[] | null,
  context: DailyCacheContext,
  date = localDateKey(),
) {
  const fingerprint = shortHash(
    stableStringify({
      profile,
      wardrobe: normalizedWardrobe(wardrobe ?? []),
      algorithmVersion: context.algorithmVersion ?? DEFAULT_ALGORITHM_VERSION,
      promptVersion: context.promptVersion ?? DEFAULT_PROMPT_VERSION,
      schemaVersion: context.schemaVersion ?? DEFAULT_SCHEMA_VERSION,
      provider: context.provider,
      model: context.model,
      source: context.source,
    }),
  );
  return `${DAILY_CACHE_PREFIX}${date}:${fingerprint}`;
}
