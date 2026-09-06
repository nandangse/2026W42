"use client";
/**
 * THE LANDING PAGE CREATOR (Dr Raghu, 6 Sep 2026: "we will have a landing
 * page creator at nandangse.com/<lpname> — that's the stuff that will be
 * linked").
 *
 * A page is written here and answers in the open: on Genie at
 * /lp/<address>, and at nandangse.com/<address> once that domain points at
 * this deploy. What a visitor fills in becomes a person and a company in
 * the CRM, tagged, and can join a mailing list.
 */
import React, { useCallback, useEffect, useState } from "react";
import GenieTable from "@/components/GenieTable";
import RichTextEditor from "@/components/RichTextEditor";
import { Modal } from "@/components/marketing/LeadBoxes";
import { fmtAt } from "@/lib/fmt";
import { swallow } from "@/lib/swallow";

type Page = { id: string; slug: string; title: string; headline: string | null; subhead?: string | null; body_html?: string | null; hero_url?: string | null; logo?: boolean; theme?: string; form_fields?: string[]; cta_label?: string; thank_you?: string | null; add_to_list_id?: string | null; tag_name?: string | null; published: boolean; indexable: boolean; views: number; submits: number; created_by_email: string; created_at: string; updated_at?: string };
type Submit = { id: string; name: string | null; email: string | null; phone: string | null; company: string | null; message: string | null; person_id: string | null; at: string };
type MailList = { id: string; name: string; count: number };

const INK = "var(--ink)", MUTED = "var(--muted)", LINE = "var(--line)", NAVY = "var(--navy)", GREEN = "var(--green)", RED = "var(--red)", ACCENT = "var(--accent)";
const inp: React.CSSProperties = { border: `1px solid #E2E0DA`, borderRadius: 6, padding: "6px 8px", fontSize: 13, background: "#fff", color: "#22303C", width: "100%" };
const btn = (bg: string, fg = "#fff"): React.CSSProperties => ({ background: bg, color: fg, borderRadius: 6, padding: "6px 12px", fontSize: 12.5, fontWeight: 700, cursor: "pointer" });
const FIELDS: [string, string][] = [["name", "Name"], ["email", "E-mail"], ["phone", "Phone"], ["company", "Company"], ["message", "What they need"]];

async function api<T = Record<string, unknown>>(path: string, body?: unknown): Promise<T> {
  const r = await fetch(path, body === undefined ? { cache: "no-store" } : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
  return j as T;
}

/** Every picture in Marketing goes to Genie's own public bucket. */
export async function uploadPublic(file: File): Promise<string> {
  const fd = new FormData();
  fd.append("file", file);
  const r = await fetch("/api/marketing/asset", { method: "POST", body: fd });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || "the picture would not upload");
  return String(j.url);
}

