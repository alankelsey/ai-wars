import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  // Let phones/other machines on the LAN load dev assets; scripts/dev.sh sets this to the host's LAN IPs.
  allowedDevOrigins: process.env.DEV_ORIGINS?.split(",").filter(Boolean) ?? [],
  images: {
    unoptimized: true,
  },
  // GitHub Pages serves the site under /<repo>; the Pages workflow sets BASE_PATH=/ai-wars.
  basePath: process.env.BASE_PATH || undefined,
};

export default nextConfig;
