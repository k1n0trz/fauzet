import type { NextConfig } from "next";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const localEnv = resolve(process.cwd(), "../../.env");
if (existsSync(localEnv)) process.loadEnvFile(localEnv);

const apiOrigin = process.env.API_ORIGIN ?? "http://localhost:4000";

if (process.env.VERCEL && !process.env.API_ORIGIN) {
  throw new Error("API_ORIGIN is required for Vercel deployments");
}

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async rewrites() {
    return [
      {
        source: "/api/v1/:path*",
        destination: `${apiOrigin}/v1/:path*`,
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/app/:path(verify|reset)",
        headers: [{ key: "Referrer-Policy", value: "no-referrer" }],
      },
    ];
  },
};

export default nextConfig;
