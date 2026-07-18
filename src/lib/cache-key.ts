import { UserProfile, WardrobeItem } from "./types";

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(",")}}`;
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

export function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getDailyCacheKey(profile: UserProfile | null, wardrobe: WardrobeItem[], date = localDateKey()) {
  const normalizedWardrobe = wardrobe.map(({ id, name, category, primaryColor, secondaryColor, scenes, seasons, tags, enabled }) => ({ id, name, category, primaryColor, secondaryColor: secondaryColor ?? "", scenes: [...scenes].sort(), seasons: [...seasons].sort(), tags: [...tags].sort(), enabled })).sort((left, right) => left.id.localeCompare(right.id));
  const fingerprint = shortHash(stableStringify({ profile, wardrobe: normalizedWardrobe }));
  return `wuxing.daily.v3:${date}:${fingerprint}`;
}
