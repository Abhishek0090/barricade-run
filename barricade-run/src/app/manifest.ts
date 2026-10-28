import type { MetadataRoute } from "next";

import { ARCADE_NAME } from "@/games/shared/constants";

export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: ARCADE_NAME,
    short_name: "Barricade",
    description: "Protest arcade by Abhishek Pal: Barricade Run, Barricade Drive and Rail Roko.",
    start_url: "/",
    scope: "/",
    display: "fullscreen",
    orientation: "any",
    background_color: "#140c29",
    theme_color: "#140c29",
    categories: ["games"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
