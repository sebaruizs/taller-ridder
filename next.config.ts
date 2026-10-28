import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["@node-rs/argon2", "@electric-sql/pglite"],
  poweredByHeader: false,
  turbopack: { root: import.meta.dirname },
  // Cobranzas usa las mismas rutas que la web bajo su propio prefijo (ver lib/auth.ts, llamadaCobranzas).
  async rewrites() {
    return [{ source: "/api/integraciones/cobranzas/:ruta*", destination: "/api/:ruta*" }];
  },
};

export default nextConfig;
