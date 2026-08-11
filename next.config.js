/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false, // don't advertise the framework
  experimental: {
    // SheetJS ships CJS; keep it external to the server bundle so Next doesn't try to trace it.
    serverComponentsExternalPackages: ["xlsx"],
    // the bundled Sales Regrow playbook and the My Sales Plan sources are read
    // from disk at runtime — make sure Vercel's file tracing packages them
    outputFileTracingIncludes: {
      "/api/sales/html": ["./src/sales-regrow/*.html"],
      "/api/sales/plan": [
        "./src/sales-plan/*",
        "./node_modules/@supabase/supabase-js/dist/umd/supabase.js",
      ],
    },
  },
  async headers() {
    return [
      {
        // Frame-blocking applies everywhere EXCEPT the two Sales Genie
        // documents (playbook + My Sales Plan), which must be embeddable by
        // our own workspace iframes (those routes set SAMEORIGIN /
        // frame-ancestors 'self' themselves — still no third-party framing
        // anywhere).
        source: "/((?!api/sales/html|api/sales/plan).*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
        ],
      },
      {
        source: "/(.*)",
        headers: [
          // never sniff content types
          { key: "X-Content-Type-Options", value: "nosniff" },
          // don't leak internal URLs to the ERP / Google Sheets when links open
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // this app needs no browser sensors
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          // HTTPS only (Vercel serves HTTPS; pin it for a year)
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
