/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false, // don't advertise the framework
  // SheetJS ships CJS; keep it external to the server bundle so Next doesn't try to trace it.
  experimental: {
    serverComponentsExternalPackages: ["xlsx"],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          // no embedding — blocks clickjacking
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
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