export default function LandingPages({ lists }: { lists: MailList[] }) {
  const [rows, setRows] = useState<Page[] | null>(null);
  const [installed, setInstalled] = useState(true);
  const [open, setOpen] = useState<Page | "new" | null>(null);
  const [msg, setMsg] = useState("");
  const load = useCallback(() => api<{ pages: Page[]; installed: boolean }>("/api/marketing/landing")
    .then((j) => { setRows(j.pages || []); setInstalled(j.installed !== false); })
    .catch((e) => { swallow("marketing/landing", e); setRows([]); }), []);
  useEffect(() => { load(); }, [load]);

  const publish = async (p: Page, on: boolean) => {
    try { await api("/api/marketing/landing", { action: "publish", id: p.id, published: on }); setMsg(on ? `“${p.slug}” is open to the world ✓` : `“${p.slug}” is closed again ✓`); load(); }
    catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
  };
  const copy = (slug: string) => { try { navigator.clipboard.writeText(`https://nandangse.com/${slug}`); setMsg("link copied ✓"); } catch (e) { swallow("copy", e); } };

  return (
    <div>
      <div className="flex items-center gap-2 mb-1 flex-wrap">
        <div className="font-bold" style={{ fontSize: 16, color: INK }}>🌐 Landing pages</div>
        <span className="ml-auto" />
        <button onClick={() => setOpen("new")} style={btn(ACCENT)}>+ New page</button>
      </div>
      <div className="text-xs mb-3" style={{ color: MUTED, lineHeight: 1.6 }}>
        A page answers at <b>nandangse.com/&lt;address&gt;</b> once that domain points at Genie, and always at <b>genie.nandan.co.in/lp/&lt;address&gt;</b>. Whoever fills the form becomes a lead in the CRM, tagged, and can join a mailing list. Pictures are hosted by Genie itself, so they show in every mail reader.
      </div>
      {!installed && <div className="text-xs mb-2" style={{ color: RED }}>Run CRM migration 0056 first — landing pages have nowhere to live yet.</div>}
      {msg && <div className="text-xs font-semibold mb-2" style={{ color: msg.includes("✓") ? GREEN : RED }}>{msg}</div>}

      <GenieTable<Page> rows={rows} minWidth={860} empty="No page yet. New page writes one, and Publish opens it."
        columns={[
          { key: "slug", label: "Address", sort: (r) => r.slug, render: (r) => <button onClick={() => setOpen(r)} className="font-semibold" style={{ color: "var(--blue)", textDecoration: "underline" }}>/{r.slug}</button> },
          { key: "title", label: "Page", render: (r) => <span>{r.headline || r.title}</span> },
          { key: "state", label: "State", render: (r) => <button onClick={() => publish(r, !r.published)} className="rounded px-2 text-xs font-bold" style={{ background: r.published ? "#0F766E" : "#fff", color: r.published ? "#fff" : MUTED, border: `1px solid ${r.published ? "#0F766E" : "#E2E0DA"}`, whiteSpace: "nowrap" }}>{r.published ? "✓ open" : "publish"}</button> },
          { key: "views", label: "Seen", align: "right", sort: (r) => r.views, render: (r) => <span className="tnum">{r.views || "·"}</span> },
          { key: "submits", label: "Filled in", align: "right", sort: (r) => r.submits, render: (r) => <span className="tnum" style={{ fontWeight: r.submits ? 700 : 400, color: r.submits ? GREEN : MUTED }}>{r.submits || "·"}</span> },
          { key: "seo", label: "Search", render: (r) => (r.indexable ? "indexed" : "hidden") },
          { key: "links", label: "", render: (r) => (
            <span className="flex gap-2 text-xs">
              <a href={`/lp/${r.slug}`} target="_blank" rel="noreferrer" style={{ color: "var(--blue)" }}>open ↗</a>
              <button onClick={() => copy(r.slug)} style={{ color: MUTED }}>copy link</button>
            </span>
          ) },
          { key: "at", label: "Changed", render: (r) => fmtAt(r.updated_at || r.created_at) },
        ]} />

      {open && <Builder page={open === "new" ? null : open} lists={lists} onClose={() => { setOpen(null); load(); }} />}
    </div>
  );
}

