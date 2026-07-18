import { expect, test } from "@playwright/test";

test("bottom navigation clearly separates Follow from me", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  const follow = page.getByRole("button", { name: "Follow", exact: true });
  const me = page.getByRole("button", { name: "me", exact: true });
  const help = page.getByRole("button", { name: "Help", exact: true });

  await expect(follow.locator(".navIcon path")).toHaveAttribute("d", /M23 21/);
  await expect(me.locator(".navIcon path")).toHaveAttribute("d", /M3 11.5/);
  await expect(help.locator(".navIcon path")).toHaveAttribute("d", /M12 22/);

  await follow.click();
  await expect(follow).toHaveAttribute("aria-current", "page");
  await page.screenshot({ path: testInfo.outputPath("mobile-bottom-navigation.png") });

  await help.click();
  await expect(help).toHaveAttribute("aria-current", "page");
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const navPosition = await page.locator(".nav").evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      bottom: Math.round(rect.bottom),
      left: Math.round(rect.left),
      position: getComputedStyle(element).position,
      width: Math.round(rect.width),
    };
  });
  expect(navPosition).toEqual({ bottom: 844, left: 0, position: "fixed", width: 390 });

  // UI調整でコンテンツ幅を変えても、Helpだけ下タブがずれない。
  await page.evaluate(() => {
    document.documentElement.style.setProperty("--content-width", "360px");
  });
  await expect.poll(async () => page.locator(".nav").evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { left: Math.round(rect.left), width: Math.round(rect.width) };
  })).toEqual({ left: 15, width: 360 });
  await page.screenshot({ path: testInfo.outputPath("help-bottom-navigation.png") });
});
