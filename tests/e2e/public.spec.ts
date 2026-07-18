import { expect, test } from "@playwright/test";

function contrastRatio(first: string, second: string): number {
  const luminance = (value: string) => {
    const hex = value.length === 4
      ? value.slice(1).split("").map((part) => part.repeat(2)).join("")
      : value.slice(1);
    const channels = hex.match(/.{2}/g)?.map((part) => Number.parseInt(part, 16) / 255) ?? [];
    const linear = channels.map((channel) =>
      channel <= 0.04045
        ? channel / 12.92
        : ((channel + 0.055) / 1.055) ** 2.4,
    );
    return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
  };
  const light = Math.max(luminance(first), luminance(second));
  const dark = Math.min(luminance(first), luminance(second));
  return (light + 0.05) / (dark + 0.05);
}

test("public entry points and legal pages are reachable", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/via-mi/);
  await expect(page.getByLabel("via-mi ホーム").first()).toBeVisible();

  for (const path of ["/terms", "/privacy", "/contact"] as const) {
    const response = await page.goto(path);
    expect(response?.ok()).toBeTruthy();
    await expect(page.locator("main")).toBeVisible();
  }
});

test("development-only UI tuning controls are excluded from production", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "UI調整" })).toHaveCount(0);
});

test("a saved session shows the splash until verification finishes", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() => {
    window.localStorage.setItem(
      "via-mi:session:v1",
      JSON.stringify({ handle: "saved_user", token: `bst_${"a".repeat(64)}` }),
    );
  });
  await page.route("**/rest/v1/rpc/verify_app_session", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1_500));
    await route.fulfill({ status: 200, contentType: "application/json", body: "false" });
  });

  await page.goto("/");
  await expect(page.locator(".appBoot")).toBeVisible();
  const spinner = page.locator(".appBootSpinner");
  await expect(spinner).toBeVisible();
  await expect(spinner).toHaveCSS("animation-name", "appBootSpin");
  await expect(spinner).toHaveCSS("animation-duration", "0.9s");
  await expect(spinner).toHaveCSS("animation-iteration-count", "infinite");
  await expect(spinner).toHaveCSS("animation-play-state", "running");
  await expect(page.locator(".landingTitle")).toHaveCount(0);
  await expect(page.locator(".appBoot")).toHaveCount(0, { timeout: 3_000 });
  await expect(page.locator(".landingTitle")).toBeVisible();
});

test("a profile QR is personalized and shareable as an image", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem(
      "via-mi:session:v1",
      JSON.stringify({ handle: "qr_user", token: `bst_${"a".repeat(64)}` }),
    );
    Object.defineProperty(navigator, "canShare", {
      configurable: true,
      value: () => true,
    });
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: async (data: ShareData) => {
        const file = data.files?.[0];
        (window as typeof window & {
          __qrShare?: { name?: string; size?: number; type?: string };
        }).__qrShare = {
          name: file?.name,
          size: file?.size,
          type: file?.type,
        };
      },
    });
  });

  const rpcResponses: Record<string, unknown> = {
    verify_app_session: true,
    get_public_page: {
      profile: {
        handle: "qr_user",
        name: "QRテスト",
        bio: "",
        emoji: "🌙",
        theme: 0,
        av_theme: 0,
        av_url: "",
        bn_url: "",
        verified: false,
      },
      channels: [],
      cal: [],
    },
    get_follower_count: 4,
    get_private_cal: [],
    get_clicks: [],
    get_account_security: {
      passkey_linked: true,
      recovery_verified: false,
      recovery_kind: null,
      recovery_email_masked: null,
    },
    get_my_follows: [],
  };
  await page.route("**/rest/v1/rpc/*", async (route) => {
    const rpc = new URL(route.request().url()).pathname.split("/").pop() ?? "";
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(rpcResponses[rpc] ?? null),
    });
  });

  await page.goto("/");
  await expect(page.getByText("QRテスト", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "QRコード", exact: true }).click();

  const dialog = page.getByRole("dialog", { name: "共有用QRコード" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("QRテスト", { exact: true })).toBeVisible();
  await expect(dialog.getByText("@qr_user", { exact: true })).toBeVisible();
  const qrImage = dialog.getByRole("img", { name: "@qr_user のQRコード" });
  await expect(qrImage).toHaveAttribute("src", /^data:image\/svg\+xml/);
  const svg = decodeURIComponent((await qrImage.getAttribute("src")) ?? "");
  expect(svg).toContain('rx=".32"');
  expect(svg).toContain('fill="#235f74"');
  expect(svg.match(/<g><rect/g)).toHaveLength(3);

  await dialog.getByRole("button", { name: "QR画像を共有", exact: true }).click();
  await expect.poll(() =>
    page.evaluate(() => (window as typeof window & {
      __qrShare?: { name?: string; size?: number; type?: string };
    }).__qrShare),
  ).toMatchObject({
    name: "via-mi-qr_user.png",
    type: "image/png",
  });
  const sharedSize = await page.evaluate(() => (window as typeof window & {
    __qrShare?: { size?: number };
  }).__qrShare?.size ?? 0);
  expect(sharedSize).toBeGreaterThan(5_000);
});

