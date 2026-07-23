/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // SheetJS ships CJS; keep it external to the server bundle so Next doesn't try to trace it.
  experimental: {
    serverComponentsExternalPackages: ["xlsx"],
  },
};

module.exports = nextConfig;
