/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  /**
   * Lint is a separate step (`npm run lint`), never part of the build.
   * ESLint over 117,000 lines takes more than ten minutes on this Google
   * Drive mount and would push every Vercel build the same way; the build's
   * job is the type-check and the bundle (6 Sep 2026).
   */
  eslint: { ignoreDuringBuilds: true },
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
      // HRMS presses too (7 Oct 2026): the slips mailed one by one, the slips fetched by the
      // WhatsApp helper, the slips attached to a mass mail, the register PDF to management.
      // The symptom when one is missing is a 500 — "input directory …/chromium/bin does not exist".
      "/api/hrms/slip-mail": ["./node_modules/@sparticuz/chromium/bin/**"],
      "/api/hrms/wa-slips": ["./node_modules/@sparticuz/chromium/bin/**"],
      "/api/hrms/mass-mail": ["./node_modules/@sparticuz/chromium/bin/**"],
      "/api/hrms/register-mail": ["./node_modules/@sparticuz/chromium/bin/**"],
      "/api/sales/html": ["./src/sales-regrow/*.html"],
      "/api/sales/plan": [
        "./src/sales-plan/*",
        "./node_modules/@supabase/supabase-js/dist/umd/supabase.js",
      ],
    },
  },
  async redirects() {
    /* /LC and /Lc open the Leaders Council too (Dr Raghu, 10 Oct 2026:
       "genie.nandan.co.in/lc or genie.nandan.co.in/LC") — routes are
       case-sensitive, a typed address is not. */
    return [
      { source: "/LC", destination: "/lc", permanent: false },
      { source: "/Lc", destination: "/lc", permanent: false },
      { source: "/LC/:path*", destination: "/lc/:path*", permanent: false },
    ];
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
        /**
         * Everything but the landing pages. A landing page is written to be
         * found — whether search engines may index it is the page's own tick
         * (CRM migration 0056), and the page emits that itself. The rest of
         * the block still applies to it, below.
         */
        source: "/((?!lp/).*)",
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
           * The microphone AND THE CAMERA are allowed to THIS ORIGIN and
           * nowhere else.
           *
           * Both were switched off with geolocation on the grounds that a
           * planning app needs no sensors. On Floor broke that for the
           * microphone: voice notes are recorded at the machine, and this
           * header refused getUserMedia before the browser ever asked the
           * person -- which surfaced as "No microphone, or permission was
           * refused", a message blaming a device that was working fine.
           *
           * THE CAMERA WAS LEFT SWITCHED OFF, AND THE SAME FAULT CAME BACK
           * (Dr Raghu, 17 Sep 2026: "didnt work. it warned. but did not get
           * camera"). Visiting cards and selfies are photographed on a phone
           * at a stand. camera=() refuses that request in the browser before
           * a permission prompt is ever shown, so the scanner sat on
           * "opening the camera" with nothing to answer -- a header saying no
           * on the person's behalf and never telling them.
           *
           * self, not *: an embedded third-party frame still cannot open
           * either sensor, which is the thing the header is actually for.
           * The landing pages below keep both at (), because nothing there
           * ever photographs anything.
           */
          { key: "Permissions-Policy", value: "camera=(self), microphone=(self), geolocation=()" },
          // HTTPS only (Vercel serves HTTPS; pin it for a year)
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
        ],
      },
      {
        // the landing pages: the same protections, minus the blanket noindex
        source: "/lp/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
