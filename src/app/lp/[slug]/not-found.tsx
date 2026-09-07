import { LOGO } from "@/lib/logo";

/**
 * A landing address that answers nothing — an old link, a closed page, a
 * typed letter out of place. A stranger sees this, so it wears Nandan's
 * face and offers a way to reach us; Genie's own wrong-page screen, with
 * its Sign in button, is for people who work here.
 *
 * It lives in the segment rather than relying on the root not-found, which
 * rendered empty and answered 200 (7 Sep 2026).
 */
export default function LandingNotFound() {
  return (
    <div style={{ background: "#16232F", color: "#fff", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: '"Segoe UI", system-ui, -apple-system, sans-serif' }}>
      <div style={{ maxWidth: 460, textAlign: "center" }}>
        <span style={{ background: "#fff", borderRadius: 8, padding: "8px 12px", display: "inline-flex" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={LOGO} alt="Nandan GSE" style={{ height: 34, display: "block" }} />
        </span>
        <h1 style={{ fontSize: 26, margin: "22px 0 8px", fontWeight: 800 }}>This page is not here.</h1>
        <p style={{ color: "#8FA1B3", lineHeight: 1.6, fontSize: 15 }}>
          The link may be old, or the page may have been closed. Nandan GSE has built ground support equipment for Indian airports since 1994 — write to us and we will point you to the right place.
        </p>
        <div style={{ marginTop: 22, display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
          <a href="mailto:sales@nandan.co.in" style={{ background: "#E8600A", color: "#fff", textDecoration: "none", borderRadius: 7, padding: "11px 18px", fontWeight: 700 }}>sales@nandan.co.in</a>
          <a href="https://www.nandan.co.in" style={{ background: "#22303C", color: "#fff", textDecoration: "none", borderRadius: 7, padding: "11px 18px", fontWeight: 700 }}>nandan.co.in</a>
        </div>
        <div style={{ marginTop: 26, fontSize: 12, color: "#5F7183" }}>Nandan GSE · Mumbai, India</div>
      </div>
    </div>
  );
}