test("profile photos use a fixed-height rail and notes expose formatting controls", async ({ page }, testInfo) => {
  await page.addInitScript(() => {
    window.localStorage.setItem(
      "via-mi:session:v1",
      JSON.stringify({ handle: "content_user", token: `bst_${"a".repeat(64)}` }),
    );
  });
  const photos = Array.from({ length: 3 }, (_, index) => ({
    id: `photo-${index}`,
    url: `https://kciftkinnwkjmlouzmwu.supabase.co/storage/v1/object/public/avatars/test/photo-${index}.jpg`,
  }));
  const rpcResponses: Record<string, unknown> = {
    verify_app_session: true,
    get_public_page: {
      profile: {
        handle: "content_user",
        name: "コンテンツテスト",
        bio: "",
        emoji: "🌸",
        theme: 0,
        av_theme: 0,
        av_url: "",
        bn_url: "",
        verified: false,
        content: {
          photos,
          notes: [{
            id: "note-1",
            text: "中央の太字メモ",
            bold: true,
            underline: true,
            align: "center",
          }],
        },
      },
      channels: [],
      cal: [],
    },
    get_follower_count: 0,
    get_private_cal: [],
    get_clicks: [],
    get_account_security: {
      passkey_linked: true,
      recovery_verified: false,
      recovery_kind: null,
      recovery_email_masked: null,
    },
    get_my_follows: [],
  };
  await page.route("https://kciftkinnwkjmlouzmwu.supabase.co/storage/v1/object/public/avatars/test/photo-*.jpg", async (route) => {
    const index = Number(route.request().url().match(/photo-(\d+)/)?.[1] ?? 0);
    const colors = [["#60c8f3", "#44d7bc"], ["#ffb8d0", "#d7b7ff"], ["#ffd3a8", "#fff0b8"]];
    const [from, to] = colors[index] ?? colors[0];
    await route.fulfill({
      status: 200,
      contentType: "image/svg+xml",
      body: `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400"><defs><linearGradient id="g"><stop stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs><rect width="600" height="400" fill="url(#g)"/></svg>`,
    });
  });
  await page.route("**/rest/v1/rpc/*", async (route) => {
    const rpc = new URL(route.request().url()).pathname.split("/").pop() ?? "";
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(rpcResponses[rpc] ?? null),
    });
  });

  await page.goto("/");
  await expect(page.getByRole("button", { name: "写真を追加" })).toBeVisible();
  await expect(page.getByRole("button", { name: "メモを追加" })).toBeVisible();
  const items = page.locator(".profilePhotoItem");
  await expect(items).toHaveCount(3);
  const sizes = await items.evaluateAll((elements) =>
    elements.map((element) => Math.round(element.getBoundingClientRect().height)),
  );
  expect(new Set(sizes).size).toBe(1);
  await expect(page.locator(".profilePhotoRail")).toHaveCSS("overflow-x", "auto");
  const note = page.getByText("中央の太字メモ", { exact: true });
  await expect(note).toHaveCSS("text-align", "center");
  await expect(note).toHaveCSS("font-weight", "700");
  await expect(note).toHaveCSS("text-decoration-line", "underline");
  expect(await note.evaluate((element) => getComputedStyle(element).color))
    .toBe(await page.locator("body").evaluate((element) => getComputedStyle(element).color));
  await page.screenshot({ path: testInfo.outputPath("profile-content-mobile.png"), fullPage: true });

  await page.getByRole("button", { name: "メモを追加" }).click();
  await expect(page.getByRole("button", { name: "太字" })).toBeVisible();
  await expect(page.getByRole("button", { name: "下線" })).toBeVisible();
  await expect(page.getByRole("button", { name: "左揃え" })).toBeVisible();
  await expect(page.getByRole("button", { name: "中央揃え" })).toBeVisible();
  await expect(page.getByRole("button", { name: "右揃え" })).toBeVisible();
  await expect(page.getByPlaceholder("メモを入力")).toHaveAttribute("maxlength", "1000");
});

