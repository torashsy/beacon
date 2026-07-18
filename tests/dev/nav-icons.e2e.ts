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
});
