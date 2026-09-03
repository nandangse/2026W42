/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false, // don't advertise the framework
  experimental: {
    /**
     * PACKAGES THE SERVER BUNDLE MUST NOT SWALLOW.
     *
     * SheetJS ships CJS; keep it external so Next doesn't try to trace it.
     *
     * @sparticuz/chromium is the one that bit (Dr Raghu, 31 Aug 2026, trying
     * to send a real quotation): "The input directory
     * /vercel/path0/node_modules/@sparticuz/chromium/bin does not exist."
     * The package is not really JavaScript — it is a brotli-compressed
     * Chromium (chromium.br, fonts, swiftshader) that the code unpacks at
     * runtime by looking beside its own file. Webpack relocated the code and
     * left the payload behind, so the press had nothing to unpack and every
     * PDF failed: no quotation could go to a client at all. Externalizing it
     * keeps the folder whole. puppeteer-core rides along for the same reason.
     */
    serverComponentsExternalPackages: [
      "xlsx", "@sparticuz/chromium", "puppeteer-core",
    ],
    // the bundled Sales Regrow playbook and the My Sales Plan sources are read
    // from disk at runtime — make sure Vercel's file tracing packages them
    outputFileTracingIncludes: {
      // The two routes that press a PDF need Chromium's actual payload
      // shipped beside them — externalizing keeps the folder whole, this
      // makes sure the folder travels at all.
      "/api/crm/quote-pdf": ["./node_modules/@sparticuz/chromium/bin/**"],
      "/api/crm/quote-submit": ["./node_modules/@sparticuz/chromium/bin/**"],
      // The plan desk presses a PDF too — signed, or stamped UNSIGNED. It was
      // missed when this list was first written, and the symptom was exactly
      // the quotations' old one: a button that did nothing, because the code
      // shipped without the 50 MB of Chromium it unpacks at runtime.
      // ANY ROUTE THAT CALLS pressPdf BELONGS HERE.
      "/api/month-plan": ["./node_modules/@sparticuz/chromium/bin/**"],
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
        source: "/((?!api/sales/html|api/sales/plan|api/crm/quote-doc).*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
        ],
      },
      {
        source: "/(.*)",
        headers: [
          /**
           * NOT INDEXED. Anywhere. By anything. Including /login.
           *
           * Sent on EVERY response, which is the point of putting it here
           * rather than in a page's metadata: it covers the API routes, the
           * served documents (the Sales playbook, My Sales Plan) and any
           * future page somebody forgets to think about. A header also beats
           * robots.txt, which merely asks a crawler not to look and cannot
           * stop a page being indexed on the strength of a link elsewhere.
           */
          { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive, nosnippet, noimageindex, notranslate" },
          // never sniff content types
          { key: "X-Content-Type-Options", value: "nosniff" },
          // don't leak internal URLs to the ERP / Google Sheets when links open
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          /**
           * The microphone is allowed to THIS ORIGIN and nowhere else.
           *
           * It was switched off with the camera and geolocation on the grounds
           * that a planning app needs no sensors. On Floor changed that: voice
           * notes are recorded at the machine, and this header refused
           * getUserMedia before the browser ever asked the person -- which
           * surfaced as "No microphone, or permission was refused", a message
           * blaming a device that was working fine.
           *
           * self, not *: an embedded third-party frame still cannot open the
           * microphone, which is the thing the header is actually for.
           */
          { key: "Permissions-Policy", value: "camera=(), microphone=(self), geolocation=()" },
          // HTTPS only (Vercel serves HTTPS; pin it for a year)
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