test("health endpoint and production metadata are valid", async ({ request }) => {
  const health = await request.get("/api/health");
  expect(health.ok()).toBeTruthy();
  expect(await health.json()).toMatchObject({ ok: true, service: "via-mi" });

  const home = await request.get("/");
  const html = await home.text();
  expect(html).toContain('rel="canonical" href="https://example.test"');
  expect(html).not.toContain("fonts.googleapis.com");
});

test("PWA metadata, icons, and update worker are installable", async ({ request }) => {
  const manifestResponse = await request.get("/manifest.webmanifest");
  expect(manifestResponse.ok()).toBeTruthy();
  expect(manifestResponse.headers()["content-type"]).toContain("application/manifest+json");
  const manifest = await manifestResponse.json();
  expect(manifest).toMatchObject({
    id: "/",
    name: "via-mi",
    short_name: "via-mi",
    start_url: "/",
    scope: "/",
    display: "standalone",
  });
  expect(manifest.icons).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ src: "/icon-192.png", sizes: "192x192", type: "image/png" }),
      expect.objectContaining({ src: "/icon-512.png", sizes: "512x512", type: "image/png" }),
    ]),
  );

  for (const path of ["/icon-192.png", "/icon-512.png", "/apple-touch-icon.png"] as const) {
    const icon = await request.get(path);
    expect(icon.ok()).toBeTruthy();
    expect(icon.headers()["content-type"]).toContain("image/png");
  }

  const worker = await request.get("/sw.js");
  expect(worker.ok()).toBeTruthy();
  expect(worker.headers()["content-type"]).toContain("application/javascript");
  const workerSource = await worker.text();
  expect(workerSource).toContain("skipWaiting");
  expect(workerSource).toContain("fetch(event.request)");
  expect(workerSource).toContain("notificationclick");
  expect(workerSource).toContain("showNotification");
  expect(workerSource).not.toContain("caches.open");
});

test("security and privacy headers are present", async ({ request }) => {
  const response = await request.get("/");
  const headers = response.headers();
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["x-frame-options"]).toBe("SAMEORIGIN");
  expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(headers["permissions-policy"]).toContain("camera=()");
  expect(headers["strict-transport-security"]).toContain("max-age=63072000");
  expect(headers["content-security-policy"]).toContain("object-src 'none'");
  expect(headers["content-security-policy"]).not.toContain("'unsafe-eval'");
});

test("report links prefill the target page", async ({ page }) => {
  const target = "https://via-mi.com/@reported_user";
  await page.goto(`/contact?category=report&page=${encodeURIComponent(target)}`);

  await expect(page.getByLabel("種別")).toHaveValue("report");
  await expect(page.getByLabel("対象ページURL")).toHaveValue(target);
  await expect(page.getByLabel("対象ページURL")).toHaveAttribute("required", "");
});

test("account creation only asks for an ID and passkey", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "無料でIDを作る", exact: true }).click();

  await page.getByLabel("ID", { exact: true }).fill("new_user");
  const create = page.getByRole("button", { name: "パスキーで作成", exact: true });
  await expect(create).toBeEnabled();
  await expect(page.getByText("この端末にパスキーを保存します。次回からパスワードなしでログインできます。")).toBeVisible();
  await expect(page.locator('input[type="password"]')).toHaveCount(0);
});

test("help explains the main flow in plain language", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Help", exact: true }).click();

  await expect(page.getByRole("heading", { name: "via-miの使い方", exact: true })).toBeVisible();
  await expect(page.getByText("me → 追加したい項目を選ぶ", { exact: true })).toBeVisible();
  await expect(page.getByText("Follow → ID検索", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "ログインできないとき", exact: true })).toHaveCount(0);
});

