const base = (process.env.SMOKE_BASE_URL || "https://beacon-beige-gamma.vercel.app").replace(/\/$/, "");

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
  if (!response.headers.get("content-security-policy")) throw new Error("CSP header missing");
});

await check("/contact", (_response, body) => {
  if (body.includes("my-ideal.example")) throw new Error("placeholder contact address detected");
});

console.log(`Production smoke checks passed: ${base}`);
