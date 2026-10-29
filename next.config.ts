import type { NextConfig } from "next";
const config: NextConfig = {
  output: "export",
  devIndicators: false,
  basePath: process.env.NEXT_PUBLIC_BASE_PATH || "",
  trailingSlash: true,
  images: { unoptimized: true },
};
export default config;
