import type {
  BirthChart,
  DailyReadingV4,
  Scene,
  UserProfileV3,
  WardrobeItemV3,
} from "@/lib/types";

export const validProfile: UserProfileV3 = {
  birthDate: "1992-02-02",
  birthTime: "12:00",
  scenes: ["通勤"],
  styles: ["自然简约"],
  favoriteColors: ["玉白"],
  avoidColors: ["正红"],
};

export const validWardrobe: WardrobeItemV3[] = [
  {
    id: "white-shirt",
    name: "玉白衬衫",
    category: "上装",
    primaryColor: { name: "玉白", hex: "#F5F2E8" },
    scenes: ["通勤", "休闲"],
    seasons: ["四季"],
    tags: ["简约"],
    enabled: true,
  },
  {
    id: "disabled-coat",
    name: "灰色外套",
    category: "外套",
    primaryColor: { name: "灰色", hex: "#858983" },
    scenes: ["通勤"],
    seasons: ["秋", "冬"],
    tags: [],
    enabled: false,
  },
];

export const validBirthChart: BirthChart = {
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

export function makeModelOutput(scenes: Scene[] = ["通勤"]) {
  return {
    profileNarrative: {
      title: "可见五行的色彩参考",
      summary: "把透明的表层计数转译为色彩和材质比重，仅用于日常审美灵感。",
      reflectionQuestions: ["今天哪一种颜色让你感到舒展？"],
    },
    dailyStyle: {
      theme: "自然留白",
      title: "用安静层次整理日常",
      energy: "从熟悉单品开始，以低饱和色彩和舒适材质形成轻松层次。",
      primaryColors: [{ name: "玉白", hex: "#F5F2E8", note: "作为明净基底。" }],
      supportingColors: [{ name: "苔藓绿", hex: "#667A51", note: "小面积增加自然层次。" }],
      useSparinglyColors: [{ name: "雾蓝", hex: "#91A8B9", note: "若使用，可控制为小面积点色。" }],
      outfits: scenes.map((scene) => ({
        scene,
        title: `${scene}的轻松层次`,
        wardrobeItemIds: scene === "通勤" || scene === "休闲" ? ["white-shirt"] : [],
        missingPieces: scene === "约会" ? ["柔和色下装"] : ["一件适合当季的下装"],
        formula: "已选真实单品之间以明度与中性色层次衔接",
        reason: "优先使用已启用且符合场景的真实单品。",
        alternative: "没有对应单品时，用明度相近的中性色替换。",
      })),
    },
  };
}

export function makeReading(overrides: Partial<DailyReadingV4> = {}): DailyReadingV4 {
  const output = makeModelOutput();
  return {
    date: "2026-07-18",
    birthChart: validBirthChart,
    profileNarrative: {
      ...output.profileNarrative,
      elementNotes: [
        { element: "木", note: "木在八个可见干支中出现 0 次，归为少，仅作为色彩层次参考。" },
        { element: "火", note: "火在八个可见干支中出现 1 次，归为少，仅作为色彩层次参考。" },
        { element: "土", note: "土在八个可见干支中出现 4 次，归为多，仅作为色彩层次参考。" },
        { element: "金", note: "金在八个可见干支中出现 3 次，归为多，仅作为色彩层次参考。" },
        { element: "水", note: "水在八个可见干支中出现 0 次，归为少，仅作为色彩层次参考。" },
      ],
    } as DailyReadingV4["profileNarrative"],
    dailyStyle: output.dailyStyle as DailyReadingV4["dailyStyle"],
    source: "model",
    provider: "Synthetic Provider",
    model: "synthetic-model",
    promptVersion: "style-v3-grounded-bazi-v4",
    schemaVersion: "daily-reading-v4",
    generatedAt: "2026-07-18T00:00:00.000Z",
    ...overrides,
  };
}
