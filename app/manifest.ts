import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Taller Ridder",
    short_name: "Taller",
    description: "Órdenes de taller de Ridder",
    start_url: "/ordenes",
    display: "standalone",
    background_color: "#F4F3EF",
    theme_color: "#F4F3EF",
    lang: "es-PY",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
  };
}
