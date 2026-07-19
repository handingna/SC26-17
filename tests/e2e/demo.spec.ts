import { expect, test } from "@playwright/test";

const chart = {
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

test.beforeEach(async ({ page }) => {
  await page.route("**/api/model-status", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        state: "unconfigured",
        configured: false,
        provider: "未配置",
        model: "未配置",
        promptVersion: "style-v3-grounded-bazi-v5",
        schemaVersion: "daily-reading-v5",
      }),
    });
  });
  await page.route("**/api/birth-chart", async (route) => {
    const request = route.request();
    expect(request.method()).toBe("POST");
    expect(request.postDataJSON()).toEqual({ birthDate: "1992-02-02", birthTime: "12:00" });
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(chart) });
  });
});

test("complete demo journey keeps samples opt-in and demo output out of model cache", async ({ page }) => {
  const browserErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });
  page.on("pageerror", (error) => browserErrors.push(error.stack ?? error.message));
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");

  await page.getByRole("link", { name: "个人档案" }).click();
  await page.getByLabel(/公历出生日期/).fill("1992-02-02");
  await page.getByLabel(/出生时间/).fill("12:00");
  await page.getByRole("button", { name: "保存并计算四柱" }).click();
  await expect(page.getByText("辛未")).toBeVisible();
  await expect(page.getByText(/档案已保存/)).toBeVisible();

  await page.getByRole("link", { name: "我的衣橱" }).click();
  await expect(page.getByText("从示例或自己的单品开始")).toBeVisible();
  await expect(page.getByText("玉白亚麻短袖衬衫")).toHaveCount(0);
  await page.getByRole("button", { name: "使用 3 件示例单品" }).click();
  await expect(page.getByText("玉白亚麻短袖衬衫", { exact: true })).toBeVisible();
  expect(browserErrors).toEqual([]);

  await page.getByRole("button", { name: "生成今日灵感" }).click();
  await page.getByRole("button", { name: /查看演示内容/ }).click();
  await expect(page.getByText("演示内容", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "今日色彩方向" })).toBeVisible();
  await expect(page.getByText("玉白亚麻短袖衬衫", { exact: true })).toBeVisible();

  const cachedModelReadings = await page.evaluate(() => Object.keys(localStorage)
    .filter((key) => key.startsWith("wuxing.daily.v4:")));
  expect(cachedModelReadings).toEqual([]);

  await page.reload();
  await expect(page.getByRole("button", { name: /查看演示内容/ })).toBeVisible();
  await expect(page.getByText("演示内容", { exact: true })).toHaveCount(0);
});

test("clearing a wardrobe persists an explicit empty list across refresh", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "我的衣橱" }).click();
  await page.getByRole("button", { name: "使用 3 件示例单品" }).click();
  await expect(page.getByText("玉白亚麻短袖衬衫")).toBeVisible();

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "清空衣橱" }).click();
  await expect(page.getByText("衣橱目前是空的")).toBeVisible();
  await page.reload();
  await page.getByRole("link", { name: "我的衣橱" }).click();
  await expect(page.getByText("衣橱目前是空的")).toBeVisible();
  await expect(page.getByText("从示例或自己的单品开始")).toHaveCount(0);
  await expect(page.getByText("玉白亚麻短袖衬衫")).toHaveCount(0);
});

test("core controls remain reachable at target widths and 200% zoom", async ({ page }) => {
  for (const width of [320, 375, 768, 1024]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await expect(page.getByRole("button", { name: "快速体验合成示例" }).first()).toBeVisible();
    await expect(page.getByRole("navigation", { name: "主要导航", exact: true })).toBeVisible();
    const dimensions = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1);
  }

  await page.setViewportSize({ width: 1024, height: 900 });
  await page.goto("/");
  await page.evaluate(() => {
    document.documentElement.style.zoom = "2";
  });
  const profileButton = page.getByRole("link", { name: "个人档案", exact: true });
  await profileButton.scrollIntoViewIfNeeded();
  await expect(profileButton).toBeVisible();
  await profileButton.click();
  await expect(page.getByLabel(/公历出生日期/)).toBeVisible();
  await expect(page.getByLabel(/出生时间/)).toBeVisible();
});
