import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Workspace packages ship raw ESM/JSX and must be transpiled by Next.
  transpilePackages: [
    "@swimlane-cloud/editor",
    "@swimlane-cloud/github-client",
    "@swimlane-cloud/diagram-converter",
    "@swimlane-cloud/mobile-view",
  ],
  eslint: {
    // Lint is run separately; do not block production builds on it.
    ignoreDuringBuilds: true,
  },
  // The synced dsl-rule.md and example diagrams (see
  // scripts/sync-dsl-rule.mjs) are read at request time from the mcp route,
  // so they have to be traced into the serverless bundle explicitly.
  outputFileTracingIncludes: {
    "/**": ["./content/dsl-rule.md", "./content/examples/**"],
  },
};

export default nextConfig;