test("appearance settings support dark mode and seven saved color themes", async ({ page }) => {
  await page.addInitScript(() => {
    if (window.sessionStorage.getItem("legacy-theme-seeded")) return;
    window.localStorage.setItem(
      "via-mi:appearance:v1",
      JSON.stringify({ mode: "light", theme: "magenta" }),
    );
    window.sessionStorage.setItem("legacy-theme-seeded", "1");
  });
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-color-theme", "peach");
  await page.getByRole("button", { name: "Help", exact: true }).click();

  await expect(page.getByRole("heading", { name: "表示", exact: true })).toBeVisible();
  const themes = page.getByRole("group", { name: "カラーテーマ" });
  const themeButtons = themes.getByRole("button");
  await expect(themeButtons).toHaveCount(7);

  const accentColors = new Set<string>();
  for (let index = 0; index < 7; index += 1) {
    await themeButtons.nth(index).click();
    const palette = await page.locator("html").evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        accent: style.getPropertyValue("--em").trim(),
        onAccent: style.getPropertyValue("--on-em").trim(),
      };
    });
    accentColors.add(palette.accent);
    expect(contrastRatio(palette.accent, palette.onAccent)).toBeGreaterThanOrEqual(4.5);
  }
  expect(accentColors.size).toBe(7);

  await page.getByRole("button", { name: "ダーク", exact: true }).click();
  await page.getByRole("button", { name: "甘めピンク（スイート）", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-color-mode", "dark");
  await expect(page.locator("html")).toHaveAttribute("data-color-theme", "sweet");
  await expect(page.locator("html")).toHaveCSS("color-scheme", "dark");
  await expect(page.locator("body")).toHaveCSS("background-color", "rgb(27, 15, 21)");

  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-color-mode", "dark");
  await expect(page.locator("html")).toHaveAttribute("data-color-theme", "sweet");
});

test("bottom tabs slide in the direction of travel", async ({ page }) => {
  await page.goto("/");
  const followTab = page.getByRole("button", { name: "Follow", exact: true });
  const meTab = page.getByRole("button", { name: "me", exact: true });
  const followPath = await followTab.locator(".navIcon path").getAttribute("d");
  const mePath = await meTab.locator(".navIcon path").getAttribute("d");
  expect(followPath).toContain("M23 21");
  expect(mePath).toContain("M3 11.5");
  expect(followPath).not.toBe(mePath);

  await followTab.click();
  await expect(page.locator(".tabStage")).toHaveClass(/from-left/);
  await expect(page.locator(".tabStage")).toHaveCSS("animation-name", "tab-slide-from-left");

  await page.getByRole("button", { name: "Help", exact: true }).click();
  await expect(page.locator(".tabStage")).toHaveClass(/from-right/);
  await expect(page.locator(".tabStage")).toHaveCSS("animation-name", "tab-slide-from-right");
});