function Builder({ page, lists, onClose }: { page: Page | null; lists: MailList[]; onClose: () => void }) {
  const [tab, setTab] = useState<"write" | "form" | "filled">("write");
  const [id, setId] = useState<string | null>(page?.id ?? null);
  const [f, setF] = useState({
    slug: page?.slug || "", title: page?.title || "", headline: page?.headline || "", subhead: page?.subhead || "",
    body_html: page?.body_html || "", hero_url: page?.hero_url || "", logo: page?.logo !== false, theme: page?.theme || "navy",
    form_fields: page?.form_fields || ["name", "email", "phone", "company"], cta_label: page?.cta_label || "Send",
    thank_you: page?.thank_you || "", add_to_list_id: page?.add_to_list_id || "", tag_name: page?.tag_name || "Landing page",
    indexable: !!page?.indexable,
  });
  const [full, setFull] = useState<Page | null>(null);
  const [submits, setSubmits] = useState<Submit[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [hero, setHero] = useState(false);

  useEffect(() => {
    if (!id) return;
    api<{ row: Page; submits: Submit[] }>(`/api/marketing/landing?id=${id}`).then((j) => {
      setFull(j.row); setSubmits(j.submits || []);
      setF((x) => ({ ...x, body_html: x.body_html || j.row.body_html || "" }));
    }).catch((e) => swallow("landing/one", e));
  }, [id]);

  const save = async () => {
    setBusy(true); setMsg("");
    try { const r = await api<{ id: string }>("/api/marketing/landing", { action: "save", id: id || undefined, ...f, add_to_list_id: f.add_to_list_id || null }); setId(r.id); setMsg("saved ✓"); }
    catch (e) { setMsg(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };
  const pickHero = async (file: File | null) => {
    if (!file) return;
    setHero(true); setMsg("");
    try { const url = await uploadPublic(file); setF((x) => ({ ...x, hero_url: url })); setMsg("picture hosted ✓"); }
    catch (e) { setMsg(e instanceof Error ? e.message : String(e)); } finally { setHero(false); }
  };
  const slugOk = /^[a-z0-9][a-z0-9-]{1,58}[a-z0-9]$/.test(f.slug);

  return (
    <Modal width={1100} title={page ? `/${page.slug}` : "New landing page"}
      sub={slugOk ? <>nandangse.com/{f.slug} · genie.nandan.co.in/lp/{f.slug}{full?.published ? " · open" : " · not published yet"}</> : "give it an address, in small letters"} onClose={onClose}>
      <div className="flex gap-1 mb-3 flex-wrap" style={{ borderBottom: `1px solid ${LINE}` }}>
        {([["write", "✍️ The page"], ["form", "📋 The ask"], ["filled", `📥 Filled in (${submits.length})`]] as [typeof tab, string][]).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className="px-3 py-1.5 text-sm font-bold" style={{ color: tab === k ? INK : "#8FA1B3", borderBottom: tab === k ? "2px solid var(--accent)" : "2px solid transparent" }}>{l}</button>
        ))}
        <span className="ml-auto flex items-center gap-2">
          {msg && <span className="text-xs font-semibold" style={{ color: msg.includes("✓") ? GREEN : RED }}>{msg}</span>}
          {id && <a href={`/lp/${f.slug}`} target="_blank" rel="noreferrer" className="text-xs font-bold" style={{ color: "var(--blue)" }}>preview ↗</a>}
          <button onClick={save} disabled={busy || !slugOk} style={btn(slugOk && !busy ? ACCENT : "#E9ECEF", slugOk && !busy ? "#fff" : MUTED)}>{busy ? "saving…" : "Save"}</button>
        </span>
      </div>

      {tab === "write" && (
        <div className="grid gap-3" style={{ gridTemplateColumns: "minmax(0, 1fr) 280px" }}>
          <div className="min-w-0">
            <label className="text-xs font-semibold block" style={{ color: "var(--dim)" }}>Big line
              <input value={f.headline} onChange={(e) => setF({ ...f, headline: e.target.value })} placeholder="Ground support equipment built for Indian airports" style={{ ...inp, fontSize: 15 }} />
            </label>
            <label className="text-xs font-semibold block mt-2" style={{ color: "var(--dim)" }}>The line under it
              <input value={f.subhead} onChange={(e) => setF({ ...f, subhead: e.target.value })} style={inp} />
            </label>
            <div className="text-xs font-semibold mt-2 mb-1" style={{ color: "var(--dim)" }}>The page</div>
            <RichTextEditor initial={f.body_html} live onChangeHtml={(h) => setF((x) => ({ ...x, body_html: h }))} onUploadImage={uploadPublic} minHeight={300}
              placeholder="Write the page. Pictures you paste are hosted by Genie and work everywhere." />
          </div>
          <div className="rounded border p-3" style={{ borderColor: LINE, background: "#FBFAF7", alignSelf: "start" }}>
            <label className="text-xs font-semibold block" style={{ color: "var(--dim)" }}>Address — nandangse.com/<b>{f.slug || "…"}</b>
              <input value={f.slug} onChange={(e) => setF({ ...f, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+/, "") })} placeholder="gse-loaders" style={inp} />
            </label>
            {!slugOk && f.slug && <div className="text-xs" style={{ color: RED }}>small letters, numbers and hyphens, 3 to 60</div>}
            <label className="text-xs font-semibold block mt-2" style={{ color: "var(--dim)" }}>Browser tab
              <input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Nandan GSE — loaders" style={inp} />
            </label>
            <div className="text-xs font-semibold mt-2 mb-1" style={{ color: "var(--dim)" }}>Top picture</div>
            {f.hero_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={f.hero_url} alt="" style={{ width: "100%", borderRadius: 6, marginBottom: 6 }} />
            )}
            <input type="file" accept="image/*" onChange={(e) => { pickHero(e.target.files?.[0] ?? null); e.target.value = ""; }} className="text-xs" disabled={hero} />
            {f.hero_url && <button onClick={() => setF({ ...f, hero_url: "" })} className="text-xs mt-1 block" style={{ color: RED }}>remove it</button>}
            <label className="text-xs font-semibold block mt-2" style={{ color: "var(--dim)" }}>Look
              <select value={f.theme} onChange={(e) => setF({ ...f, theme: e.target.value })} style={inp}><option value="navy">Navy top, paper body</option><option value="white">All white</option><option value="orange">Orange top</option></select>
            </label>
            <label className="flex items-center gap-1 text-xs mt-2" style={{ color: INK }}><input type="checkbox" checked={f.logo} onChange={(e) => setF({ ...f, logo: e.target.checked })} /> show the Nandan logo</label>
            <label className="flex items-center gap-1 text-xs mt-1" style={{ color: INK }} title="Off by default — the rest of Genie is never indexed"><input type="checkbox" checked={f.indexable} onChange={(e) => setF({ ...f, indexable: e.target.checked })} /> let search engines find it</label>
          </div>
        </div>
      )}

      {tab === "form" && (
        <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))" }}>
          <div className="rounded border p-3" style={{ borderColor: LINE }}>
            <div className="text-xs font-bold mb-2" style={{ color: MUTED }}>WHAT TO ASK</div>
            {FIELDS.map(([k, l]) => (
              <label key={k} className="flex items-center gap-2 text-sm py-0.5"><input type="checkbox" checked={f.form_fields.includes(k)} onChange={(e) => setF({ ...f, form_fields: e.target.checked ? [...f.form_fields, k] : f.form_fields.filter((x) => x !== k) })} />{l}</label>
            ))}
            <div className="text-xs mt-2" style={{ color: MUTED }}>An e-mail or a phone is always required before it will send.</div>
          </div>
          <div className="rounded border p-3" style={{ borderColor: LINE }}>
            <div className="text-xs font-bold mb-2" style={{ color: MUTED }}>WHAT HAPPENS NEXT</div>
            <label className="text-xs font-semibold block" style={{ color: "var(--dim)" }}>Button says
              <input value={f.cta_label} onChange={(e) => setF({ ...f, cta_label: e.target.value })} style={inp} />
            </label>
            <label className="text-xs font-semibold block mt-2" style={{ color: "var(--dim)" }}>Thank-you line
              <input value={f.thank_you} onChange={(e) => setF({ ...f, thank_you: e.target.value })} placeholder="Thank you — somebody from Nandan GSE will be in touch." style={inp} />
            </label>
            <label className="text-xs font-semibold block mt-2" style={{ color: "var(--dim)" }}>Tag every lead
              <input value={f.tag_name} onChange={(e) => setF({ ...f, tag_name: e.target.value })} style={inp} />
            </label>
            <label className="text-xs font-semibold block mt-2" style={{ color: "var(--dim)" }}>And put them on a list
              <select value={f.add_to_list_id} onChange={(e) => setF({ ...f, add_to_list_id: e.target.value })} style={inp}><option value="">— no list —</option>{lists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select>
            </label>
          </div>
        </div>
      )}

      {tab === "filled" && (
        <div className="genie-scroll" style={{ maxHeight: "60vh" }}>
          <table className="genie-table">
            <thead><tr><th>When</th><th>Name</th><th>E-mail</th><th>Phone</th><th>Company</th><th>What they said</th></tr></thead>
            <tbody>
              {submits.length === 0 && <tr><td colSpan={6} style={{ color: MUTED }}>Nobody has filled it in yet.</td></tr>}
              {submits.map((s) => (
                <tr key={s.id}><td className="tnum">{fmtAt(s.at)}</td><td>{s.name || "·"}</td><td>{s.email || "·"}</td><td>{s.phone || "·"}</td><td>{s.company || "·"}</td><td>{s.message || "·"}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}
