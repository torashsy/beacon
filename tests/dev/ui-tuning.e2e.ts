import { expect, test } from "@playwright/test";

test("development UI tuning panel previews, saves, and resets changes", async ({ page }, testInfo) => {
  await page.goto("/");
  await page.getByRole("button", { name: "UI調整" }).click();
  await expect(page.getByRole("complementary", { name: "UI調整パネル" })).toBeVisible();

  await page.getByLabel("対象テーマ").selectOption("mint");
  await expect(page.locator("html")).toHaveAttribute("data-color-theme", "mint");
  await expect.poll(() =>
    page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--page").trim()),
  ).toBe("#f8fffc");

  const accentRow = page.getByText("ボタン・丸数字", { exact: true }).locator("..");
  await accentRow.locator('input[type="text"]').fill("#245c50");
  await expect.poll(() =>
    page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--em").trim()),
  ).toBe("#245c50");

  const radius = page.locator(".uiTuningRange").filter({ hasText: "カード角丸" }).locator("input");
  await radius.fill("22");
  await expect.poll(() =>
    page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--radius").trim()),
  ).toBe("22px");

  await page.getByPlaceholder(/profileEditButton/).fill(".logo { opacity: .55; }");
  await expect(page.locator(".logo").first()).toHaveCSS("opacity", "0.55");
  await expect(page.locator(".uiTuningSection pre")).toContainText("--em: #245c50");

  await page.reload();
  await page.getByRole("button", { name: "UI調整" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-color-theme", "mint");
  await expect(page.locator(".logo").first()).toHaveCSS("opacity", "0.55");

  await page.screenshot({
    path: testInfo.outputPath("ui-tuning-panel.png"),
  });

  await page.getByRole("button", { name: "リセット" }).click();
  await expect(page.locator(".uiTuningMessage")).toHaveText("調整内容をリセットしました");
  await expect(page.locator(".logo").first()).toHaveCSS("opacity", "1");
});
