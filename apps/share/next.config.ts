import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Workspace packages ship raw ESM/JSX and must be transpiled by Next.
  transpilePackages: [
    "@swimlane-cloud/diagram-converter",
    "@swimlane-cloud/mobile-view",
  ],
  // Token pages read the diagram sources from content/ at request time, so the
  // folder must be traced into the serverless bundle on Vercel.
  outputFileTracingIncludes: {
    "/**": ["./content/**"],
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
