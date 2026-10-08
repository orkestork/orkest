import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // ORKEST es 100% dinámica por request (sesión + organización activa): sin prerender de rutas.
  cacheComponents: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
