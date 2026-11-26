import type { MetadataRoute } from "next";
import { DEFAULT_LOCALE } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";

export default function manifest(): MetadataRoute.Manifest {
  const dict = getDictionary(DEFAULT_LOCALE);
  return {
    id: "/",
    name: "KUE",
    short_name: "KUE",
    description: dict.meta.description,
    start_url: "/",
    scope: "/",
    display: "standalone",
    display_override: ["standalone", "minimal-ui"],
    orientation: "portrait-primary",
    background_color: "#000000",
    theme_color: "#000000",
    lang: DEFAULT_LOCALE,
    categories: ["music", "entertainment"],
    prefer_related_applications: false,
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icons/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
    shortcuts: [
      {
        name: dict.nav.lineup,
        short_name: dict.nav.lineup,
        url: "/",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
      },
      {
        name: dict.nav.festivalMode,
        short_name: dict.nav.festivalMode,
        url: "/festival-mode",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
      },
      {
        name: dict.nav.festivals,
        short_name: dict.nav.festivals,
        url: "/festivals",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
      },
    ],
  };
}
