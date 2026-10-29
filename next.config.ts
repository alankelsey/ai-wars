import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  // Let phones/other machines on the LAN load dev assets; scripts/dev.sh sets this to the host's LAN IPs.
  allowedDevOrigins: process.env.DEV_ORIGINS?.split(",").filter(Boolean) ?? [],
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
