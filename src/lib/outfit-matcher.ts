import { DailyReading, OutfitSuggestion, WardrobeItem } from "./types";

const normalize = (value: string) => value.toLowerCase().replace(/\s/g, "");

export function findWardrobeMatches(
  wardrobe: WardrobeItem[],
  suggestion: OutfitSuggestion,
  reading: DailyReading,
) {
  const colorWords = [
    ...reading.dailyStyle.luckyColors,
    ...reading.dailyStyle.supportingColors,
  ].map((color) => normalize(color.name));

  const candidates = wardrobe.filter(
    (item) =>
      item.enabled &&
      item.scenes.includes(suggestion.scene) &&
      (colorWords.some((color) => normalize(item.primaryColor).includes(color)) ||
        item.category === "上装" ||
        item.category === "连衣裙"),
  );

  const order = ["上装", "连衣裙", "下装", "外套", "鞋履", "配饰"];
  return candidates.sort((a, b) => order.indexOf(a.category) - order.indexOf(b.category)).slice(0, 3);
}
