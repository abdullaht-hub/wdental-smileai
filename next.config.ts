import type { NextConfig } from "next";

/**
 * `unsafe-inline` is present for styles only: Next injects inline <style> tags
 * for the font and CSS-module payloads. Scripts are nonce-free but restricted
 * to self; `unsafe-eval` is dev-only (React Refresh needs it).
 *
 * `connect-src` deliberately does NOT include kie.ai — the browser never talks
 * to the model provider. All of that happens server-side so the patient's photo
 * only ever leaves the device towards our own origin.
 */
const isDev = process.env.NODE_ENV === "development";

const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' blob:",
  "worker-src 'self' blob:",
  "media-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
].join("; ");

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Permissions-Policy",
            // Camera stays allowed on self: the file input's `capture`
            // attribute hands off to the OS camera, but some Android builds
            // still consult this header.
            value:
              "geolocation=(), microphone=(), payment=(), usb=(), interest-cohort=(), camera=(self)",
          },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
