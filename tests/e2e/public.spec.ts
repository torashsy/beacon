import { expect, test } from "@playwright/test";

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
  await expect(page.getByText("パスワードは不要です。画面の案内に沿ってパスキーを保存します。")).toBeVisible();
  await expect(page.locator('input[type="password"]')).toHaveCount(0);
});

test("help explains the main flow in plain language", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Help", exact: true }).click();

  await expect(page.getByRole("heading", { name: "via-miの使い方", exact: true })).toBeVisible();
  await expect(page.getByText("me → リンクを追加 / 予定を追加", { exact: true })).toBeVisible();
  await expect(page.getByText("Follow → ID検索", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "ログインできないとき", exact: true })).toHaveCount(0);
});

test("a verified contact can start passkey recovery", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "ログイン", exact: true }).click();
  await expect(page.locator(".passkeyIcon")).toBeVisible();
  await expect(page.getByText("以前のIDをパスキーへ移行", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "パスキーを使えない場合", exact: true }).click();

  await expect(page.getByRole("heading", { name: "アカウントを復旧", exact: true })).toBeVisible();
  await expect(page.getByLabel("メールアドレス", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "確認メールを送る", exact: true })).toBeVisible();
  await expect(page.getByText("電話番号", { exact: true })).toHaveCount(0);
  await expect(page.locator('input[type="password"]')).toHaveCount(0);
});
