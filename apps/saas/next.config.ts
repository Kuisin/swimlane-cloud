import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Workspace packages ship raw ESM/JSX and must be transpiled by Next.
  transpilePackages: [
    "@swimlane-cloud/editor",
    "@swimlane-cloud/diagram-converter",
    "@swimlane-cloud/mobile-view",
  ],
  eslint: {
    // Lint is run separately; do not block production builds on it.
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
