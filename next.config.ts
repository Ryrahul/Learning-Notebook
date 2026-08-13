import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * Ships a self-contained server bundle with only the traced dependencies.
   * Measured: 57 MB (standalone + static + public) vs ~1.2 GB shipping
   * node_modules. This is what makes deploying to a small VM practical.
   */
  output: "standalone",
};

export default nextConfig;
