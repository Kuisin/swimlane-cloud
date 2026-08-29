import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Workspace packages ship raw ESM/JSX/TS and must be transpiled by Next.
  // github-client is the repo's first raw-TypeScript package; listing it here
  // also switches on `shouldIncludeExternalDirs`, which is what lets the loader
  // reach outside apps/hub into packages/ at all.
  transpilePackages: [
    "@swimlane-cloud/editor",
    "@swimlane-cloud/diagram-converter",
    "@swimlane-cloud/github-client",
    "@swimlane-cloud/mobile-view",
  ],
  eslint: {
    // Lint is run separately; do not block production builds on it.
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
