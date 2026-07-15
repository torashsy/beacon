import type { Metadata, Viewport } from "next";
import { PwaRegister } from "@/components/PwaRegister";
import { getSiteUrl } from "@/lib/site";
import "./globals.css";

const siteUrl = getSiteUrl();

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
    icon: "/via-mi-icon.jpg",
    apple: "/via-mi-icon.jpg",
  },
  description:
    "X・Instagram・LINEなどの連絡先とイベント予定をひとつの公開ページに。メール不要、IDとパスコードだけ。",
  alternates: { canonical: "/" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0284c7",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body>
        {children}
        <PwaRegister />
      </body>
    </html>
  );
}
