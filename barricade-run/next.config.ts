import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Static HTML export (`out/`): the games run fully in the browser, so any static host works.
  output: "export",
  // Each game is written as <name>/index.html, which every static host serves at /<name>/.
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
