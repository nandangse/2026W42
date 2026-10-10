"use client";
/**
 * The Leaders Council's shared pieces — one fetch helper, the cards and
 * buttons, the lightbox, the leader's avatar in their colour, rich text in
 * and out, and the file strip with its Drive mark.
 */
import React, { useEffect, useRef, useState } from "react";
import RichTextEditor, { RichContent } from "@/components/RichTextEditor";
import { swallow } from "@/lib/swallow";

export interface Leader { email: string; name: string; initials: string; colour: string; isOwner: boolean }
export interface Boot { members: Leader[]; me: { email: string; displayName: string | null; initials: string | null; role: string; isOwner: boolean }; settings: Record<string, string> }
export interface LcFile { id: string; name: string; mime: string | null; bytes: number | null; path: string; drive_url: string | null; drive_status: string; drive_error?: string | null; uploaded_by: string | null; created_at: string }

export async function api<T = Record<string, unknown>>(url: string, body?: unknown, tries = 2): Promise<T> {
  const r = await fetch(url, body === undefined ? { cache: "no-store" } : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  /* a gateway timeout or a cold start mid-deploy is tried once more before it is shown */
  if ((r.status === 502 || r.status === 503 || r.status === 504) && tries > 1) { await new Promise((res) => setTimeout(res, 1500)); return api<T>(url, body, tries - 1); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j as { error?: string }).error || (r.status === 504 ? "Genie took too long to answer — try once more." : `${r.status}`));
  return j as T;
}

export function useBoot(): [Boot | null, () => void] {
  const [b, setB] = useState<Boot | null>(null);
  const load = () => { api<Boot>("/api/lc/members").then(setB).catch((e) => swallow("lc/boot", e)); };
  useEffect(load, []);
  return [b, load];
}

export const NAVY = "var(--navy)", ORANGE = "var(--accent)", MUTED = "var(--muted)", DIM = "var(--dim)", LINE = "var(--line)", GREEN = "var(--green)", RED = "var(--red)", AMBER = "var(--amber)";

