/**
 * ONE SANITISER FOR EVERY PIECE OF HTML THAT CAME FROM OUTSIDE (9 Oct 2026,
 * audit items S9/S10).
 *
 * Three places rendered somebody else's markup raw: a WhatsApp reply pulled
 * from Periskope, a landing page's body typed by a marketing hand, and a
 * ticket description copied from the ERP. Each is a stored-XSS path on the
 * Genie origin, where the session cookie is readable by script.
 *
 * Runs on the server and in the browser alike (no DOM, no dependency). It is
 * an allow-nothing-dangerous strip, not a parser: scripts, styles, frames,
 * objects, forms and meta/link/base tags go; every on* handler goes; every
 * URL attribute that is not http(s), mailto, tel or a plain path goes. Good
 * enough for text with bold and lists, which is all three callers ever
 * meant to show.
 */
const DROP_TAGS = /<\s*\/?\s*(script|style|iframe|frame|frameset|object|embed|applet|form|input|button|textarea|select|meta|link|base|svg|math|template|noscript)\b[^>]*>/gi;
const DROP_BLOCKS = /<\s*(script|style|iframe|object|svg|math|template|noscript)\b[\s\S]*?<\s*\/\s*\1\s*>/gi;
const ON_ATTR = /\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi;
const URL_ATTR = /\s+(href|src|xlink:href|formaction|action|background|poster|data|srcdoc|srcset)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/gi;
const STYLE_ATTR = /\s+style\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi;

const SAFE_URL = /^(https?:|mailto:|tel:|\/(?!\/)|#|\.\/|[a-z0-9_\-.]+(\/|$|\?|#)|data:image\/(png|jpe?g|gif|webp);base64,)/i;

export function safeHtml(html: unknown): string {
  let s = String(html ?? "");
  if (!s) return "";
  s = s.replace(DROP_BLOCKS, "");
  s = s.replace(DROP_TAGS, "");
  s = s.replace(/<!--[\s\S]*?-->/g, "");
  s = s.replace(ON_ATTR, "");
  s = s.replace(/\s+srcdoc\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
  s = s.replace(URL_ATTR, (m, attr, _q, d, sq, bare) => {
    const v = String(d ?? sq ?? bare ?? "").trim().replace(/[\u0000-\u001f\s]+/g, "");
    return SAFE_URL.test(v) ? m : "";
  });
  s = s.replace(STYLE_ATTR, (m) => (/expression|javascript:|url\s*\(|behavior|@import/i.test(m) ? "" : m));
  return s.trim();
}

/** Plain text that may carry newlines, for a `white-space: pre-wrap` box. */
export const looksLikeHtml = (s: unknown) => /<[a-z][\s\S]*>/i.test(String(s ?? ""));
