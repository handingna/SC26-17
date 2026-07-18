import type { BirthChart, DailyReadingV4, UserProfileV3, WardrobeItemV3 } from "@/lib/types";
import { localDateKey } from "@/lib/cache-key";

/**
 * A fully synthetic, deterministic walkthrough. None of these values are read
 * from or written to browser storage, and entering the walkthrough never calls
 * an API.
 */
export const QUICK_DEMO_PROFILE: UserProfileV3 = {
  birthDate: "1992-02-02",
  birthTime: "12:00",
  scenes: ["通勤", "休闲"],
  styles: ["自然简约", "经典通勤"],
  favoriteColors: ["玉白", "苔藓绿"],
  avoidColors: ["荧光粉"],
};

/** Official tyme4ts golden case: 1992-02-02 12:00. */
export const QUICK_DEMO_BIRTH_CHART: BirthChart = {
  pillars: {
    year: { stem: "辛", branch: "未", stemElement: "金", branchElement: "土" },
    month: { stem: "辛", branch: "丑", stemElement: "金", branchElement: "土" },
    day: { stem: "戊", branch: "申", stemElement: "土", branchElement: "金" },
    hour: { stem: "戊", branch: "午", stemElement: "土", branchElement: "火" },
  },
  elements: [
    { element: "木", count: 0, band: "少" },
    { element: "火", count: 1, band: "少" },
    { element: "土", count: 4, band: "多" },
    { element: "金", count: 3, band: "多" },
    { element: "水", count: 0, band: "少" },
  ],
  timezone: "Asia/Shanghai",
  lateZiRule: "23:00-next-day",
  algorithmVersion: "visible-elements-v1",
};

export const SAMPLE_WARDROBE: WardrobeItemV3[] = [
  {
    id: "sample-summer-shirt",
    name: "玉白亚麻短袖衬衫",
    category: "上装",
    primaryColor: { name: "玉白", hex: "#F5F2E8" },
    scenes: ["通勤", "休闲", "约会"],
    seasons: ["夏", "四季"],
    tags: ["轻薄", "简约"],
    enabled: true,
  },
  {
    id: "sample-green-trousers",
    name: "苔藓绿轻薄直筒裤",
    category: "下装",
    primaryColor: { name: "苔藓绿", hex: "#667A51" },
    scenes: ["通勤", "休闲"],
    seasons: ["夏", "四季"],
    tags: ["透气", "舒适"],
    enabled: true,
  },
  {
    id: "sample-brown-loafers",
    name: "茶褐轻便乐福鞋",
    category: "鞋履",
    primaryColor: { name: "茶褐", hex: "#8A6C4A" },
    scenes: ["通勤", "休闲", "约会"],
    seasons: ["四季"],
    tags: ["轻便", "基础款"],
    enabled: true,
  },
];

export function createQuickDemoReading(date = localDateKey()): DailyReadingV4 {
  return {
    date,
    birthChart: QUICK_DEMO_BIRTH_CHART,
    profileNarrative: {
      title: "可见五行 · 夏日配色参考",
      summary: "这份合成演示只把八个表层字的透明计数转译为配色层次；所有档案、衣物和结果均为固定示例，不代表任何真实人物。",
      elementNotes: [
        { element: "木", note: "以低饱和绿色作为清爽点缀，不必刻意增加面积。" },
        { element: "火", note: "暖色只做微小提亮，让夏日造型保持轻盈。" },
        { element: "土", note: "米白与茶褐承担稳定基底，连接上下装层次。" },
        { element: "金", note: "明净轮廓与利落线条带来通勤秩序感。" },
        { element: "水", note: "雾蓝用于辅助色，为整体留出柔和呼吸感。" },
      ],
      reflectionQuestions: ["今天更想让穿搭显得清爽，还是更松弛？"],
    },
    dailyStyle: {
      theme: "夏日留白",
      title: "玉白与苔藓绿，穿出轻盈秩序",
      energy: "以透气玉白上装建立明净基底，用苔藓绿或雾蓝下装降低视觉温度，再以茶褐鞋履轻轻收束。",
      primaryColors: [
        { name: "玉白", hex: "#F5F2E8", note: "作为夏日上装和大面积留白的明净基底。" },
        { name: "苔藓绿", hex: "#667A51", note: "低饱和自然色，适合作为下装视觉重心。" },
      ],
      supportingColors: [
        { name: "雾蓝", hex: "#91A8B9", note: "在休闲场景中增加柔和、清凉的层次。" },
      ],
      useSparinglyColors: [
        { name: "茶褐", hex: "#8A6C4A", note: "缩小到鞋履或配饰面积，让整体更有边界。" },
      ],
      outfits: [
        {
          scene: "通勤",
          title: "清爽而有秩序",
          wardrobeItemIds: ["sample-summer-shirt", "sample-green-trousers", "sample-brown-loafers"],
          missingPieces: [],
          formula: "玉白短袖衬衫 + 苔藓绿直筒裤 + 茶褐乐福鞋",
          reason: "三件单品都适用于夏季通勤，以明暗适中的自然色保持清楚轮廓。",
          alternative: "把裤脚轻微挽起，或减少配饰，让整体更轻便。",
        },
        {
          scene: "休闲",
          title: "柔和的清凉层次",
          wardrobeItemIds: ["sample-summer-shirt", "sample-green-trousers", "sample-brown-loafers"],
          missingPieces: [],
          formula: "玉白短袖衬衫 + 苔藓绿直筒裤 + 茶褐乐福鞋",
          reason: "轻薄上装与夏季直筒裤保持舒适余量，适合放松的日常活动。",
          alternative: "需要更随性时，可将衬衫下摆自然放松，并减少结构感配饰。",
        },
      ],
    },
    source: "demo",
    provider: "内存合成演示",
    model: "fixed-demo",
    promptVersion: "style-v3-grounded-bazi-v4",
    schemaVersion: "daily-reading-v4",
    generatedAt: new Date().toISOString(),
  };
}
