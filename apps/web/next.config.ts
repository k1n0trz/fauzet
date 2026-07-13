import type { NextConfig } from "next";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const localEnv = resolve(process.cwd(), "../../.env");
if (existsSync(localEnv)) process.loadEnvFile(localEnv);

function resolveApiOrigin(): string {
  const configuredOrigin = process.env.API_ORIGIN?.trim();

  if (process.env.VERCEL && !configuredOrigin) {
    throw new Error("API_ORIGIN is required for Vercel deployments");
  }

  const url = new URL(configuredOrigin || "http://localhost:4000");
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("API_ORIGIN must use http or https");
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error(
      "API_ORIGIN must not contain credentials, query or fragment",
    );
  }
  if (url.pathname !== "/") {
    throw new Error("API_ORIGIN must be an origin without a path");
  }
  if (process.env.VERCEL && url.protocol !== "https:") {
    throw new Error("API_ORIGIN must use https on Vercel");
  }

  return url.origin;
}

const apiOrigin = resolveApiOrigin();

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
      {
        source: "/app/store/fiat/orders/:path*",
        headers: [
          { key: "Cache-Control", value: "no-store" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
      {
        source: "/admin/:path*",
        headers: [
          { key: "Cache-Control", value: "no-store" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
    ];
  },
};

export default nextConfig;