export const dmy = (iso?: string | null) => iso ? new Date(iso.length === 10 ? iso + "T00:00:00" : iso).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric" }) : "";
export const dmyt = (iso?: string | null) => iso ? new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "";
export const istToday = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
/** Today in IST plus n days, as YYYY-MM-DD. */
export const istPlus = (n: number) => { const d = new Date(istToday() + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
export const inr = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");

export const leaderOf = (boot: Boot | null, email?: string | null): Leader => {
  const e = String(email || "").toLowerCase();
  return boot?.members.find((m) => m.email === e) || { email: e, name: e.split("@")[0] || "—", initials: (e.slice(0, 2) || "??").toUpperCase(), colour: "#8a94a0", isOwner: false };
};

export function Who({ boot, email, size = 26, withName = true, light }: { boot: Boot | null; email?: string | null; size?: number; withName?: boolean; light?: boolean }) {
  const l = leaderOf(boot, email);
  return (
    <span className="inline-flex items-center gap-1.5" title={l.email}>
      <span className="rounded-full font-bold inline-flex items-center justify-center flex-shrink-0" style={{ width: size, height: size, fontSize: size * 0.4, background: l.colour, color: "#fff" }}>{l.initials}</span>
      {withName && <span className="font-semibold" style={{ fontSize: 12, color: light ? "#fff" : NAVY }}>{l.name}</span>}
    </span>
  );
}

export const btn = (kind: "primary" | "ghost" | "danger" | "soft" = "ghost", extra: React.CSSProperties = {}): React.CSSProperties => ({
  padding: "7px 14px", borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: "pointer", border: "1px solid",
  ...(kind === "primary" ? { background: ORANGE, color: "#fff", borderColor: ORANGE }
    : kind === "danger" ? { background: "#fff", color: RED, borderColor: RED }
    : kind === "soft" ? { background: "#fff", color: NAVY, borderColor: LINE }
    : { background: "transparent", color: NAVY, borderColor: LINE }),
  ...extra,
});
export const input: React.CSSProperties = { width: "100%", padding: "8px 10px", borderRadius: 8, border: `1px solid ${LINE}`, fontSize: 14, background: "#fff", color: "var(--ink)" };
export const label: React.CSSProperties = { display: "block", fontSize: 11, fontWeight: 700, color: DIM, letterSpacing: 0.4, textTransform: "uppercase", marginBottom: 4 };

export function Card({ title, right, children, style, accent }: { title?: React.ReactNode; right?: React.ReactNode; children: React.ReactNode; style?: React.CSSProperties; accent?: string }) {
  return (
    <section className="rounded-lg bg-white" style={{ border: `1px solid ${LINE}`, borderLeft: accent ? `5px solid ${accent}` : undefined, padding: 14, ...style }}>
      {(title || right) && (
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          {title && <h2 className="font-bold m-0" style={{ fontSize: 15, color: NAVY }}>{title}</h2>}
          <span className="ml-auto" />
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

export function Lightbox({ title, onClose, children, wide }: { title: React.ReactNode; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k); document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", k); document.body.style.overflow = ""; };
  }, [onClose]);
  return (
    <div className="fixed inset-0 flex items-start justify-center" style={{ zIndex: 70, background: "rgba(13,22,31,.55)", padding: "4vh 12px", overflowY: "auto" }} onClick={onClose} role="presentation">
      <div className="rounded-lg bg-white w-full" style={{ maxWidth: wide ? 1040 : 760, minWidth: 0, boxShadow: "0 24px 60px rgba(0,0,0,.35)", overflowX: "hidden" }} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="flex items-center gap-2 px-4 py-3" style={{ borderBottom: `1px solid ${LINE}` }}>
          <h2 className="font-bold m-0 truncate" style={{ fontSize: 16, color: NAVY }}>{title}</h2>
          <button onClick={onClose} className="ml-auto rounded px-2 font-bold" style={{ color: MUTED, fontSize: 18 }} aria-label="Close">×</button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

export const Empty = ({ children }: { children: React.ReactNode }) => <div className="text-sm py-6 text-center" style={{ color: MUTED }}>{children}</div>;
export const Err = ({ e }: { e: string | null }) => e ? <div className="text-sm mt-2 font-semibold" style={{ color: RED }}>{e}</div> : null;

/* ───────────────────────── rich text ───────────────────────── */

/** A pasted picture becomes a hosted link through the one Genie route for it. */
export async function uploadRichImage(file: File): Promise<string> {
  const fd = new FormData(); fd.append("file", file);
  const r = await fetch("/api/rich-image", { method: "POST", body: fd });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.url) throw new Error(j.error || (r.status === 504 ? "The picture took too long to upload — a smaller one, or try again." : "The picture could not be stored."));
  return String(j.url);
}

export function Rich({ html, small }: { html?: string | null; small?: boolean }) {
  if (!html) return null;
  return <div style={{ fontSize: small ? 13 : 14 }}><RichContent text={html} legacy={(s) => <div style={{ whiteSpace: "pre-wrap" }}>{s}</div>} thumbs /></div>;
}

export function RichField({ value, onChange, minHeight = 160, placeholder }: { value: string; onChange: (h: string) => void; minHeight?: number; placeholder?: string }) {
  return <RichTextEditor initial={value} live onChangeHtml={onChange} onUploadImage={uploadRichImage} minHeight={minHeight} placeholder={placeholder} />;
}

/* ───────────────────────── files, with the Drive mark ───────────────────────── */

export const fileHref = (path: string) => `/api/lc/file?path=${encodeURIComponent(path)}`;
const icon = (f: LcFile) => /pdf/i.test(f.mime || f.name) ? "📄" : /image/i.test(f.mime || "") ? "🖼" : /sheet|excel|csv/i.test(f.mime || f.name) ? "📊" : /presentation|ppt/i.test(f.mime || f.name) ? "📽" : "📎";
const mb = (b: number | null) => b ? (b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.round(b / 1024)} KB`) : "";

export function DriveMark({ f, onRetry }: { f: LcFile; onRetry?: () => void }) {
  const s = f.drive_status;
  if (s === "done") return <a href={f.drive_url || "#"} target="_blank" rel="noreferrer" className="rounded px-1.5 font-bold" style={{ fontSize: 10, background: "#E3F3E8", color: GREEN, textDecoration: "none" }} title="Safely kept in the Drive folder">▲ in Drive</a>;
  const t = s === "failed" ? "Drive refused it" : s === "skipped" ? "Not pushed to Drive" : "Pushing to Drive…";
  return (
    <span className="inline-flex items-center gap-1">
      <span className="rounded px-1.5 font-bold" style={{ fontSize: 10, background: s === "failed" ? "#FDECEA" : "#FFF7E6", color: s === "failed" ? RED : "#B45309" }} title={f.drive_error || t}>{t}</span>
      {onRetry && s !== "pending" && <button onClick={onRetry} className="font-bold" style={{ fontSize: 10, color: ORANGE }}>retry</button>}
    </span>
  );
}

export function Files({ files, boot, mayRemove, onChange, compact }: { files: LcFile[]; boot: Boot | null; mayRemove?: boolean; onChange?: () => void; compact?: boolean }) {
  if (!files.length) return null;
  const retry = async (id: string) => { try { await api("/api/lc/file", { action: "retry", id }); } catch (e) { alert(String((e as Error).message)); } onChange?.(); };
  const remove = async (f: LcFile) => { if (!confirm(`Remove ${f.name} from Genie? The Drive copy, if any, stays.`)) return; try { await api("/api/lc/file", { action: "remove", id: f.id }); } catch (e) { alert(String((e as Error).message)); } onChange?.(); };
  return (
    <div className="grid gap-1.5" style={{ gridTemplateColumns: compact ? "1fr" : "repeat(auto-fill, minmax(260px, 1fr))" }}>
      {files.map((f) => (
        <div key={f.id} className="flex items-center gap-2 rounded px-2.5 py-1.5" style={{ background: "var(--paper)", minWidth: 0 }}>
          <span style={{ fontSize: 18 }}>{icon(f)}</span>
          <div className="min-w-0 flex-1">
            <a href={fileHref(f.path)} target="_blank" rel="noreferrer" className="font-semibold block truncate" style={{ fontSize: 13, color: NAVY, textDecoration: "none" }}>{f.name}</a>
            <div className="flex items-center gap-2 flex-wrap" style={{ fontSize: 10, color: MUTED }}>
              {mb(f.bytes)} {f.uploaded_by && <>· {leaderOf(boot, f.uploaded_by).name}</>} · {dmy(f.created_at)} <DriveMark f={f} onRetry={() => retry(f.id)} />
            </div>
          </div>
          {mayRemove && <button onClick={() => remove(f)} style={{ color: MUTED, fontSize: 14 }} title="Remove">✕</button>}
        </div>
      ))}
    </div>
  );
}

export function FileDrop({ refKind, refId, onDone, label: lbl = "+ Attach files", accept }: { refKind: string; refId: string; onDone: () => void; label?: string; accept?: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const up = async (fl: FileList) => {
    const fd = new FormData(); fd.append("ref_kind", refKind); fd.append("ref_id", refId); [...fl].forEach((x) => fd.append("file", x));
    setBusy(true);
    try { const r = await fetch("/api/lc/file", { method: "POST", body: fd }); const j = await r.json(); if (!r.ok) throw new Error(j.error); onDone(); }
    catch (e) { alert(String((e as Error).message || e)); }
    setBusy(false);
  };
  return (
    <>
      <input ref={ref} type="file" multiple hidden accept={accept} onChange={(e) => e.target.files?.length && up(e.target.files)} />
      <button onClick={() => ref.current?.click()} disabled={busy} style={btn("soft", { padding: "5px 10px", fontSize: 12 })}>{busy ? "Uploading…" : lbl}</button>
    </>
  );
}

/* ───────────────────────── reactions ───────────────────────── */

export function Thumbs({ up, down, question, mine, onReact, size = 13 }: { up: number; down: number; question?: number; mine: string | null; onReact: (v: string) => void; size?: number }) {
  const B = ({ v, glyph, n, title }: { v: string; glyph: string; n: number; title: string }) => (
    <button onClick={(e) => { e.stopPropagation(); onReact(mine === v ? "none" : v); }} title={title}
      className="rounded px-2 inline-flex items-center gap-1 tnum" style={{ fontSize: size, height: 26, border: `1px solid ${mine === v ? ORANGE : LINE}`, background: mine === v ? "#FFF1E8" : "#fff", color: NAVY, fontWeight: 700 }}>
      <span>{glyph}</span>{n}
    </button>
  );
  return (
    <span className="inline-flex gap-1">
      <B v="up" glyph="👍" n={up} title="Agree" />
      <B v="down" glyph="👎" n={down} title="Disagree" />
      {question !== undefined && <B v="question" glyph="❓" n={question} title="Needs clarity" />}
    </span>
  );
}

/**
 * THE EYE (Dr Raghu, 10 Oct 2026: "show viewed with the eye icon. the ones
 * who didn't vote are only viewed!"). The count, the names on hover, and —
 * when `voted` is given — the line of those who looked and did not vote.
 */
export function Eye({ boot, viewed, voted, size = 12, withList }: { boot: Boot | null; viewed: string[]; voted?: string[]; size?: number; withList?: boolean }) {
  const v = [...new Set(viewed.map((e) => e.toLowerCase()))];
  const only = voted ? v.filter((e) => !voted.map((x) => x.toLowerCase()).includes(e)) : [];
  const names = (es: string[]) => es.map((e) => leaderOf(boot, e).name).join(", ");
  return (
    <span className="inline-flex items-center gap-1.5 flex-wrap">
      <span className="inline-flex items-center gap-1 rounded px-1.5 tnum" style={{ fontSize: size, height: 22, border: `1px solid ${LINE}`, background: "#fff", color: DIM, fontWeight: 700 }} title={v.length ? `Viewed by ${names(v)}` : "Nobody has opened this yet"}>👁 {v.length}</span>
      {withList && v.length > 0 && <span style={{ fontSize: 11, color: MUTED }}>viewed by {names(v)}</span>}
      {withList && voted && only.length > 0 && <span style={{ fontSize: 11, color: "#B45309" }}>· only viewed, not voted: {names(only)}</span>}
    </span>
  );
}

export const Names = ({ boot, emails }: { boot: Boot | null; emails: string[] }) => emails.length ? <span style={{ fontSize: 11, color: MUTED }}>{emails.map((e) => leaderOf(boot, e).name).join(", ")}</span> : null;
