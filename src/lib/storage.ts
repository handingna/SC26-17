import { DailyReading, UserProfile, WardrobeItem } from "./types";

const KEYS = { profile: "wuxing.profile.v2", wardrobe: "wuxing.wardrobe.v2", legacyReading: "wuxing.reading.v2" };
const DAILY_PREFIX = "wuxing.daily.v3:";
function read<T>(key: string, fallback: T): T { if (typeof window === "undefined") return fallback; try { const value = window.localStorage.getItem(key); return value ? JSON.parse(value) as T : fallback; } catch { return fallback; } }
function write<T>(key: string, value: T) { if (typeof window !== "undefined") window.localStorage.setItem(key, JSON.stringify(value)); }
function clear(key: string) { if (typeof window !== "undefined") window.localStorage.removeItem(key); }
function clearDailyReadings() { if (typeof window === "undefined") return; Object.keys(window.localStorage).filter((key) => key.startsWith(DAILY_PREFIX)).forEach(clear); clear(KEYS.legacyReading); }

export const storage = {
  profile: () => read<UserProfile | null>(KEYS.profile, null), setProfile: (value: UserProfile) => write(KEYS.profile, value), clearProfile: () => clear(KEYS.profile),
  wardrobe: () => read<WardrobeItem[]>(KEYS.wardrobe, []), setWardrobe: (value: WardrobeItem[]) => write(KEYS.wardrobe, value), clearWardrobe: () => clear(KEYS.wardrobe),
  dailyReading: (cacheKey: string) => read<DailyReading | null>(cacheKey, null), setDailyReading: (cacheKey: string, value: DailyReading) => write(cacheKey, value), clearDailyReadings,
  clearAll: () => { clear(KEYS.profile); clear(KEYS.wardrobe); clearDailyReadings(); },
};
