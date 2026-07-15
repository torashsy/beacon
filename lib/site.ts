const PRODUCTION_FALLBACK = "https://via-mi.com";

export function getSiteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, "");

  const vercelHost = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (vercelHost) return `https://${vercelHost.replace(/^https?:\/\//, "")}`;

  return process.env.NODE_ENV === "production"
    ? PRODUCTION_FALLBACK
    : "http://localhost:3000";
}
