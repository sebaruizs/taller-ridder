import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["@node-rs/argon2", "@electric-sql/pglite"],
  poweredByHeader: false,
  turbopack: { root: import.meta.dirname },
};

export default nextConfig;
