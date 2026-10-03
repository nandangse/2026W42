"use client";
import { useState } from "react";
import { api, btn, Card, dmy, Err, H1, input, label, Loading, Markdown, P, pill, PrintButton, TABS, useGet, type Boot, type Content as Piece } from "./shared";

/**
 * FAQs · NEWSLETTERS · ADVISORIES AND BULLETINS — three tabs, one shape:
 * what Nandan puts up, in markdown, for everyone, for customers or
 * suppliers, or for one organisation. The admin writes here; everyone
 * else reads what is published.
 */
export default function Content({ boot, kind, arg, go }: { boot: Boot; kind: string; arg: string | null; go: (t: string, a?: string | null) => void }) {
  const tab = TABS.find((t) => t.key === kind)!;
  const r = useGet<{ content: Piece[] }>(`/api/portal/content?kind=${kind}&slug=${encodeURIComponent(boot.scope.slug)}`);
  const [editing, setEditing] = useState<Partial<Piece> | null>(null);
  const rows = r.data?.content || [];
  const open = arg ? rows.find((p) => p.id === arg) || null : null;
  const isFaq = kind === "faq";
  const blank = (): Partial<Piece> => ({ kind, title: "", body: "", org_slug: boot.org?.slug || null, audience: "all", published: false, pinned: false, published_on: boot.today });

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <H1 sub={isFaq ? "The questions that come up, answered once." : kind === "newsletter" ? "News from Nandan GSE." : "What you should know — advisories and bulletins on your machines."}>{tab.label}</H1>
        <div style={{ display: "flex", gap: 8 }} className="no-print">
          {boot.me.admin && <button onClick={() => setEditing(blank())} style={btn("primary")}>+ Write</button>}
          <PrintButton />
        </div>
      </div>
      {r.error && <Err e={r.error} />}
      {editing && boot.me.admin && <Editor boot={boot} piece={editing} onDone={() => { setEditing(null); r.reload(); }} onCancel={() => setEditing(null)} />}
      {open ? (
        <Card title={open.title} right={<span style={{ display: "flex", gap: 8, alignItems: "center" }}>{dmy(open.published_on)}<button onClick={() => go(kind)} style={btn("ghost", { padding: "2px 8px", fontSize: 12 })} className="no-print">← All</button></span>}>
          <Markdown text={open.body} />
          {boot.me.admin && <div className="no-print" style={{ marginTop: 12 }}><button onClick={() => setEditing(open)} style={btn("ghost")}>Edit</button></div>}
        </Card>
      ) : r.loading ? <Loading /> : rows.length === 0 ? (
        <Card><div style={{ color: P.muted, fontSize: 13 }}>Nothing published here yet.</div></Card>
      ) : isFaq ? (
        <Card>
          <div style={{ display: "grid", gap: 4 }}>
            {rows.map((p) => <Faq key={p.id} p={p} admin={boot.me.admin} onEdit={() => setEditing(p)} />)}
          </div>
        </Card>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {rows.map((p) => (
            <Card key={p.id} title={<button onClick={() => go(kind, p.id)} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", font: "inherit", color: P.navy, fontWeight: 700, fontSize: 16, textAlign: "left" }}>{p.title}</button>}
              right={<span style={{ display: "flex", gap: 6, alignItems: "center" }}>{p.pinned && <span style={pill(P.amber, P.ink)}>pinned</span>}{!p.published && <span style={pill(P.red)}>draft</span>}{p.org_slug && <span style={pill(P.blue)}>{p.org_slug}</span>}{p.audience !== "all" && <span style={pill(P.muted)}>{p.audience}s</span>}<span>{dmy(p.published_on)}</span></span>}>
              <div style={{ fontSize: 13, color: P.dim, maxHeight: 72, overflow: "hidden", position: "relative" }}><Markdown text={p.body.split("\n").slice(0, 4).join("\n")} small /></div>
              <div style={{ display: "flex", gap: 8, marginTop: 8 }} className="no-print">
                <button onClick={() => go(kind, p.id)} style={btn("ghost", { padding: "4px 10px", fontSize: 12 })}>Read ›</button>
                {boot.me.admin && <button onClick={() => setEditing(p)} style={btn("ghost", { padding: "4px 10px", fontSize: 12 })}>Edit</button>}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function Faq({ p, admin, onEdit }: { p: Piece; admin: boolean; onEdit: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ borderBottom: `1px solid ${P.line}` }}>
      <button onClick={() => setOpen(!open)} style={{ width: "100%", textAlign: "left", background: "none", border: "none", padding: "10px 4px", cursor: "pointer", display: "flex", gap: 10, alignItems: "center", font: "inherit" }}>
        <span style={{ color: P.accent, fontWeight: 700 }}>{open ? "−" : "+"}</span>
        <span style={{ flex: 1, fontWeight: 600, fontSize: 14, color: P.navy }}>{p.title}</span>
        {!p.published && <span style={pill(P.red)}>draft</span>}{p.org_slug && <span style={pill(P.blue)}>{p.org_slug}</span>}
      </button>
      {open && <div style={{ padding: "0 4px 12px 24px" }}><Markdown text={p.body} small />{admin && <button onClick={onEdit} className="no-print" style={btn("ghost", { padding: "3px 9px", fontSize: 12, marginTop: 6 })}>Edit</button>}</div>}
    </div>
  );
}

function Editor({ boot, piece, onDone, onCancel }: { boot: Boot; piece: Partial<Piece>; onDone: () => void; onCancel: () => void }) {
  const [f, setF] = useState({ ...piece, org_slug: piece.org_slug || "", audience: piece.audience || "all" });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const save = async (publish?: boolean) => {
    setBusy(true); setErr(null);
    try { await api("/api/portal/content", { action: "save", ...f, published: publish ?? f.published, org_slug: f.org_slug || null }); onDone(); }
    catch (e) { setErr(String((e as Error).message || e)); setBusy(false); }
  };
  const del = async () => { if (!f.id || !confirm("Delete this piece?")) return; try { await api("/api/portal/content", { action: "delete", id: f.id }); onDone(); } catch (e) { setErr(String((e as Error).message || e)); } };
  return (
    <Card title={f.id ? "Edit" : "Write"} right={<button onClick={onCancel} style={btn("ghost", { padding: "3px 9px", fontSize: 12 })}>Cancel</button>}>
      <div style={{ display: "grid", gap: 10 }}>
        <div><label style={label}>{f.kind === "faq" ? "The question" : "Title"}</label><input style={input} value={f.title || ""} onChange={(e) => setF({ ...f, title: e.target.value })} /></div>
        <div><label style={label}>{f.kind === "faq" ? "The answer" : "The body"} · markdown: # heading, **bold**, - bullets, | tables |</label><textarea style={{ ...input, minHeight: 220, fontFamily: "ui-monospace, Menlo, monospace", fontSize: 13 }} value={f.body || ""} onChange={(e) => setF({ ...f, body: e.target.value })} /></div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
          <div><label style={label}>For</label>
            <select style={input} value={f.org_slug} onChange={(e) => setF({ ...f, org_slug: e.target.value })}>
              <option value="">Everyone (by audience)</option>
              {boot.orgs.map((o) => <option key={o.slug} value={o.slug}>{o.name} only</option>)}
            </select></div>
          <div><label style={label}>Audience</label>
            <select style={input} value={f.audience} onChange={(e) => setF({ ...f, audience: e.target.value })} disabled={!!f.org_slug}>
              <option value="all">Customers and suppliers</option><option value="customer">Customers</option><option value="supplier">Suppliers</option>
            </select></div>
          <div><label style={label}>Date</label><input style={input} type="date" value={f.published_on || ""} onChange={(e) => setF({ ...f, published_on: e.target.value })} /></div>
          <div><label style={label}>&nbsp;</label><label style={{ fontSize: 13, display: "flex", gap: 6, alignItems: "center", paddingTop: 8 }}><input type="checkbox" checked={!!f.pinned} onChange={(e) => setF({ ...f, pinned: e.target.checked })} /> pinned on top</label></div>
        </div>
        {err && <div style={{ color: P.red, fontSize: 13 }}>{err}</div>}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button onClick={() => save(true)} disabled={busy} style={btn("primary")}>{f.published ? "Save" : "Publish"}</button>
          <button onClick={() => save(false)} disabled={busy} style={btn("ghost")}>{f.published ? "Unpublish (keep as draft)" : "Save as draft"}</button>
          <span style={{ flex: 1 }} />
          {f.id && <button onClick={del} style={btn("danger")}>Delete</button>}
        </div>
      </div>
    </Card>
  );
}
