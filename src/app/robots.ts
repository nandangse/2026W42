import type { MetadataRoute } from "next";

/**
 * robots.txt — and why it does NOT say "Disallow: /".
 *
 * The instruction is that no search engine may ever index any page of Genie,
 * the login page included. The obvious way to write that is Disallow: /, and
 * it is the wrong way round.
 *
 * "Disallow" means DO NOT FETCH. A crawler that is told not to fetch a page
 * never sees the noindex we send with it — and Google is explicit that a URL
 * it has been forbidden to crawl can still be listed, on the strength of a
 * link somewhere else, as a bare address with no description. Blocking the
 * crawl therefore protects nothing and disables the one instruction that
 * actually works.
 *
 * So: crawling is allowed, and every response carries
 *
 *     X-Robots-Tag: noindex, nofollow, noarchive, nosnippet, ...
 *
 * from next.config.js, repeated as <meta name="robots"> from layout.tsx. A
 * crawler fetches, is told plainly not to index, and drops the page — which
 * is the outcome that was asked for.
 *
 * There is nothing here for it to find in any case: every page behind the
 * login answers 307 to a signed-out request, and the API routes answer 401.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/" }],
  };
}
