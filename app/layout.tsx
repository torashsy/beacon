import type { Metadata, Viewport } from "next";
import { AppearanceController } from "@/components/AppearanceController";
import { PwaRegister } from "@/components/PwaRegister";
import {
  APPEARANCE_STORAGE_KEY,
  DEFAULT_APPEARANCE,
} from "@/lib/beacon/appearance";
import { getSiteUrl } from "@/lib/site";
import "./globals.css";

const siteUrl = getSiteUrl();
const appearanceBootstrap = `
  (() => {
    try {
      const fallback = ${JSON.stringify(DEFAULT_APPEARANCE)};
      const stored = JSON.parse(localStorage.getItem(${JSON.stringify(APPEARANCE_STORAGE_KEY)}) || "null") || fallback;
      const modes = ["system", "light", "dark"];
      const themes = ["peach", "sweet", "mint", "sky", "lilac", "citrus", "mono"];
      const legacyThemes = { cobalt: "sky", magenta: "peach" };
      const mode = modes.includes(stored.mode) ? stored.mode : fallback.mode;
      const theme = themes.includes(stored.theme)
        ? stored.theme
        : legacyThemes[stored.theme] || fallback.theme;
      document.documentElement.dataset.colorMode = mode;
      document.documentElement.dataset.colorTheme = theme;
      document.documentElement.style.colorScheme = mode === "system" ? "light dark" : mode;
    } catch {
      document.documentElement.dataset.colorMode = "system";
      document.documentElement.dataset.colorTheme = "sky";
      document.documentElement.style.colorScheme = "light dark";
    }
  })();
`;

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  applicationName: "via-mi",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "via-mi",
  },
  title: "via-mi — あなたのSNS、全部ひとつに。",
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  description:
    "X・Instagram・LINEなどの連絡先とイベント予定をひとつの公開ページに。IDとパスキーですぐ始められます。",
  alternates: { canonical: "/" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f2fbff" },
    { media: "(prefers-color-scheme: dark)", color: "#0b151a" },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: appearanceBootstrap }} />
      </head>
      <body>
        <AppearanceController />
        {children}
        <PwaRegister />
      </body>
    </html>
  );
}
