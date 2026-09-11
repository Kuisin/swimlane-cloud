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
  // The synced dsl-rule.md (see scripts/sync-dsl-rule.mjs) is read at
  // request time from the mcp route, so it has to be traced into the
  // serverless bundle explicitly.
  outputFileTracingIncludes: {
    "/**": ["./content/dsl-rule.md"],
  },
};

export default nextConfig;
