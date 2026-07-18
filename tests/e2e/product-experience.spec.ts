import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import {
  browserStorageSnapshot,
  mockBaseApis,
  modelReading,
  profile,
  seedPersonalData,
  wardrobe,
} from "./fixtures";

test("one-click synthetic demo stays in memory and exiting restores personal state", async ({ page }) => {
  await mockBaseApis(page, false);
  await seedPersonalData(page);
  await page.goto("/#today");
  await expect(page.getByRole("button", { name: "查看演示内容" })).toBeVisible();
  const before = await browserStorageSnapshot(page);

  await page.getByRole("button", { name: "快速体验合成示例" }).first().click();
  await expect(page.getByText("合成演示", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "退出演示" })).toBeVisible();
  expect(await browserStorageSnapshot(page)).toEqual(before);

  await page.getByRole("button", { name: "退出演示" }).click();
  await expect(page.getByText("合成演示", { exact: true })).toHaveCount(0);
  await page.getByRole("link", { name: "个人档案", exact: true }).click();
  await expect(page.getByLabel(/公历出生日期/)).toHaveValue(profile.birthDate);
  await expect(page.getByLabel(/出生时间/)).toHaveValue(profile.birthTime);
  await page.getByRole("link", { name: "我的衣橱", exact: true }).click();
  await expect(page.getByText(wardrobe[0].name, { exact: true })).toBeVisible();
  expect(await browserStorageSnapshot(page)).toEqual(before);
});

test("fresh-user guidance progresses through profile, wardrobe and generation", async ({ page }) => {
  await mockBaseApis(page, false);
  await page.goto("/#today");

  await expect(page.getByText("完成档案", { exact: true })).toBeVisible();
  await expect(page.getByText("准备衣橱", { exact: true })).toBeVisible();
  await expect(page.getByText("生成灵感", { exact: true })).toBeVisible();

  await page.getByRole("link", { name: "个人档案", exact: true }).click();
  await page.getByLabel(/公历出生日期/).fill("1992-02-02");
  await page.getByLabel(/出生时间/).fill("12:00");
  await page.getByRole("button", { name: "保存并计算四柱" }).click();
  await expect(page.getByText(/档案已保存/)).toBeVisible();
  await page.getByRole("button", { name: "下一步：准备衣橱" }).click();

  await expect(page.getByRole("button", { name: "使用 3 件示例单品" })).toBeVisible();
  await expect(page.getByRole("button", { name: "手动添加第一件" })).toBeVisible();
  await expect(page.getByRole("button", { name: "跳过衣橱，去生成" })).toBeVisible();
  await page.getByRole("button", { name: "使用 3 件示例单品" }).click();
  await expect(page.getByText(/3 件|示例衣橱/).first()).toBeVisible();
  await page.getByRole("link", { name: "今日灵感", exact: true }).click();
  await page.getByRole("button", { name: /查看演示内容|生成灵感/ }).click();
  await expect(page.getByText("演示内容", { exact: true })).toBeVisible();
});

test("wardrobe items can be edited and an edit can be cancelled", async ({ page }) => {
  await mockBaseApis(page, false);
  await seedPersonalData(page);
  await page.goto("/#wardrobe");

  await page.getByRole("button", { name: `编辑 ${wardrobe[0].name}` }).click();
  await page.getByLabel(/衣物名称/).fill("编辑后的合成衬衫");
  await page.getByLabel(/类别/).selectOption({ label: "外套" });
  await page.getByLabel(/主色名称/).fill("雾蓝");
  await page.getByRole("button", { name: "保存修改" }).click();
  await expect(page.getByText("编辑后的合成衬衫", { exact: true })).toBeVisible();
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("wuxing.wardrobe.v3") ?? "null"));
  expect(stored[0]).toMatchObject({ name: "编辑后的合成衬衫", category: "外套", primaryColor: { name: "雾蓝" } });

  await page.getByRole("button", { name: "编辑 编辑后的合成衬衫" }).click();
  await page.getByLabel(/衣物名称/).fill("不应保存的名称");
  await page.getByRole("button", { name: "取消编辑" }).last().click();
  await expect(page.getByText("编辑后的合成衬衫", { exact: true })).toBeVisible();
  await expect(page.getByText("不应保存的名称", { exact: true })).toHaveCount(0);
});

test("privacy rejection makes zero generation requests and confirmation sends exactly one", async ({ page }) => {
  await mockBaseApis(page, true);
  await seedPersonalData(page);
  let modelRequests = 0;
  await page.route("**/api/daily-reading", async (route) => {
    modelRequests += 1;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(modelReading) });
  });
  await page.goto("/#today");
  await expect(page.getByRole("button", { name: "生成今日灵感" })).toBeVisible();

  await page.getByRole("button", { name: "生成今日灵感" }).click();
  const dialog = page.getByRole("dialog", { name: "生成前的数据确认" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "返回修改" }).click();
  await expect(dialog).toHaveCount(0);
  expect(modelRequests).toBe(0);
  expect(await page.evaluate(() => Object.keys(localStorage).some((key) => key.includes("privacy")))).toBe(false);

  await page.getByRole("button", { name: "生成今日灵感" }).click();
  await page.getByRole("dialog", { name: "生成前的数据确认" })
    .getByRole("button", { name: "继续生成" }).click();
  await expect(page.getByRole("heading", { name: "合成模型结果已返回" })).toBeVisible();
  expect(modelRequests).toBe(1);
});

