import {
  DAILY_READING_SCHEMA_VERSION,
  hasCompleteOutfit,
  isAvoidedColor,
  isWardrobeItemEligible,
  seasonForShanghaiDate,
} from "./schemas";
import { ELEMENTS, type BirthChart, type ColorToken, type DailyReadingV4, type UserProfileV3, type WardrobeItemV3 } from "./types";

export const DEMO_MODEL_NAME = "内置演示内容";

interface DemoReadingOptions {
  date: string;
  birthChart: BirthChart;
  profile: UserProfileV3;
  wardrobe: WardrobeItemV3[];
  provider?: string;
  model?: string;
  promptVersion: string;
}

const PALETTE: ColorToken[] = [
  { name: "苔藓绿", hex: "#667A51", note: "作为沉静、自然的视觉重心" },
  { name: "玉白", hex: "#F5F2E8", note: "为整体留出轻盈的呼吸感" },
  { name: "雾蓝", hex: "#91A8B9", note: "用柔和冷调增加层次" },
  { name: "茶褐", hex: "#8A6C4A", note: "小面积加入温润质感" },
  { name: "陶土橙", hex: "#B86F52", note: "以低饱和暖色轻轻提亮" },
  { name: "石墨灰", hex: "#596168", note: "提供清晰而克制的轮廓" },
  { name: "藤紫", hex: "#81748E", note: "带来柔和、有分寸的变化" },
  { name: "沙米色", hex: "#D8C7A8", note: "适合作为温和的日常底色" },
  { name: "松针青", hex: "#3F6655", note: "少量点出清爽的自然气息" },
  { name: "月岩蓝", hex: "#65758B", note: "营造安静而利落的层次" },
  { name: "藕粉", hex: "#CDA8A0", note: "小面积使用更显柔和" },
  { name: "燕麦色", hex: "#CBBFA9", note: "适合衔接深浅不同的单品" },
  { name: "靛青", hex: "#3F536B", note: "为造型加入稳定的深色锚点" },
  { name: "鼠尾草绿", hex: "#9AA58D", note: "让自然色调显得舒展" },
  { name: "烟粉棕", hex: "#A98680", note: "以含蓄暖调丰富细节" },
];

function choosePalette(avoidColors: string[] = []): [ColorToken, ColorToken, ColorToken] {
  const safe = PALETTE.filter((color) => !isAvoidedColor(color, avoidColors));
  const selected = safe.slice(0, 3);
  for (let index = 0; selected.length < 3; index += 1) {
    const hex = `#${(0x52605a + index * 0x1f123).toString(16).slice(-6).padStart(6, "0").toUpperCase()}`;
    const candidate = { name: String.fromCodePoint(0x4e00 + index), hex, note: "以低饱和度保持整体协调" };
    if (!isAvoidedColor(candidate, avoidColors) && !selected.some((color) => color.hex === hex)) selected.push(candidate);
  }
  return selected as [ColorToken, ColorToken, ColorToken];
}

export function demoReading(options: DemoReadingOptions): DailyReadingV4 {
  const [primary, supporting, sparingly] = choosePalette(options.profile.avoidColors);
  const currentSeason = seasonForShanghaiDate(options.date);
  return {
    date: options.date,
    birthChart: options.birthChart,
    profileNarrative: {
      title: "可见五行 · 中性化色彩参考",
      summary: "这里仅按四柱中八个可见干支统计五行出现次数，并把结果转化为审美层面的色彩提示。它只提供透明的文化审美参考，不用于推断个人特征或经历。",
      elementNotes: ELEMENTS.map((element) => {
        const item = options.birthChart.elements.find((entry) => entry.element === element)!;
        return { element, note: `${element}在八个可见字中出现 ${item.count} 次，归为“${item.band}”，可作为调整色彩层次的一个透明参考。` };
      }),
      reflectionQuestions: ["今天更想让穿搭呈现轻盈、稳定，还是鲜明的感觉？"],
    },
    dailyStyle: {
      theme: "自然层次",
      title: "用舒展的配色回应日常节奏",
      energy: "今天可以从清晰的轮廓与低饱和色层开始，再用一处小面积色彩增添变化。选择让自己感到自在的组合即可。",
      primaryColors: [primary],
      supportingColors: [supporting],
      useSparinglyColors: [sparingly],
      outfits: options.profile.scenes.map((scene) => {
        const eligibleItems = options.wardrobe.filter((item) => isWardrobeItemEligible(
          item,
          scene,
          currentSeason,
          options.profile.avoidColors,
        ));
        const dress = eligibleItems.find((item) => item.category === "连衣裙");
        const top = eligibleItems.find((item) => item.category === "上装");
        const bottom = eligibleItems.find((item) => item.category === "下装");
        const completeCombination = hasCompleteOutfit(eligibleItems);
        const candidates = dress ? [dress] : top && bottom ? [top, bottom] : eligibleItems.slice(0, 3);
        const missingPieces = completeCombination
          ? []
          : [
            ...(!top ? [`一件适合${scene}与${currentSeason}季的上装`] : []),
            ...(!bottom ? [`一件适合${scene}与${currentSeason}季的下装`] : []),
          ];
        return {
          scene,
          title: `${currentSeason}季${scene}的自然层次`,
          wardrobeItemIds: candidates.map((item) => item.id),
          missingPieces,
          formula: candidates.length > 0 ? `已选 ${candidates.length} 件场景与季节匹配单品，再用小面积配饰收束` : "低饱和基础上装 + 基础下装 + 一处轻量配饰",
          reason: "以真实衣橱中符合当前场景与季节的启用单品为先，保持配色简洁，方便根据当天活动自由调整。",
          alternative: "可替换为相近明度的基础款，并优先照顾舒适度与场景需要。",
        };
      }),
    },
    source: "demo",
    provider: options.provider ?? "演示模式",
    model: options.model ?? DEMO_MODEL_NAME,
    promptVersion: options.promptVersion,
    schemaVersion: DAILY_READING_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
  };
}
