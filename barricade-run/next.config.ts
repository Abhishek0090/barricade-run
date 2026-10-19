import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Static HTML export (`out/`): the game runs fully in the browser, so any static host works.
  output: "export",
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