test("generation can be cancelled and a retry recovers from a timeout", async ({ page }) => {
  await mockBaseApis(page, true);
  await seedPersonalData(page);
  await page.addInitScript(() => localStorage.setItem("wuxing.privacy.v2", "accepted"));
  let call = 0;
  await page.route("**/api/daily-reading", async (route) => {
    call += 1;
    if (call === 1) {
      await new Promise((resolve) => setTimeout(resolve, 800));
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(modelReading) }).catch(() => undefined);
      return;
    }
    if (call === 2) {
      await route.fulfill({
        status: 504,
        contentType: "application/json",
        body: JSON.stringify({ error: { code: "MODEL_TIMEOUT", message: "模型响应超时", retryable: true } }),
      });
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(modelReading) });
  });
  await page.goto("/#today");
  await expect(page.getByRole("button", { name: "生成今日灵感" })).toBeVisible();

  await page.getByRole("button", { name: "生成今日灵感" }).click();
  await expect(page.getByText("正在整理配色与衣橱")).toBeVisible();
  await page.getByRole("button", { name: "取消生成" }).click();
  await expect(page.getByText("正在整理配色与衣橱")).toHaveCount(0);
  await page.waitForTimeout(900);
  await expect(page.getByRole("heading", { name: "合成模型结果已返回" })).toHaveCount(0);

  await page.getByRole("button", { name: "生成今日灵感" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "模型响应超时" })).toBeVisible();
  await page.getByRole("button", { name: "重试生成" }).click();
  await expect(page.getByRole("heading", { name: "合成模型结果已返回" })).toBeVisible();
  expect(call).toBe(3);
});

test("hash navigation supports direct links and browser history", async ({ page }) => {
  await mockBaseApis(page, false);
  await page.goto("/#wardrobe");
  await expect(page).toHaveURL(/#wardrobe$/);
  await expect(page.getByRole("heading", { name: "我的衣橱" })).toBeVisible();

  await page.getByRole("link", { name: "个人档案", exact: true }).click();
  await expect(page).toHaveURL(/#profile$/);
  await expect(page.getByRole("heading", { name: "个人档案" })).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/#wardrobe$/);
  await expect(page.getByRole("heading", { name: "我的衣橱" })).toBeVisible();
});

test("core views have no serious axe violations and navigation works by keyboard", async ({ page }) => {
  await mockBaseApis(page, false);
  await page.goto("/#today");

  for (const hash of ["today", "profile", "wardrobe", "settings"]) {
    await page.goto(`/#${hash}`);
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations.filter((violation) => ["serious", "critical"].includes(violation.impact ?? "")))
      .toEqual([]);
  }

  await page.goto("/#today");
  let reachedProfile = false;
  for (let index = 0; index < 20; index += 1) {
    await page.keyboard.press("Tab");
    const active = await page.evaluate(() => ({
      text: (document.activeElement?.textContent ?? "").trim(),
      outline: document.activeElement ? getComputedStyle(document.activeElement).outlineStyle : "none",
    }));
    if (active.text === "个人档案") {
      expect(active.outline).not.toBe("none");
      reachedProfile = true;
      break;
    }
  }
  expect(reachedProfile).toBe(true);
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#profile$/);
  const profileHeading = page.getByRole("heading", { level: 1, name: "个人档案" });
  await expect(profileHeading).toHaveAttribute("tabindex", "-1");
  await expect(profileHeading).toBeFocused();
  await page.getByRole("button", { name: "保存并计算四柱" }).click();
  await expect(page.getByLabel(/公历出生日期/)).toBeFocused();
});

test("critical breakpoints, touch targets and 200% zoom remain usable", async ({ page }) => {
  await mockBaseApis(page, false);
  for (const width of [320, 375, 768, 1024]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/#today");
    const dimensions = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      undersizedButtons: [...document.querySelectorAll("button")]
        .filter((element) => (element as HTMLElement).offsetParent !== null)
        .map((element) => ({
          text: (element.textContent ?? "").trim(),
          ariaLabel: element.getAttribute("aria-label"),
          className: element.className,
          height: Math.round(element.getBoundingClientRect().height),
        }))
        .filter((element) => element.height < 44),
    }));
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1);
    expect(dimensions.undersizedButtons).toEqual([]);
  }

  await page.setViewportSize({ width: 1024, height: 900 });
  await page.goto("/#today");
  await page.evaluate(() => { document.documentElement.style.zoom = "2"; });
  const quickDemo = page.getByRole("button", { name: "快速体验合成示例" }).first();
  await quickDemo.scrollIntoViewIfNeeded();
  await expect(quickDemo).toBeVisible();
  await quickDemo.press("Enter");
  await expect(page.getByText("合成演示", { exact: true })).toBeVisible();
});
