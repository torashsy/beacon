import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
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
        src: "/via-mi-icon.jpg",
        sizes: "1254x1254",
        type: "image/jpeg",
        purpose: "any",
      },
    ],
  };
}