test("pulling down from the top offers a refresh", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".pullRefresh")).toBeAttached();
  await page.evaluate(() => {
    const dispatchTouch = (type: string, clientY: number) => {
      const event = new Event(type, { bubbles: true, cancelable: true });
      Object.defineProperty(event, "touches", {
        value: type === "touchcancel" ? [] : [{ clientY }],
      });
      document.dispatchEvent(event);
    };
    dispatchTouch("touchstart", 0);
    dispatchTouch("touchmove", 150);
  });

  await expect(page.locator(".pullRefresh")).toHaveClass(/show ready/);
  await expect(page.locator(".pullRefresh")).toHaveAttribute("aria-label", "離して更新");
  await expect(page.locator(".pullRefreshProgress")).toBeVisible();
  await expect(page.locator(".pullRefreshSurface")).toHaveCSS("transition-property", "none");
  await expect.poll(
    () => page.locator(".pullRefreshSurface").evaluate(
      (element) => new DOMMatrix(getComputedStyle(element).transform).m42,
    ),
  ).toBeGreaterThan(0);
  const regularPullY = await page.locator(".pullRefreshSurface").evaluate(
    (element) => new DOMMatrix(getComputedStyle(element).transform).m42,
  );
  await page.evaluate(() => {
    const event = new Event("touchmove", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "touches", { value: [{ clientY: 600 }] });
    document.dispatchEvent(event);
  });
  await page.waitForTimeout(100);
  const deepPullY = await page.locator(".pullRefreshSurface").evaluate(
    (element) => new DOMMatrix(getComputedStyle(element).transform).m42,
  );
  expect(deepPullY).toBeGreaterThan(regularPullY);
  expect(deepPullY).toBeLessThan(118);
  await page.evaluate(() => document.dispatchEvent(new Event("touchcancel", { bubbles: true })));
  await expect(page.locator(".pullRefresh")).not.toHaveClass(/show/);
  await expect(page.locator(".pullRefreshSurface")).toHaveCSS("transform", "matrix(1, 0, 0, 1, 0, 0)");

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.evaluate(() => {
    window.scrollTo(0, 0);
    const event = new Event("touchstart", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "touches", { value: [{ clientY: 0 }] });
    document.dispatchEvent(event);
  });
  await expect(page.locator(".pullRefresh")).toHaveClass(/dragging/);
  await page.evaluate(() => {
    const event = new Event("touchmove", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "touches", { value: [{ clientY: 150 }] });
    document.dispatchEvent(event);
  });
  await expect(page.locator(".pullRefresh")).toHaveClass(/ready/);
  await page.evaluate(() => {
    const event = new Event("touchend", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "touches", { value: [] });
    document.dispatchEvent(event);
  });
  await expect(page.locator(".pullRefresh")).toHaveClass(/refreshing/, { timeout: 300 });
  await expect(page.locator(".pullRefresh")).toHaveAttribute("aria-label", "更新中");
  await expect(page.locator(".pullRefreshSpinner")).toBeVisible();
  await expect(page.locator(".pullRefreshSurface")).toHaveClass(/refreshing/);
  await expect.poll(
    () => page.locator(".pullRefreshSurface").evaluate(
      (element) => new DOMMatrix(getComputedStyle(element).transform).m42,
    ),
  ).toBeGreaterThan(0);
  await expect(page.locator(".pullRefreshSpinner")).toBeVisible();
  const spinnerBefore = await page.locator(".pullRefreshSpinner").evaluate(
    (element) => getComputedStyle(element).transform,
  );
  await page.waitForTimeout(180);
  const spinnerAfter = await page.locator(".pullRefreshSpinner").evaluate(
    (element) => getComputedStyle(element).transform,
  );
  expect(spinnerAfter).not.toBe(spinnerBefore);
  await expect(page.locator(".pullRefresh")).toHaveClass(/returning/, { timeout: 1200 });
  await expect(page.locator(".pullRefreshSurface")).toHaveClass(/returning/);
  await expect(page.locator(".pullRefreshSurface")).toHaveCSS("transform", "matrix(1, 0, 0, 1, 0, 0)");
  // A second pull can take over while the previous return animation is still
  // settling, so rapid manual refreshes never feel locked out.
  await page.evaluate(() => {
    const start = new Event("touchstart", { bubbles: true, cancelable: true });
    Object.defineProperty(start, "touches", { value: [{ clientY: 0 }] });
    document.dispatchEvent(start);
    const move = new Event("touchmove", { bubbles: true, cancelable: true });
    Object.defineProperty(move, "touches", { value: [{ clientY: 150 }] });
    document.dispatchEvent(move);
  });
  await expect(page.locator(".pullRefresh")).toHaveClass(/show ready/);
  await expect(page.locator(".pullRefresh")).not.toHaveClass(/returning/);
  await page.evaluate(() => document.dispatchEvent(new Event("touchcancel", { bubbles: true })));
  await expect(page.locator(".pullRefresh")).not.toHaveClass(/show/);
});

test("a verified contact can start passkey recovery", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "ログイン", exact: true }).click();
  await expect(page.locator(".passkeyIcon")).toHaveCount(0);
  await expect(page.getByText("以前のIDをパスキーへ移行", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "パスキーを使えない場合", exact: true }).click();

  await expect(page.getByRole("heading", { name: "アカウントを復旧", exact: true })).toBeVisible();
  await expect(page.getByLabel("メールアドレス", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "確認メールを送る", exact: true })).toBeVisible();
  await expect(page.getByText("電話番号", { exact: true })).toHaveCount(0);
  await expect(page.locator('input[type="password"]')).toHaveCount(0);
});
