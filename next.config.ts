import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  output: "export",
  turbopack: { root: process.cwd() },
  devIndicators: false,
  images: { unoptimized: true },
};
export default nextConfig;
