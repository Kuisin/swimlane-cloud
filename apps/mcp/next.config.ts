import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@swimlane-cloud/diagram-converter"],
  // The synced dsl-rule.md is read at request time from the mcp route, so
  // it has to be traced into the serverless bundle (same reason apps/share
  // traces its content/ directory).
  outputFileTracingIncludes: {
    "/**": ["./content/**"],
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
