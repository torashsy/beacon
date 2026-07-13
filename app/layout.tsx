import type { Metadata, Viewport } from "next";
import { PwaRegister } from "@/components/PwaRegister";
import { getSiteUrl } from "@/lib/site";
import "./globals.css";

const siteUrl = getSiteUrl();

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  applicationName: "my-IDeal",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "my-IDeal",
  },
  title: "my-IDeal — あなたのSNS、全部ひとつに。",
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
