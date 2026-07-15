import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "via-mi",
    short_name: "via-mi",
    description: "SNSリンクと予定をひとつにまとめるプロフィール",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f6fbfe",
    theme_color: "#0284c7",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
