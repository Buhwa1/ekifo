import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "FindEkifo — Find your space in Uganda",
    short_name: "FindEkifo",
    description: "Hostels, arcade stalls, rentals and flexi-stays across Uganda.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f4f6fd",
    theme_color: "#0b1f7a",
    orientation: "portrait",
    categories: ["lifestyle", "travel", "business"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/icons/icon.svg", sizes: "any", type: "image/svg+xml" },
    ],
  };
}
