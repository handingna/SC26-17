import type { Page } from "@playwright/test";

export const chart = {
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
} as const;

export const profile = {
  birthDate: "1992-02-02",
  birthTime: "12:00",
  scenes: ["通勤"],
  styles: ["自然简约"],
  favoriteColors: ["玉白"],
  avoidColors: ["正红"],
};

export const wardrobe = [{
  id: "e2e-white-shirt",
  name: "合成玉白衬衫",
  category: "上装",
  primaryColor: { name: "玉白", hex: "#F5F2E8" },
  scenes: ["通勤"],
  seasons: ["四季"],
  tags: ["合成测试"],
  enabled: true,
}];

const dateParts = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Shanghai",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).formatToParts(new Date());
const datePart = (type: Intl.DateTimeFormatPartTypes) => dateParts.find((part) => part.type === type)?.value;
export const currentShanghaiDate = `${datePart("year")}-${datePart("month")}-${datePart("day")}`;

export const modelReading = {
  date: currentShanghaiDate,
  birthChart: chart,
  profileNarrative: {
    title: "合成档案的色彩参考",
    summary: "把透明的表层计数转译为色彩和材质比重，仅用于合成端到端验收。",
    elementNotes: [
      { element: "木", note: "木的计数可启发自然色与舒展线条。" },
      { element: "火", note: "火的计数可启发少量温暖点色。" },
      { element: "土", note: "土的计数可启发安静的中性色基底。" },
      { element: "金", note: "金的计数可启发清晰轮廓与留白。" },
      { element: "水", note: "水的计数可启发柔和冷色层次。" },
    ],
    reflectionQuestions: ["今天哪一种颜色让你感到舒展？"],
  },
  dailyStyle: {
    theme: "自然留白",
    title: "合成模型结果已返回",
    energy: "从熟悉单品开始，以低饱和色彩完成轻松层次。",
    primaryColors: [{ name: "玉白", hex: "#F5F2E8", note: "作为明净基底。" }],
    supportingColors: [{ name: "苔藓绿", hex: "#667A51", note: "增加自然层次。" }],
    useSparinglyColors: [{ name: "雾蓝", hex: "#91A8B9", note: "控制为小面积点色。" }],
    outfits: [{
      scene: "通勤",
      title: "合成通勤组合",
      wardrobeItemIds: ["e2e-white-shirt"],
      missingPieces: ["一件适合当季的下装"],
      formula: "玉白上装 + 低饱和下装",
      reason: "优先使用已启用且符合场景与季节的合成衣物。",
      alternative: "用衣橱中的相近中性色替换。",
    }],
  },
  source: "model",
  provider: "Synthetic Provider",
  model: "synthetic-model",
  promptVersion: "style-v3-grounded-bazi-v4",
  schemaVersion: "daily-reading-v4",
  generatedAt: new Date().toISOString(),
} as const;

export async function mockBaseApis(page: Page, configured = false) {
  await page.route("**/api/model-status", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        state: configured ? "ready" : "unconfigured",
        configured,
        provider: configured ? "Synthetic Provider" : "未配置",
        model: configured ? "synthetic-model" : "未配置",
        promptVersion: "style-v3-grounded-bazi-v4",
        schemaVersion: "daily-reading-v4",
      }),
    });
  });
  await page.route("**/api/birth-chart", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(chart) });
  });
}

export async function seedPersonalData(page: Page) {
  await page.addInitScript(({ storedProfile, storedWardrobe }) => {
    localStorage.setItem("wuxing.profile.v3", JSON.stringify(storedProfile));
    localStorage.setItem("wuxing.wardrobe.v3", JSON.stringify(storedWardrobe));
  }, { storedProfile: profile, storedWardrobe: wardrobe });
}

export async function browserStorageSnapshot(page: Page) {
  return page.evaluate(() => ({
    local: Object.fromEntries(Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index))
      .filter((key): key is string => key !== null)
      .sort((left, right) => left.localeCompare(right))
      .map((key) => [key, localStorage.getItem(key)])),
    session: Object.fromEntries(Array.from({ length: sessionStorage.length }, (_, index) => sessionStorage.key(index))
      .filter((key): key is string => key !== null)
      .sort((left, right) => left.localeCompare(right))
      .map((key) => [key, sessionStorage.getItem(key)])),
  }));
}
