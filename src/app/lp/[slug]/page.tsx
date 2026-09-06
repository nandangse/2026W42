import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { crmDb, crmConfigured } from "@/crm/db";
import { LOGO } from "@/lib/logo";
import LandingForm from "@/components/marketing/LandingForm";
import { swallow } from "@/lib/swallow";

export const dynamic = "force-dynamic";

type Page = {
  id: string; slug: string; title: string; headline: string | null; subhead: string | null; body_html: string | null;
  hero_url: string | null; logo: boolean; theme: "navy" | "white" | "orange"; form_fields: string[]; cta_label: string;
  thank_you: string | null; published: boolean; indexable: boolean; views: number;
};

async function pageFor(slug: string): Promise<Page | null> {
  if (!crmConfigured()) return null;
  try {
    const { data } = await crmDb().from("mk_landing").select("*").eq("slug", slug.toLowerCase()).eq("published", true).maybeSingle();
    return (data as Page) ?? null;
  } catch (e) { swallow("lp/page", e); return null; }
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const p = await pageFor(params.slug);
  if (!p) return { title: "Nandan GSE", robots: { index: false, follow: false } };
  return {
    title: p.title,
    description: p.subhead || p.headline || undefined,
    robots: p.indexable ? { index: true, follow: true } : { index: false, follow: false },
    openGraph: { title: p.title, description: p.subhead || undefined, images: p.hero_url ? [p.hero_url] : undefined },
  };
}

const THEMES = {
  navy: { top: "#16232F", topInk: "#fff", body: "#F4F2EC", ink: "#22303C", accent: "#E8600A" },
  white: { top: "#fff", topInk: "#16232F", body: "#fff", ink: "#22303C", accent: "#E8600A" },
  orange: { top: "#E8600A", topInk: "#fff", body: "#FFF7F2", ink: "#22303C", accent: "#16232F" },
} as const;

/**
 * A landing page, in the open (Dr Raghu, 6 Sep 2026: "we will have a landing
 * page creator at nandangse.com/<lpname>; that's the stuff that will be
 * linked"). No login: this is the page a stranger opens from a mail. It
 * answers at /lp/<slug> on Genie's own address, and at nandangse.com/<slug>
 * once that domain points here — the middleware maps one to the other.
 */
export default async function LandingPage({ params }: { params: { slug: string } }) {
  const p = await pageFor(params.slug);
  if (!p) notFound();
  const t = THEMES[p.theme] ?? THEMES.navy;
  // counted quietly; a failure here must never cost the reader the page
  try { await crmDb().from("mk_landing").update({ views: (Number(p.views) || 0) + 1 }).eq("id", p.id); } catch (e) { swallow("lp/views", e); }

  return (
    <div style={{ background: t.body, color: t.ink, minHeight: "100vh", fontFamily: '"Segoe UI", system-ui, -apple-system, sans-serif' }}>
      <div style={{ background: t.top, color: t.topInk, padding: "14px 20px" }}>
        <div style={{ maxWidth: 1040, margin: "0 auto", display: "flex", alignItems: "center", gap: 12 }}>
          {p.logo && (
            <span style={{ background: "#fff", borderRadius: 6, padding: "5px 8px", display: "inline-flex" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={LOGO} alt="Nandan GSE" style={{ height: 30, display: "block" }} />
            </span>
          )}
          <span style={{ fontWeight: 700, letterSpacing: 0.4 }}>Nandan GSE</span>
          <span style={{ marginLeft: "auto", fontSize: 13, opacity: 0.85 }}>Ground support equipment · since 1994</span>
        </div>
      </div>

      <div style={{ maxWidth: 1040, margin: "0 auto", padding: "28px 20px 60px" }}>
        <div className="lp-grid" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.25fr) minmax(300px, 1fr)", gap: 32, alignItems: "start" }}>
          <div style={{ minWidth: 0 }}>
            {p.headline && <h1 style={{ fontSize: 38, lineHeight: 1.15, margin: "0 0 10px", fontWeight: 800 }}>{p.headline}</h1>}
            {p.subhead && <p style={{ fontSize: 18, lineHeight: 1.5, margin: "0 0 20px", color: "#5A6672" }}>{p.subhead}</p>}
            {p.hero_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.hero_url} alt="" style={{ width: "100%", borderRadius: 10, marginBottom: 20, display: "block" }} />
            )}
            {p.body_html && <div className="lp-body" style={{ fontSize: 16, lineHeight: 1.65 }} dangerouslySetInnerHTML={{ __html: p.body_html }} />}
          </div>

          <div id="ask" style={{ background: "#fff", border: "1px solid #E2E0DA", borderTop: `4px solid ${t.accent}`, borderRadius: 10, padding: 20, boxShadow: "0 8px 26px rgba(22,35,47,.08)", position: "sticky", top: 20 }}>
            <LandingForm slug={p.slug} fields={p.form_fields} cta={p.cta_label} accent={t.accent} />
          </div>
        </div>
      </div>

      <div style={{ background: "#16232F", color: "#8FA1B3", padding: "18px 20px", fontSize: 13 }}>
        <div style={{ maxWidth: 1040, margin: "0 auto", display: "flex", gap: 16, flexWrap: "wrap" }}>
          <span>Nandan GSE · Mumbai, India</span>
          <a href="mailto:sales@nandan.co.in" style={{ color: "#8FA1B3" }}>sales@nandan.co.in</a>
          <span style={{ marginLeft: "auto" }}>© {new Date().getFullYear()} Nandan Ground Support Equipment</span>
        </div>
      </div>

      <style>{`
        .lp-body img { max-width: 100%; border-radius: 8px; }
        .lp-body h2 { font-size: 24px; margin: 24px 0 8px; }
        .lp-body h3 { font-size: 19px; margin: 20px 0 6px; }
        .lp-body ul, .lp-body ol { padding-left: 22px; }
        .lp-body a { color: #1B3A5C; }
        .lp-body table { border-collapse: collapse; }
        .lp-body td, .lp-body th { border: 1px solid #E2E0DA; padding: 6px 10px; }
        @media (max-width: 820px) {
          .lp-grid { grid-template-columns: 1fr !important; }
          .lp-grid h1 { font-size: 30px !important; }
          #ask { position: static !important; }
        }
      `}</style>
    </div>
  );
}
