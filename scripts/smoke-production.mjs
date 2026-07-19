const base = (process.env.SMOKE_BASE_URL || "https://via-mi.com").replace(/\/$/, "");

async function check(path, inspect) {
  const response = await fetch(`${base}${path}`, {
    redirect: "follow",
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  const body = await response.text();
  await inspect?.(response, body);
}

await check("/api/health", async (_response, body) => {
  const health = JSON.parse(body);
  if (health.ok !== true || health.service !== "via-mi") throw new Error("invalid health response");
});

await check("/", (response, body) => {
  if (!body.includes("via-mi")) throw new Error("home marker missing");
  if (body.includes("http://localhost:3000")) throw new Error("localhost metadata detected");
  const csp = response.headers.get("content-security-policy") ?? "";
  if (!csp) throw new Error("CSP header missing");
  if (csp.includes("'unsafe-eval'")) throw new Error("development CSP detected");
  if (!csp.includes("upgrade-insecure-requests")) throw new Error("production CSP incomplete");
  const requiredHeaders = {
    "x-content-type-options": "nosniff",
    "x-frame-options": "SAMEORIGIN",
    "referrer-policy": "strict-origin-when-cross-origin",
  };
  for (const [name, value] of Object.entries(requiredHeaders)) {
    if (response.headers.get(name) !== value) throw new Error(`${name} header invalid`);
  }
  if (!response.headers.get("strict-transport-security")?.includes("max-age=63072000")) {
    throw new Error("HSTS header invalid");
  }
});

await check("/manifest.webmanifest", async (response, body) => {
  if (!response.headers.get("content-type")?.includes("application/manifest+json")) {
    throw new Error("manifest content type invalid");
  }
  const manifest = JSON.parse(body);
  if (manifest.id !== "/" || manifest.start_url !== "/" || manifest.display !== "standalone") {
    throw new Error("manifest fields invalid");
  }
  const icons = new Set((manifest.icons ?? []).map((icon) => icon.src));
  if (!icons.has("/icon-192.png") || !icons.has("/icon-512.png")) {
    throw new Error("install icons missing");
  }
});

await check("/sw.js", (response, body) => {
  if (!response.headers.get("content-type")?.includes("application/javascript")) {
    throw new Error("service worker content type invalid");
  }
  if (!body.includes("skipWaiting") || !body.includes("fetch(event.request)")) {
    throw new Error("service worker update behavior invalid");
  }
  if (!body.includes("showNotification") || !body.includes("notificationclick")) {
    throw new Error("push notification behavior missing");
  }
  if (body.includes("caches.open")) throw new Error("stale app cache detected");
});

for (const icon of ["/icon-192.png", "/icon-512.png", "/apple-touch-icon.png"]) {
  await check(icon, (response) => {
    if (!response.headers.get("content-type")?.includes("image/png")) {
      throw new Error(`${icon}: invalid content type`);
    }
  });
}

await check("/contact", (_response, body) => {
  if (body.includes("my-ideal.example")) throw new Error("placeholder contact address detected");
});

await check("/privacy", (_response, body) => {
  for (const marker of ["安全管理措置", "手数料はかかりません", "運営者情報・苦情窓口"]) {
    if (!body.includes(marker)) throw new Error(`privacy disclosure missing: ${marker}`);
  }
});

await check("/terms", (_response, body) => {
  for (const marker of ["未成年の方は、法定代理人の同意", "運営者に軽過失がある場合", "規約の変更"]) {
    if (!body.includes(marker)) throw new Error(`terms disclosure missing: ${marker}`);
  }
});

await check("/@via_mi", (_response, body) => {
  const forbiddenLaunchContent = [
    "800文字がどれぐらいなのかを検証しています",
    "ただいま公開準備中",
    "https://x.com/yuxijk",
  ];
  for (const marker of forbiddenLaunchContent) {
    if (body.includes(marker)) {
      throw new Error(`official profile still contains launch-test content: ${marker}`);
    }
  }
});

async function checkCanonicalRedirect(url) {
  const response = await fetch(url, {
    redirect: "manual",
    signal: AbortSignal.timeout(15_000),
  });
  const location = response.headers.get("location") ?? "";
  if (![307, 308].includes(response.status) || !location.startsWith(`${base}/`)) {
    throw new Error(`${url}: canonical redirect missing (${response.status} ${location})`);
  }
}

await checkCanonicalRedirect("https://www.via-mi.com/");
await checkCanonicalRedirect("https://beacon-beige-gamma.vercel.app/");

console.log(`Production smoke checks passed: ${base}`);
