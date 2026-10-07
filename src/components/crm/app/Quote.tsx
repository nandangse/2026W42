"use client";
// split out of CrmApp.tsx (Genie 5.0.1.1) — one file per tab, loaded when opened
import { useCallback, useEffect, useRef, useState } from "react";
import { QUOTE_VARIABLES } from "@/crm/quote-vars";
import { swallow } from "@/lib/swallow";

import RichTextEditor, { RichContent } from "../../RichTextEditor";

import { BORDER, INK, MUTED, NAVY, NAVY_SOFT, ORANGE, Row } from "./shared";
import { groupIn, isEmailish, money, ungroup } from "./Widgets";
import { SituationalTab } from "./Product";
import { LinkAutocomplete, RichText } from "./Record";

/**
 * ⇧ PUSH TO ERP (Dr Raghu, 31 Aug 2026: "Can this be pushed back to erp?
 * along with the modification?").
 *
 * It can — the saved token is his own ERP user, which holds write on Item,
 * Item Price and File. But the ERP's Item table is the company's master
 * record, and a button that quietly rewrites it is a button nobody can trust.
 * So this reads BOTH sides first and shows them side by side; only what is
 * ticked is written, and only where the two actually differ.
 *
 * The price is not a field on the Item — it is a row in the Standard Selling
 * price list, updated there or created if the item never carried one.
 */
export function ErpPushBox({ pid, onClose }: { pid: string; onClose: () => void }) {
  type Side = { genie: unknown; erp: unknown; differs: boolean; needsUpload?: boolean; hasRow?: boolean };
  const [d, setD] = useState<{ sku: string; erp_url: string; diff: Record<string, Side> } | null>(null);
  const [pick, setPick] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState<{ pushed: string[]; failed: { field: string; why: string }[] } | null>(null);

  useEffect(() => {
    fetch("/api/crm/product-extra", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "erp_diff", product_id: pid }),
    })
      .then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error || "The ERP did not answer"); return j; })
      .then((j) => { setD(j); setPick(Object.entries(j.diff).filter(([, v]) => (v as Side).differs).map(([k]) => k)); })
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, [pid]);

  const show = (v: unknown) => {
    const s = String(v ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    return s ? (s.length > 150 ? s.slice(0, 150) + "…" : s) : "— empty —";
  };
  const rows: [string, string][] = [["description", "Description"], ["image", "Image"], ["price", "Approved price (Standard Selling)"]];
  const anyDiff = d ? rows.some(([k]) => d.diff[k]?.differs) : false;

  const run = async () => {
    setBusy(true); setErr("");
    const r = await fetch("/api/crm/product-extra", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "erp_push", product_id: pid, fields: pick }),
    });
    const j = await r.json();
    setBusy(false);
    if (!r.ok) { setErr(j.error || "The ERP refused the write"); return; }
    setDone({ pushed: j.pushed || [], failed: j.failed || [] });
  };

  return (
    <div onClick={onClose} className="fixed inset-0 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.45)", zIndex: 70 }}>
      <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-lg w-full" style={{ maxWidth: 680, maxHeight: "90vh", overflow: "auto" }}>
        <div className="flex items-center justify-between px-4 py-2.5" style={{ background: NAVY, borderRadius: "6px 6px 0 0" }}>
          <div className="text-white font-bold text-sm">Push to the ERP{d ? ` — Item ${d.sku}` : ""}</div>
          <button onClick={onClose} className="text-white font-bold px-2">✕</button>
        </div>
        <div className="p-4">
          {!d && !err && <div className="text-sm" style={{ color: MUTED }}>Reading both sides…</div>}
          {err && <div className="rounded p-2 mb-2 text-sm" style={{ background: "#FBEAE8", color: "#8E2C20" }}>{err}</div>}

          {d && !done && (
            <>
              <div className="text-xs mb-3 rounded p-2" style={{ background: "#FCF6E8", color: "#8A6D1A", lineHeight: 1.6 }}>
                This writes into the ERP&apos;s <b>own master record</b> for this item — everyone who reads
                nandanerp reads what goes from here. Only what you tick is written, and only where the two
                differ. Nothing else on the Item is touched.
              </div>
              {!anyDiff && <div className="text-sm mb-2" style={{ color: "#1A7F4E", fontWeight: 600 }}>The two already agree — there is nothing to push.</div>}
              {rows.map(([k, label]) => {
                const s = d.diff[k];
                if (!s) return null;
                return (
                  <div key={k} className="border rounded p-2 mb-2" style={{ borderColor: s.differs ? ORANGE : BORDER }}>
                    <label className="flex items-center gap-2 text-sm font-bold" style={{ color: s.differs ? INK : MUTED, cursor: s.differs ? "pointer" : "default" }}>
                      <input type="checkbox" disabled={!s.differs} checked={pick.includes(k)}
                        onChange={(e) => setPick((p) => (e.target.checked ? [...p, k] : p.filter((x) => x !== k)))}
                        style={{ accentColor: ORANGE, width: 14, height: 14 }} />
                      {label} {!s.differs && <span className="font-normal" style={{ color: MUTED }}>— already the same</span>}
                    </label>
                    {s.differs && (
                      <div className="text-xs mt-1.5" style={{ lineHeight: 1.6 }}>
                        <div><b style={{ color: MUTED }}>ERP now:</b> {k === "price" ? money(s.erp) : show(s.erp)}</div>
                        <div><b style={{ color: "#1A7F4E" }}>Genie:</b> {k === "price" ? money(s.genie) : show(s.genie)}</div>
                        {k === "image" && s.needsUpload && <div style={{ color: MUTED }}>The picture lives in Genie, so it is uploaded to the ERP and attached to the Item.</div>}
                        {k === "price" && !s.hasRow && <div style={{ color: MUTED }}>The item has no Standard Selling row — one is created.</div>}
                      </div>
                    )}
                  </div>
                );
              })}
              <label className="flex items-center gap-2 text-sm font-bold border rounded p-2 mb-2" style={{ borderColor: BORDER, cursor: "pointer" }}>
                <input type="checkbox" checked={pick.includes("attachments")}
                  onChange={(e) => setPick((p) => (e.target.checked ? [...p, "attachments"] : p.filter((x) => x !== "attachments")))}
                  style={{ accentColor: ORANGE, width: 14, height: 14 }} />
                Attachments <span className="font-normal" style={{ color: MUTED }}>— send Genie&apos;s files up as ERP attachments</span>
              </label>
              <div className="flex gap-2 mt-3">
                <button onClick={() => void run()} disabled={busy || !pick.length}
                  className="rounded px-4 py-1.5 text-sm font-bold text-white" style={{ background: busy || !pick.length ? "#B9BEC4" : ORANGE }}>
                  {busy ? "Writing to the ERP…" : `⇧ Push ${pick.length} thing${pick.length === 1 ? "" : "s"}`}
                </button>
                <a href={d.erp_url} target="_blank" rel="noreferrer" className="rounded px-3 py-1.5 text-sm font-bold" style={{ color: NAVY }}>Open on the ERP ↗</a>
                <button onClick={onClose} className="ml-auto rounded px-3 py-1.5 text-sm font-bold" style={{ color: MUTED }}>Cancel</button>
              </div>
            </>
          )}

          {done && (
            <>
              <div className="text-sm" style={{ lineHeight: 1.8 }}>
                {done.pushed.length > 0
                  ? <><b style={{ color: "#1A7F4E" }}>Written to the ERP:</b> {done.pushed.join(", ")}.</>
                  : <b style={{ color: "#8E2C20" }}>Nothing was written.</b>}
                {done.failed.length > 0 && (
                  <div className="mt-1" style={{ color: "#8E2C20" }}>
                    {done.failed.map((f, i) => (<div key={i}>✕ {f.field} — {f.why}</div>))}
                  </div>
                )}
              </div>
              <div className="flex gap-2 mt-3">
                {d && <a href={d.erp_url} target="_blank" rel="noreferrer" className="rounded px-3 py-1.5 text-sm font-bold" style={{ color: NAVY }}>See it on the ERP ↗</a>}
                <button onClick={onClose} className="rounded px-4 py-1.5 text-sm font-bold text-white" style={{ background: ORANGE }}>Close</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** Terms & Conditions and the Covering Letter (Dr Raghu, 30 Aug 2026) —
 *  one tab shape for both: a dropdown of Quote Templates; choosing one
 *  DUMPS its default text in, then the hand edits. The letter also gets
 *  "Use Genie to beautify", twice at most. */
/** The document desk (Dr Raghu, 30 Aug 2026): the Covering Letter tab holds
 *  the whole printed quote — letter, situational, terms, cover, back, about,
 *  and Review Quote where the PDF assembles with a DRAFT watermark. */
export function QuoteDocDesk({ row, onSaved }: { row: Row; onSaved: (r?: Row) => void }) {
  const [sub, setSub] = useState("letter");
  const T = [
    ["letter", "Covering Letter"], ["situational", "Situational Analysis"], ["terms", "Terms and Conditions"],
    ["cover", "Cover Page"], ["back", "Back Page"], ["about", "About Nandan"], ["review", "🖨 Review Quote"],
  ] as const;
  return (
    <div>
      <div className="flex gap-1 px-4 pt-3 flex-wrap" style={{ borderBottom: `1px solid ${BORDER}`, background: "#FAF9F5" }}>
        {T.map(([k, lab]) => (
          <button key={k} onClick={() => setSub(k)} className="px-3 py-1.5 text-xs font-bold rounded-t"
            style={{ background: sub === k ? "#fff" : "#F2F0EA", border: `1px solid ${BORDER}`,
              borderBottom: sub === k ? "1px solid #fff" : `1px solid ${BORDER}`, marginBottom: -1,
              color: sub === k ? ORANGE : "var(--dim)" }}>
            {lab}
          </button>
        ))}
      </div>
      {sub === "review" ? <ReviewQuoteTab row={row} onSaved={onSaved} />
        : sub === "situational" ? <SituationalTab row={row} onSaved={onSaved} />
        : <QuoteTemplateTab row={row} onSaved={onSaved} kind={sub as TplKind} />}
    </div>
  );
}

/** Review Quote: tick the sections, watch the document assemble below —
 *  every page wearing the Nandan header, the confidential footer, and the
 *  DRAFT watermark. Download opens the browser's Save-as-PDF. */
export function ReviewQuoteTab({ row, onSaved }: { row: Row; onSaved: (r?: Row) => void }) {
  const rid = String(row.id ?? "");
  const SECTIONS: [string, string][] = [
    ["cover", "Cover Page"], ["letter", "Covering Letter"], ["situational", "Situational Analysis"],
    ["items", "Items (with Rate)"], ["items_split", "Items & Rate separate"],
    ["terms", "Terms and Conditions"], ["about", "About Nandan"], ["back", "Back Page"],
  ];
  const chosen = Array.isArray(row.print_sections)
    ? (row.print_sections as unknown[]).map(String)
    : SECTIONS.map(([k]) => k);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [submitMode, setSubmitMode] = useState<"review" | "client" | null>(null);
  const toggle = async (k: string) => {
    // the two item modes are one choice, never both (Dr Raghu, 30 Aug 2026)
    let next = chosen.includes(k) ? chosen.filter((x) => x !== k) : [...chosen, k];
    if (k === "items" && next.includes("items")) next = next.filter((x) => x !== "items_split");
    if (k === "items_split" && next.includes("items_split")) next = next.filter((x) => x !== "items");
    setBusy(true); setErr("");
    try {
      const r = await fetch(`/api/crm/quotation?id=${encodeURIComponent(rid)}`, {
        method: "PATCH", headers: { "content-type": "application/json" },
        body: JSON.stringify({ print_sections: next }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Could not save");
      onSaved(j.row as Row);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };
  const url = `/api/crm/quote-doc?id=${encodeURIComponent(rid)}&sections=${encodeURIComponent(chosen.join(","))}`;
  return (
    <div className="p-4">
      <div className="flex items-center gap-3 flex-wrap mb-2">
        {SECTIONS.map(([k, lab]) => (
          <label key={k} className="text-xs font-semibold flex items-center gap-1.5" style={{ color: "#3A4652" }}>
            <input type="checkbox" checked={chosen.includes(k)} disabled={busy} onChange={() => void toggle(k)} style={{ accentColor: NAVY }} />
            {lab}
          </label>
        ))}
        <a href={`/api/crm/quote-pdf?id=${encodeURIComponent(rid)}`} target="_blank" rel="noreferrer"
          title="A real PDF, pressed server-side — no print dialog, no slicing"
          className="rounded px-3 py-1.5 text-xs font-bold text-white ml-auto" style={{ background: ORANGE, textDecoration: "none" }}>
          ⬇ Download PDF{String(row.status) === "submitted" ? "" : " (DRAFT)"}
        </a>
        <button onClick={() => setSubmitMode("review")}
          className="rounded px-3 py-1.5 text-xs font-bold" style={{ background: "#EEF3F8", color: NAVY, border: "1px solid #C9D6E2" }}>
          📨 Submit to Raghu for Review
        </button>
        <button onClick={() => setSubmitMode("client")}
          className="rounded px-3 py-1.5 text-xs font-bold text-white" style={{ background: "var(--green)" }}>
          ✈ Submit to Client
        </button>
      </div>
      {submitMode && (
        <SubmitQuoteModal row={row} mode={submitMode} onClose={() => setSubmitMode(null)}
          onSent={() => { setSubmitMode(null); onSaved(); }} />
      )}
      <div className="text-xs mb-2" style={{ color: MUTED }}>
        Items print with rates on their own pages. Every page: Nandan logo up top; Quotation No + Date, Private and Confidential, Page x of y below. The DRAFT watermark rides until the quote is sent.
        {err && <span className="ml-2 font-semibold" style={{ color: "#8E2C20" }}>{err}</span>}
      </div>
      <iframe key={chosen.join(",") + String(row.updated_at ?? "")} src={url} title="Quote preview"
        style={{ width: "100%", height: "calc(100vh - 320px)", border: `1px solid ${BORDER}`, borderRadius: 8, background: "#666" }} />
    </div>
  );
}

export type TplKind = "terms" | "letter" | "cover" | "back" | "about";

export const TPL_LABEL: Record<TplKind, string> = {
  terms: "Terms set", letter: "Letter flavour", cover: "Cover page", back: "Back page", about: "About Nandan",
};

export function QuoteTemplateTab({ row, onSaved, kind }: { row: Row; onSaved: (r?: Row) => void; kind: TplKind }) {
  const rid = String(row.id ?? "");
  const tplField = `${kind}_template`;
  const textField = `${kind}_text`;
  const stored = String(row[textField] ?? "").trim();
  const chosen = String(row[tplField] ?? "");
  const runs = Number(row.letter_genie_runs) || 0;
  const [tpls, setTpls] = useState<{ id: string; name: string; content: string }[]>([]);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState<"save" | "genie" | "dump" | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    fetch(`/api/crm/quote_template?f_kind=${kind}&limit=100`, { cache: "no-store" })
      .then(async (r) => {
        const j = await r.json();
        setTpls(((j.rows ?? []) as { id: string; name: string; content: string; sort_order?: number }[])
          .sort((a, b) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0)));
      })
      .catch(() => setTpls([]));
  }, [kind]);

  const patch = async (fields: Record<string, unknown>) => {
    const r = await fetch(`/api/crm/quotation?id=${encodeURIComponent(rid)}`, {
      method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(fields),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || "Could not save");
    onSaved(j.row as Row);
  };
  const choose = async (name: string) => {
    if (!name) return;
    const t = tpls.find((x) => x.name === name);
    if (!t) return;
    if (stored && !window.confirm(`Replace the current text with the "${name}" defaults?`)) return;
    setBusy("dump"); setErr("");
    try { await patch({ [tplField]: name, [textField]: t.content }); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(null); }
  };
  const beautify = async () => {
    setBusy("genie"); setErr("");
    try {
      const r = await fetch("/api/crm/letter-beautify", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ quotation_id: rid }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Genie could not beautify it");
      const rr = await (await fetch(`/api/crm/quotation?id=${encodeURIComponent(rid)}`, { cache: "no-store" })).json();
      if (rr?.row) onSaved(rr.row as Row);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(null); }
  };

  return (
    <div className="p-4">
      <div className="flex items-center gap-3 mb-2 flex-wrap">
        <label className="text-xs font-semibold flex items-center gap-1.5" style={{ color: MUTED }}>
          {TPL_LABEL[kind]}
          <select value={chosen} disabled={busy !== null} onChange={(e) => void choose(e.target.value)}
            className="px-2 py-1 rounded text-xs border font-bold" style={{ borderColor: chosen ? ORANGE : BORDER, background: "#fff", color: INK }}>
            <option value="">— choose —</option>
            {tpls.map((t) => <option key={t.id} value={t.name}>{t.name}</option>)}
          </select>
        </label>
        {!editing && <button title="Edit by hand" onClick={() => setEditing(true)} style={{ fontSize: 13, opacity: 0.7 }}>✏️ Edit</button>}
        {kind === "letter" && (
          <button disabled={busy !== null || runs >= 2 || !stored} onClick={() => void beautify()}
            className="rounded px-3 py-1 text-xs font-bold text-white"
            style={{ background: busy === null && runs < 2 && stored ? "#7C3AED" : "#B9BEC4" }}
            title={stored ? "" : "Pick a flavour first — Genie polishes, it does not start from nothing"}>
            {busy === "genie" ? "Genie is polishing…" : `✨ Use Genie to beautify (${Math.max(0, 2 - runs)} left)`}
          </button>
        )}
        {kind === "letter" && runs >= 2 && <span className="text-xs" style={{ color: MUTED }}>Beautified twice — the letter is yours now.</span>}
        <span className="text-xs" style={{ color: MUTED }}>defaults live in Masters → Quote Templates</span>
        {err && <span className="text-xs font-semibold" style={{ color: "#8E2C20" }}>{err}</span>}
      </div>
      {/* THE VARIABLES, SAID OUT LOUD (Dr Raghu, 31 Aug 2026: "in the
          standard sales how to insert qtn no and date? and client name? in
          template?"). They already worked — the terms, the letter, the cover
          and the back page have all been filled on print for as long as they
          have existed. Nothing on the screen ever said so, which is why the
          Proposal Number line sat empty. A feature nobody is told about is a
          feature nobody has. */}
      <div className="text-xs rounded p-2 mb-2" style={{ background: NAVY_SOFT, color: NAVY, lineHeight: 1.7 }}>
        <b>Type any of these and the printed quote fills them in:</b>{" "}
        <code>{"{{quote_no}}"}</code> the quotation number ·{" "}
        <code>{"{{quote_date}}"}</code> its date ·{" "}
        <code>{"{{customer}}"}</code> the client&apos;s name ·{" "}
        <code>{"{{contact}}"}</code> the person it is addressed to ·{" "}
        <code>{"{{sales_person}}"}</code> who owns the quote ·{" "}
        <code>{"{{authorized_by}}"}</code> ·{" "}
        <code>{"{{subject}}"}</code> ·{" "}
        <code>{"{{valid_until}}"}</code> ·{" "}
        <code>{"{{delivery}}"}</code>
        <div style={{ marginTop: 4 }}>
          So <code>{"Proposal Number : {{quote_no}}"}</code> prints as <b>Proposal Number : {String(row.quote_no ?? "NGSE/QTN/…")}</b>.
          Spaces inside the braces are fine — <code>{"{{ sales_person }}"}</code> works too. A name that is not on
          this list stays visible exactly as typed, so a spelling mistake shows up here rather than on a client&apos;s copy.
          They are replaced only on the PDF, so one template serves every quote.
        </div>
      </div>
      {editing ? (
        <RichTextEditor initial={stored} busy={busy === "save"} minHeight={300} variables={QUOTE_VARIABLES}
          onUploadImage={async (f) => {
            const fd = new FormData();
            fd.append("target_type", "quotation"); fd.append("target_id", rid); fd.append("file", f);
            const r = await fetch("/api/crm/opp-attach", { method: "POST", body: fd });
            const j = await r.json();
            if (!r.ok) throw new Error(j.error || "Upload failed");
            return String(j.url);
          }}
          onCancel={() => setEditing(false)}
          onSave={(v) => {
            setBusy("save");
            patch({ [textField]: v }).then(() => setEditing(false))
              .catch((e) => setErr(e instanceof Error ? e.message : String(e)))
              .finally(() => setBusy(null));
          }} />
      ) : (
        <div className="rounded border p-4 text-sm" style={{ borderColor: BORDER, lineHeight: 1.7, maxWidth: "80ch" }}>
          {stored
            ? <RichContent text={stored} legacy={(s2) => <RichText text={s2} />} />
            : <span style={{ color: MUTED }}>Nothing here yet — choose from the dropdown above and its defaults dump in{["cover", "back", "about"].includes(kind) ? " (the standard template prints even unchosen)" : ""}.</span>}
        </div>
      )}
    </div>
  );
}

/* ============================== QUOTE ITEMS (Dr Raghu, 30 Aug 2026)
   "Sr No - Item Group - Item - Rate - Qty - Amount… arrows to indent or
   move… floating Net Total, Discount, Taxes from masters by address,
   Grand Total in words, show decimals, Authorized By." */

export const W_ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve",
  "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];

export const W_TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

export const w2 = (n: number): string => n < 20 ? W_ONES[n] : `${W_TENS[Math.floor(n / 10)]}${n % 10 ? " " + W_ONES[n % 10] : ""}`;

export const w3 = (n: number): string => n < 100 ? w2(n) : `${W_ONES[Math.floor(n / 100)]} Hundred${n % 100 ? " " + w2(n % 100) : ""}`;

/** Lakhs and crores — the Indian ear (Dr Raghu, 30 Aug 2026). */
export function wordsIndian(n: number): string {
  if (n === 0) return "Zero";
  const parts: string[] = [];
  const crore = Math.floor(n / 1e7), lakh = Math.floor((n % 1e7) / 1e5), thou = Math.floor((n % 1e5) / 1000), rest = n % 1000;
  if (crore) parts.push(`${crore > 99 ? wordsIndian(crore) : w2(crore)} Crore`);
  if (lakh) parts.push(`${w2(lakh)} Lakh`);
  if (thou) parts.push(`${w2(thou)} Thousand`);
  if (rest) parts.push(w3(rest));
  return parts.join(" ");
}

/** Thousands and millions — for USD and EUR. */
export function wordsWestern(n: number): string {
  if (n === 0) return "Zero";
  const parts: string[] = [];
  const bil = Math.floor(n / 1e9), mil = Math.floor((n % 1e9) / 1e6), thou = Math.floor((n % 1e6) / 1000), rest = n % 1000;
  if (bil) parts.push(`${w3(bil)} Billion`);
  if (mil) parts.push(`${w3(mil)} Million`);
  if (thou) parts.push(`${w3(thou)} Thousand`);
  if (rest) parts.push(w3(rest));
  return parts.join(" ");
}

export function amountInWords(v: number, currency: string, withDecimals: boolean): string {
  const i = Math.floor(Math.abs(v)), frac = Math.round((Math.abs(v) - i) * 100);
  const inr = currency === "INR";
  const main = inr ? wordsIndian(i) : wordsWestern(i);
  const unit = inr ? "Rupees" : currency === "USD" ? "US Dollars" : currency === "EUR" ? "Euros" : currency;
  const sub = inr ? "Paise" : "Cents";
  return `${unit} ${main}${withDecimals && frac ? ` and ${w2(frac)} ${sub}` : ""} Only`;
}

export type QLine = {
  id: string; line_no: number; indent: number; item_group: string | null;
  product_id: string | null; description: string; quantity: number;
  unit_price: number; line_total: number; discountable: boolean; is_optional: boolean;
  specs?: { rich?: string; image?: string } | null;
};

/** Digits with Indian commas while typing — "545000" reads 5,45,000. */
export type FxRow = { code: string; name: string; symbol: string; inr_per_unit: number; as_of: string; source?: string | null };

export type TaxRow = { id: string; name: string; total_pct: number; is_default: boolean; sort_order?: number; components?: { name: string; pct: number }[] };

export function QuoteItemsTab({ quote, onSaved }: { quote: Row; onSaved: (r?: Row) => void }) {
  const qid = String(quote.id ?? "");
  const [q, setQ] = useState<Row>(quote);
  const [lines, setLines] = useState<QLine[] | null>(null);
  const [taxes, setTaxes] = useState<TaxRow[]>([]);
  /* THE CURRENCY LIST IS A TABLE, NOT A CONSTANT (Dr Raghu, 8 Sep 2026:
     "later on we can of course add more currencies also. It will come from
     the table"). Until 0060 has run this is empty and the dropdown falls
     back to the three it always had. */
  const [fx, setFx] = useState<FxRow[]>([]);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [ghost, setGhost] = useState({ item_group: "", description: "", unit_price: "", quantity: "1", product_id: "" });
  // Item Group comes from the MASTERS (Dr Raghu, 30 Aug 2026) — the
  // catalogue's own families; choosing one throttles the item search
  const [groups, setGroups] = useState<string[]>([]);
  const [openLine, setOpenLine] = useState<QLine | null>(null);
  useEffect(() => {
    fetch("/api/crm/product?groupby=item_group", { cache: "no-store" })
      .then(async (r) => {
        const j = await r.json();
        setGroups(((j.groups ?? []) as { key: string }[]).map((g) => g.key).filter(Boolean).sort((a, b) => a.localeCompare(b)));
      })
      .catch(() => setGroups([]));
  }, []);
  const [draft, setDraft] = useState<Record<string, Partial<Record<keyof QLine, string>>>>({});
  const [discPct, setDiscPct] = useState<string | null>(null);
  const taxPicked = useRef(false);

  const reloadQuote = useCallback(async () => {
    try {
      const j = await (await fetch(`/api/crm/quotation?id=${encodeURIComponent(qid)}`, { cache: "no-store" })).json();
      if (j?.row) { setQ(j.row as Row); onSaved(j.row as Row); }
    } catch (e) { swallow("crm/CrmApp", e); /* stale totals heal on the next move */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qid]);
  const reloadLines = useCallback(async () => {
    try {
      const j = await (await fetch(`/api/crm/quotation_line?f_quotation_id=${encodeURIComponent(qid)}&limit=200`, { cache: "no-store" })).json();
      const rows = ((j.rows ?? []) as QLine[]).slice().sort((a, b) => a.line_no - b.line_no);
      setLines(rows);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  }, [qid]);
  useEffect(() => { setQ(quote); }, [quote]);
  useEffect(() => {
    void reloadLines();
    fetch("/api/crm/tax_master?limit=50", { cache: "no-store" })
      .then(async (r) => { const j = await r.json(); setTaxes(((j.rows ?? []) as TaxRow[]).sort((a, b) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0))); })
      .catch(() => setTaxes([]));
    fetch("/api/crm/fx", { cache: "no-store" })
      .then(async (r) => { const j = await r.json(); setFx((j.rows ?? []) as FxRow[]); })
      .catch(() => setFx([]));
  }, [reloadLines]);

  const patchQuote = async (fields: Record<string, unknown>) => {
    const r = await fetch(`/api/crm/quotation?id=${encodeURIComponent(qid)}`, {
      method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(fields),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || "Could not save");
    setQ(j.row as Row); onSaved(j.row as Row);
  };

  // IGST outside Maharashtra, CGST + SGST within — decided by the quote's
  // address, once, the first time this desk opens without a scheme
  useEffect(() => {
    if (taxPicked.current || !taxes.length || q.tax_id) return;
    taxPicked.current = true;
    void (async () => {
      let inMaha = false, known = false;
      if (q.address_id) {
        try {
          const j = await (await fetch(`/api/crm/address?id=${encodeURIComponent(String(q.address_id))}`, { cache: "no-store" })).json();
          const st = String(j?.row?.state ?? "").toLowerCase();
          if (st) { known = true; inMaha = st.includes("maharashtra"); }
        } catch (e) { swallow("crm/CrmApp", e); /* fall to the default */ }
      }
      const pick = known
        ? taxes.find((t) => (inMaha ? /cgst/i.test(t.name) : /igst/i.test(t.name)))
        : taxes.find((t) => t.is_default);
      if (pick) { try { await patchQuote({ tax_id: pick.id }); } catch (e) { swallow("crm/CrmApp", e); /* hand can pick */ } }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taxes, q.tax_id, q.address_id]);

  const patchLine = async (id: string, fields: Record<string, unknown>) => {
    setBusy(true); setErr("");
    try {
      const r = await fetch(`/api/crm/quotation_line?id=${encodeURIComponent(id)}`, {
        method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(fields),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Could not save the line");
      await reloadLines(); await reloadQuote();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };
  const addLine = async () => {
    const desc = ghost.description.trim();
    if (!desc) return;
    setBusy(true); setErr("");
    try {
      const r = await fetch("/api/crm/quotation_line", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({
          quotation_id: qid, line_no: (lines?.length ? Math.max(...lines.map((l) => l.line_no)) : 0) + 1,
          description: desc, item_group: ghost.item_group.trim() || null,
          product_id: ghost.product_id || null,
          unit_price: Math.max(0, Number(ghost.unit_price) || 0),
          quantity: Number(ghost.quantity) > 0 ? Number(ghost.quantity) : 1,
          // every NOT NULL column travels explicitly — the generic route
          // writes a missing field as null, and the table refuses null
          unit_cost: 0, discount_pct: 0, gst_rate: 18, is_optional: false,
          uom: "Nos", discountable: true, indent: 0,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Could not add the item");
      setGhost({ item_group: "", description: "", unit_price: "", quantity: "1", product_id: "" });
      await reloadLines(); await reloadQuote();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };
  const move = async (i: number, dir: -1 | 1) => {
    if (!lines) return;
    const a = lines[i], b = lines[i + dir];
    if (!a || !b) return;
    setBusy(true); setErr("");
    try {
      // three steps through a parking number — line_no is unique per quote
      const park = -Math.abs(a.line_no) - 1000;
      for (const [id, no] of [[a.id, park], [b.id, a.line_no], [a.id, b.line_no]] as const) {
        const r = await fetch(`/api/crm/quotation_line?id=${encodeURIComponent(String(id))}`, {
          method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ line_no: no }),
        });
        if (!r.ok) throw new Error((await r.json()).error || "Could not move the line");
      }
      await reloadLines(); await reloadQuote();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };
  const delLine = async (id: string) => {
    if (lines && lines.length <= 1) { setErr("A quote keeps at least one item — add another before removing this one."); return; }
    if (!window.confirm("Remove this item?")) return;
    setBusy(true); setErr("");
    try {
      const r = await fetch(`/api/crm/quotation_line?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!r.ok) throw new Error((await r.json()).error || "Could not remove");
      await reloadLines(); await reloadQuote();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };
  // Sr No: main lines count 1, 2, 3…; an indented line reads 1.1, 1.2
  const srOf = (i: number): string => {
    if (!lines) return "";
    let major = 0, minor = 0;
    let label = "";
    for (let k = 0; k <= i; k++) {
      if ((lines[k].indent ?? 0) === 0) { major++; minor = 0; label = String(major); }
      else { minor++; label = `${Math.max(major, 1)}.${minor}`; }
    }
    return label;
  };

  const currency = String(q.currency ?? "INR");
  const dec = q.show_decimals === true;
  const fm = (v: unknown) => {
    const n = Number(v) || 0;
    const s = n.toLocaleString(currency === "INR" ? "en-IN" : "en-US", { minimumFractionDigits: dec ? 2 : 0, maximumFractionDigits: dec ? 2 : 0 });
    return `${currency === "INR" ? "₹" : currency === "USD" ? "$" : currency === "EUR" ? "€" : currency + " "} ${s}`;
  };
  const D = (l: QLine, k: "item_group" | "description" | "unit_price" | "quantity") =>
    draft[l.id]?.[k] !== undefined ? String(draft[l.id]![k]) : String(l[k] ?? (k === "item_group" ? "" : l[k]));
  const setD = (id: string, k: string, v: string) => setDraft((cur) => ({ ...cur, [id]: { ...cur[id], [k]: v } }));
  const commitD = (l: QLine, k: "item_group" | "description" | "unit_price" | "quantity") => {
    const v = draft[l.id]?.[k];
    if (v === undefined || String(l[k] ?? "") === v) return;
    if (k === "description" && !String(v).trim()) { setD(l.id, k, l.description); return; }
    let out: unknown = v;
    if (k === "unit_price") out = Math.max(0, Number(v) || 0);
    // qty can never be negative (Dr Raghu, 30 Aug 2026)
    if (k === "quantity") { const n = Number(v); out = n > 0 ? n : 1; setD(l.id, k, String(out)); }
    void patchLine(l.id, { [k]: out });
  };

  // the foot adds up exactly what the grid shows (Dr Raghu, 30 Aug 2026:
  // "net total should add up all the above amounts") — the database's own
  // recalc stores the same law, this is its live mirror
  const real = (lines ?? []).filter((l) => !l.is_optional);
  // the write-item row counts the moment it carries a number — what the eye
  // sees above, the foot adds (it files into the database on + Add / Enter)
  const ghostAmt = ghost.description.trim() ? (Number(ghost.unit_price) || 0) * (Number(ghost.quantity) || 1) : 0;
  const subtotal = real.reduce((sum, l) => sum + (Number(l.line_total) || 0), 0) + ghostAmt;
  const discable = real.filter((l) => l.discountable !== false).reduce((sum, l) => sum + (Number(l.line_total) || 0), 0) + ghostAmt;
  const discPctN = discPct !== null ? Number(discPct) || 0 : Number(q.discount_pct) || 0;
  const discAmt = Math.round(discable * discPctN) / 100;
  const taxRow = taxes.find((t) => t.id === String(q.tax_id ?? ""));

  /* WHAT A UNIT OF THIS QUOTE'S CURRENCY IS WORTH, in rupees. 1 when the
     table has not been read yet or the code is not on it, which keeps every
     conversion below a no-op rather than a zero. */
  const rateOf = (code: string) => Number(fx.find((f) => f.code === code)?.inr_per_unit) || 1;
  const fxRow = fx.find((f) => f.code === currency);

  /**
   * WHAT AN ITEM COSTS IN THIS QUOTE'S CURRENCY (Dr Raghu, 8 Sep 2026: "at
   * the moment I choose a product, it will show that product's amount in that
   * currency" · "the option is that I will definitely put a USD price in
   * everything, and euro can be converted in the master").
   *
   * So the dollar price is the one that is TYPED, and every other foreign
   * currency is crossed off it through the rate table — euro from dollars,
   * not euro from rupees, because that is the number he maintains.
   *
   * WHEN THERE IS NO DOLLAR PRICE the rupee price is converted at today's
   * rate instead. Ten items of 6,672 carry one today, so most picks land on
   * that path, and it is a fair number rather than a blank box — but it is a
   * CONVERSION and the screen says so, because a converted price is a guess
   * about a market and a typed one is a decision about a deal.
   */
  const priceLabel = (h: CatHit): string | null => {
    const { price, converted } = priceOf(h);
    if (price == null) return null;
    return `${fm(price)}${converted ? " (converted)" : ""}`;
  };
  const priceOf = (p: { approved_price_inr?: unknown; alt_price_usd?: unknown }): { price: number | null; converted: boolean } => {
    const inr = p.approved_price_inr == null ? null : Number(p.approved_price_inr);
    const usd = p.alt_price_usd == null ? null : Number(p.alt_price_usd);
    if (currency === "INR") return { price: inr, converted: false };
    if (usd != null && isFinite(usd)) {
      if (currency === "USD") return { price: usd, converted: false };
      return { price: Math.round(usd * (rateOf("USD") / rateOf(currency)) * 100) / 100, converted: false };
    }
    if (inr != null && isFinite(inr)) return { price: Math.round((inr / rateOf(currency)) * 100) / 100, converted: true };
    return { price: null, converted: false };
  };

  /**
   * CHANGING THE CURRENCY (Dr Raghu, 8 Sep 2026: "whenever I choose a USD or
   * a euro, make sure we make the tax as zero. Change that automatically. It
   * can always go back").
   *
   * An export sale carries no GST, so leaving 18% on a dollar quote is not a
   * formatting slip — it is a wrong number on a document that goes to a
   * customer. Off the rupee, the tax scheme moves to No Tax by itself.
   *
   * BACK ON THE RUPEE IT COMES BACK, and it comes back the way it was chosen
   * in the first place — IGST outside Maharashtra, CGST + SGST within, read
   * from the quote's own address. That is the same rule the desk applies when
   * a quote first opens, so returning to INR lands on the scheme that quote
   * would have had, not on whatever was last clicked.
   */
  const setCurrency = async (next: string) => {
    const fields: Record<string, unknown> = { currency: next };
    const zero = taxes.find((t) => Number(t.total_pct) === 0);
    if (next !== "INR") {
      if (zero) fields.tax_id = zero.id;
    } else if (Number(taxRow?.total_pct ?? 0) === 0) {
      let inMaha = false, known = false;
      if (q.address_id) {
        try {
          const j = await (await fetch(`/api/crm/address?id=${encodeURIComponent(String(q.address_id))}`, { cache: "no-store" })).json();
          const st = String(j?.row?.state ?? "").toLowerCase();
          if (st) { known = true; inMaha = st.includes("maharashtra"); }
        } catch (e) { swallow("crm/CrmApp", e); /* fall to the default */ }
      }
      const pick = known
        ? taxes.find((t) => (inMaha ? /cgst/i.test(t.name) : /igst/i.test(t.name)))
        : taxes.find((t) => t.is_default);
      if (pick) fields.tax_id = pick.id;
    }
    await patchQuote(fields);
  };
  const taxAmt = Math.round((subtotal - discAmt) * (taxRow?.total_pct ?? 18)) / 100;
  const grand = subtotal - discAmt + taxAmt;
  const cellIn = { width: "100%", border: "none", outline: "none", background: "transparent", fontSize: 13, padding: "6px 8px" } as const;
  // the group cell TYPES (Dr Raghu, 30 Aug 2026: "let me type the item
  // group") — a datalist offers the masters\' families while any text stands
  const GroupCell = ({ value, onCommit, placeholder }: { value: string; onCommit: (v: string) => void; placeholder?: string }) => {
    const [local, setLocal] = useState(value);
    useEffect(() => setLocal(value), [value]);
    return (
      <input list="quote-groups" value={local} placeholder={placeholder || "group…"} disabled={busy}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={() => { if (local.trim() !== value) onCommit(local.trim()); }}
        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
        style={{ ...cellIn }} />
    );
  };
  return (
    <div className="flex flex-col" style={{ height: "100%", minHeight: 0 }}>
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: 16 }}>
        <div className="flex items-center gap-3 mb-2 flex-wrap">
          <label className="text-xs font-semibold flex items-center gap-1.5" style={{ color: MUTED }}>
            Currency
            {/* A STRAY CLICK USED TO REDENOMINATE THE QUOTE (Dr Raghu, 8 Sep
                2026 — 40707 stood at ₹1,65,000 wearing a $). Changing this
                relabels the money; it does NOT convert it, because fx_rate
                stays where it was. So on a quote that already carries values
                it now asks first. */}
            <select value={currency} onChange={(e) => {
              const next = e.target.value;
              const priced = Number(q.subtotal ?? 0) > 0 || Number(q.grand_total ?? 0) > 0;
              if (priced && next !== currency && !window.confirm(
                `Show this quote in ${next}?\n\nThe rates are NOT converted — ${fm(q.grand_total)} stays as it is and simply reads as ${next}. Re-rate the lines yourself if the deal is truly in ${next}.`)) {
                e.target.value = currency; return;
              }
              void setCurrency(next).catch((x) => setErr(String(x.message || x)));
            }}
              className="px-2 py-1 rounded text-xs border font-bold" style={{ borderColor: BORDER, background: "#fff", color: INK }}>
              {(fx.length ? fx.map((f) => f.code) : ["INR", "USD", "EUR"]).map((c) => <option key={c}>{c}</option>)}
            </select>
          </label>
          {/* THE RATE, WHERE HE CAN SEE IT (Dr Raghu, 8 Sep 2026: "show the
              latest foreign exchange rate for USD and euro"). Off the rupee
              it says what a unit is worth and the day the ECB said so — a
              rate with no date is a rate nobody can check. */}
          {currency !== "INR" && fxRow && (
            <span className="text-xs rounded px-2 py-1" title={String(fxRow.source ?? "")}
              style={{ background: "#EEF3F8", border: `1px solid ${BORDER}`, color: NAVY }}>
              1 {fxRow.code} = <b>₹{Number(fxRow.inr_per_unit).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</b>
              <span style={{ color: MUTED }}> · {String(fxRow.as_of).slice(0, 10).split("-").reverse().join("/")}</span>
            </span>
          )}
          {currency !== "INR" && Number(taxRow?.total_pct ?? 0) === 0 && (
            <span className="text-xs rounded px-2 py-1" style={{ background: "#EAF5EC", border: "1px solid #BFDCC6", color: "#2A6B39" }}>
              Tax nil — export
            </span>
          )}
          {busy && <span className="text-xs" style={{ color: MUTED }}>saving…</span>}
          {err && <span className="text-xs font-semibold" style={{ color: "#8E2C20" }}>{err}</span>}
        </div>

        <datalist id="quote-groups">{groups.map((g) => <option key={g} value={g} />)}</datalist>
        <div className="rounded border" style={{ borderColor: BORDER }}>
          <table className="genie-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "#FAF9F5", color: MUTED, fontSize: 11, textAlign: "left" }}>
                <th className="px-2 py-1.5" style={{ width: 52 }}>SR NO</th>
                <th className="px-2 py-1.5" style={{ width: 170 }}>ITEM GROUP</th>
                <th className="px-2 py-1.5">ITEM</th>
                <th className="px-2 py-1.5" style={{ width: 110, textAlign: "right" }}>RATE</th>
                <th className="px-2 py-1.5" style={{ width: 70, textAlign: "right" }}>QTY</th>
                <th className="px-2 py-1.5" style={{ width: 120, textAlign: "right" }}>AMOUNT</th>
                <th className="px-2 py-1.5" style={{ width: 150 }} />
              </tr>
            </thead>
            <tbody>
              {(lines ?? []).map((l, i) => (
                <tr key={l.id} style={{ borderTop: `1px solid ${BORDER}` }}>
                  <td className="px-2 tnum" style={{ color: MUTED }}>{srOf(i)}</td>
                  <td style={{ paddingLeft: (l.indent ?? 0) ? 14 : 0 }}>
                    <GroupCell value={String(l.item_group ?? "")} onCommit={(v) => void patchLine(l.id, { item_group: v || null })} />
                  </td>
                  <td style={{ paddingLeft: (l.indent ?? 0) ? 14 : 0 }}>
                    <div className="flex items-center gap-1">
                      <ItemSearchCell style={cellIn} value={D(l, "description")} group={String(l.item_group ?? "") || undefined} priceLabel={priceLabel}
                        onType={(v) => setD(l.id, "description", v)} onCommit={() => commitD(l, "description")}
                        onPick={(h) => void patchLine(l.id, {
                          product_id: h.id, description: h.name, item_group: h.item_group,
                          ...(priceOf(h).price != null ? { unit_price: priceOf(h).price } : {}),
                        })} />
                      <button title="Open this item — name, description and image, for THIS quote alone"
                        onClick={() => setOpenLine(l)} style={{ fontSize: 13, opacity: 0.65, flexShrink: 0 }}>📦</button>
                    </div>
                  </td>
                  <td><input style={{ ...cellIn, textAlign: "right" }} inputMode="decimal" value={groupIn(D(l, "unit_price"), currency)}
                    onChange={(e) => setD(l.id, "unit_price", ungroup(e.target.value))} onBlur={() => commitD(l, "unit_price")} /></td>
                  <td><input style={{ ...cellIn, textAlign: "right" }} type="number" min={1} value={D(l, "quantity")}
                    onChange={(e) => setD(l.id, "quantity", e.target.value)} onBlur={() => commitD(l, "quantity")} /></td>
                  <td className="px-2 tnum" style={{ textAlign: "right", fontWeight: 600 }}>{fm(l.line_total)}</td>
                  <td className="px-2" style={{ whiteSpace: "nowrap", textAlign: "right" }}>
                    <label title="Header discount applies to this line" className="mr-1" style={{ fontSize: 11, color: MUTED }}>
                      <input type="checkbox" checked={l.discountable !== false} disabled={busy}
                        onChange={(e) => void patchLine(l.id, { discountable: e.target.checked })} style={{ accentColor: NAVY, verticalAlign: "middle" }} /> disc
                    </label>
                    {i > 0 && <button title="Move up" disabled={busy} onClick={() => void move(i, -1)} style={{ fontSize: 12, padding: "0 2px" }}>↑</button>}
                    {i < (lines?.length ?? 0) - 1 && <button title="Move down" disabled={busy} onClick={() => void move(i, 1)} style={{ fontSize: 12, padding: "0 2px" }}>↓</button>}
                    {i > 0 && ((l.indent ?? 0) === 0
                      ? <button title="Indent — becomes 1.1 under the line above" disabled={busy} onClick={() => void patchLine(l.id, { indent: 1 })} style={{ fontSize: 12, padding: "0 2px" }}>→</button>
                      : <button title="Outdent — back to a main line" disabled={busy} onClick={() => void patchLine(l.id, { indent: 0 })} style={{ fontSize: 12, padding: "0 2px" }}>←</button>)}
                    <button title="Edit this item — name, description, image (this quote alone)" disabled={busy}
                      onClick={() => setOpenLine(l)} style={{ fontSize: 12, padding: "0 3px" }}>✏️</button>
                    <button title="Remove this item" disabled={busy} onClick={() => void delLine(l.id)} style={{ fontSize: 12, padding: "0 4px", color: "#8E2C20" }}>✕</button>
                  </td>
                </tr>
              ))}
              {/* the write-item row — always there, Enter files it */}
              <tr style={{ borderTop: `1px solid ${BORDER}`, background: "#FDFCFA" }}>
                <td className="px-2 tnum" style={{ color: "#C7CCD2" }}>{(() => { const n = (lines ?? []).filter((l) => (l.indent ?? 0) === 0).length + 1; return n; })()}</td>
                <td><GroupCell value={ghost.item_group} onCommit={(v) => setGhost((g) => ({ ...g, item_group: v }))} /></td>
                <td>
                  <div className="flex items-center gap-1">
                    <ItemSearchCell style={cellIn} placeholder="write item…" value={ghost.description} group={ghost.item_group || undefined} priceLabel={priceLabel}
                      onType={(v) => setGhost((g) => ({ ...g, description: v, product_id: "" }))}
                      onEnter={() => void addLine()}
                      onPick={(h) => setGhost((g) => ({
                        ...g, description: h.name, item_group: h.item_group || g.item_group, product_id: h.id,
                        unit_price: priceOf(h).price != null ? String(priceOf(h).price) : g.unit_price,
                      }))} />
                    <ProductCellPick group={ghost.item_group || undefined} onPick={async (pid) => {
                      try {
                        const j = await (await fetch(`/api/crm/product?id=${encodeURIComponent(pid)}`, { cache: "no-store" })).json();
                        const p = j?.row as Row | undefined;
                        if (p) setGhost((g) => ({
                          ...g, description: g.description || String(p.name ?? ""),
                          item_group: g.item_group || String(p.item_group ?? ""),
                          unit_price: g.unit_price || (priceOf(p as { approved_price_inr?: unknown; alt_price_usd?: unknown }).price != null
                            ? String(priceOf(p as { approved_price_inr?: unknown; alt_price_usd?: unknown }).price) : ""),
                        }));
                      } catch (e) { swallow("crm/CrmApp", e); /* type it by hand */ }
                    }} />
                  </div>
                </td>
                <td><input style={{ ...cellIn, textAlign: "right" }} inputMode="decimal" placeholder="rate" value={groupIn(ghost.unit_price, currency)} onChange={(e) => setGhost((g) => ({ ...g, unit_price: ungroup(e.target.value) }))} onKeyDown={(e) => { if (e.key === "Enter") void addLine(); }} /></td>
                <td><input style={{ ...cellIn, textAlign: "right" }} type="number" min={1} value={ghost.quantity} onChange={(e) => setGhost((g) => ({ ...g, quantity: e.target.value }))} onKeyDown={(e) => { if (e.key === "Enter") void addLine(); }} /></td>
                <td className="px-2 tnum" style={{ textAlign: "right", color: MUTED }}>{ghost.unit_price ? fm((Number(ghost.unit_price) || 0) * (Number(ghost.quantity) || 1)) : "—"}</td>
                <td className="px-2" style={{ textAlign: "right" }}>
                  <button disabled={busy || !ghost.description.trim()} onClick={() => void addLine()}
                    className="rounded px-2 py-0.5 text-xs font-bold text-white" style={{ background: ghost.description.trim() ? ORANGE : "#B9BEC4" }}>+ Add</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        {openLine && (
          <LineItemBox line={openLine} onClose={() => setOpenLine(null)}
            onSaved={async () => { setOpenLine(null); await reloadLines(); await reloadQuote(); }} />
        )}
      </div>

      {/* THE FLOATING FOOT — totals ride along as the items scroll */}
      <div style={{ flexShrink: 0, borderTop: `2px solid ${NAVY}`, background: "#fff", padding: "10px 16px" }}>
        <div className="flex gap-6 flex-wrap items-start">
          <div style={{ flex: 1, minWidth: 260 }}>
            <div className="text-sm mt-1" style={{ color: MUTED, lineHeight: 1.5 }}>
              <b style={{ color: INK }}>In words:</b> {amountInWords(grand, currency, dec)}
            </div>
            <div className="flex items-center gap-4 mt-2 flex-wrap">
              <label className="text-xs flex items-center gap-1.5" style={{ color: MUTED }}>
                <input type="checkbox" checked={dec} onChange={(e) => void patchQuote({ show_decimals: e.target.checked }).catch((x) => setErr(String(x.message || x)))} style={{ accentColor: NAVY }} />
                show decimals
              </label>
              <label className="text-xs flex items-center gap-1.5" style={{ color: MUTED }}>
                Authorized By:
                <input defaultValue={String(q.authorized_by ?? "Dr Raghunandan Jagdish, MD and CEO")}
                  onBlur={(e) => { if (e.target.value !== String(q.authorized_by ?? "")) void patchQuote({ authorized_by: e.target.value }).catch((x) => setErr(String(x.message || x))); }}
                  className="px-2 py-1 rounded border text-xs" style={{ borderColor: BORDER, width: 260, fontWeight: 700, color: INK }} />
              </label>
            </div>
          </div>
          <table className="genie-table" style={{ fontSize: 13, minWidth: 320 }}>
            <tbody>
              <tr><td className="py-0.5 pr-6" style={{ color: MUTED }}>Net Total</td><td className="tnum" style={{ textAlign: "right" }}>{fm(subtotal)}</td></tr>
              <tr>
                <td className="py-0.5 pr-6" style={{ color: MUTED }}>
                  Discount
                  <input type="number" value={discPct ?? String(Number(q.discount_pct) || 0)}
                    onChange={(e) => setDiscPct(e.target.value)}
                    onBlur={() => { if (discPct !== null) { void patchQuote({ discount_pct: Number(discPct) || 0 }).catch((x) => setErr(String(x.message || x))); setDiscPct(null); } }}
                    className="mx-1.5 px-1.5 py-0.5 rounded border tnum" style={{ borderColor: BORDER, width: 60, textAlign: "right" }} />%
                </td>
                <td className="tnum" style={{ textAlign: "right", color: discAmt ? "#8E2C20" : MUTED }}>{discAmt ? `− ${fm(discAmt)}` : fm(0)}</td>
              </tr>
              <tr style={{ borderTop: `1px solid ${BORDER}` }}><td className="py-0.5 pr-6" style={{ color: MUTED }}>Discounted Total</td><td className="tnum" style={{ textAlign: "right" }}>{fm(subtotal - discAmt)}</td></tr>
              <tr><td colSpan={2} style={{ height: 8 }} /></tr>
              <tr>
                <td className="py-0.5 pr-6" style={{ color: MUTED }}>
                  Taxes
                  <select value={String(q.tax_id ?? "")} onChange={(e) => void patchQuote({ tax_id: e.target.value }).catch((x) => setErr(String(x.message || x)))}
                    className="mx-1.5 px-1.5 py-0.5 rounded border text-xs" style={{ borderColor: BORDER, background: "#fff", maxWidth: 170 }}>
                    <option value="">— pick —</option>
                    {taxes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </td>
                <td className="tnum" style={{ textAlign: "right" }}>{fm(taxAmt)}</td>
              </tr>
              {(taxRow?.components ?? []).length > 1 && (taxRow!.components!).map((c) => (
                <tr key={c.name}><td className="py-0 pr-6 text-xs" style={{ color: MUTED, paddingLeft: 14 }}>{c.name} {c.pct}%</td>
                  <td className="tnum text-xs" style={{ textAlign: "right", color: MUTED }}>{fm((subtotal - discAmt) * c.pct / 100)}</td></tr>
              ))}
              <tr style={{ borderTop: `2px solid ${NAVY}` }}>
                <td className="py-1 pr-6 font-bold" style={{ color: INK }}>Grand Total</td>
                <td className="tnum font-bold" style={{ textAlign: "right", fontSize: 15 }}>{fm(grand)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/** One quote line opened whole (Dr Raghu, 30 Aug 2026): name, rich
 *  description and image as carried in from the masters — editable, but the
 *  edit lives on THIS QUOTE alone; the product master never changes. */
export function LineItemBox({ line, onClose, onSaved }: { line: QLine; onClose: () => void; onSaved: () => Promise<void> }) {
  const [name, setName] = useState(line.description);
  const [rich, setRich] = useState<string | null>(null);
  const [image, setImage] = useState<string>(String(line.specs?.image ?? ""));
  const [editingDesc, setEditingDesc] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  // the master's description and image arrive as the starting point
  useEffect(() => {
    let dead = false;
    void (async () => {
      if (line.specs?.rich !== undefined && line.specs?.rich !== null) { setRich(String(line.specs.rich)); }
      if (!line.product_id) { if (line.specs?.rich === undefined || line.specs?.rich === null) setRich(""); return; }
      try {
        const j = await (await fetch(`/api/crm/product?id=${encodeURIComponent(String(line.product_id))}`, { cache: "no-store" })).json();
        if (dead || !j?.row) return;
        if (line.specs?.rich === undefined || line.specs?.rich === null) setRich(String(j.row.description ?? ""));
        if (!line.specs?.image && j.row.image) setImage(String(j.row.image));
      } catch { if (!dead && rich === null) setRich(""); }
    })();
    return () => { dead = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [line.id]);

  const save = async () => {
    setBusy(true); setErr("");
    try {
      const r = await fetch(`/api/crm/quotation_line?id=${encodeURIComponent(line.id)}`, {
        method: "PATCH", headers: { "content-type": "application/json" },
        body: JSON.stringify({
          description: name.trim() || line.description,
          specs: { ...(line.specs || {}), rich: rich ?? "", image: image || undefined },
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Could not save");
      await onSaved();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 70, background: "rgba(22,35,47,.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} className="rounded" style={{ background: "#fff", width: "min(760px, 100%)", maxHeight: "calc(100vh - 40px)", display: "flex", flexDirection: "column", boxShadow: "0 12px 40px rgba(27,45,107,.35)" }}>
        <div className="flex items-center justify-between px-4 py-2.5" style={{ background: NAVY, borderRadius: "6px 6px 0 0" }}>
          <div className="text-white font-bold text-sm">Quote item — this quote alone, the master stays untouched</div>
          <button onClick={onClose} className="text-white font-bold px-2">✕</button>
        </div>
        <div className="p-4" style={{ overflowY: "auto" }}>
          {err && <div className="rounded p-2 mb-2 text-sm" style={{ background: "#FBEAE8", color: "#8E2C20" }}>{err}</div>}
          <div className="flex gap-4 flex-wrap">
            <div style={{ flex: 1, minWidth: 280 }}>
              <div className="text-xs font-semibold mb-0.5" style={{ color: MUTED }}>ITEM NAME (as it prints on the quote)</div>
              <input value={name} onChange={(e) => setName(e.target.value)}
                className="w-full px-2 py-1.5 rounded border text-sm font-bold" style={{ borderColor: BORDER }} />
              <div className="flex items-center gap-2 mt-3 mb-0.5">
                <span className="text-xs font-semibold" style={{ color: MUTED }}>DESCRIPTION</span>
                {!editingDesc && <button title="Edit the description for this quote" onClick={() => setEditingDesc(true)} style={{ fontSize: 12, opacity: 0.6 }}>✏️</button>}
              </div>
              {rich === null ? (
                <div className="text-sm" style={{ color: MUTED }}>reading the master…</div>
              ) : editingDesc ? (
                <RichTextEditor initial={rich} minHeight={220} busy={false}
                  onCancel={() => setEditingDesc(false)}
                  onSave={(html) => { setRich(html); setEditingDesc(false); }} />
              ) : (
                <div className="rounded border p-3 text-sm" style={{ borderColor: BORDER, lineHeight: 1.6, maxHeight: 300, overflowY: "auto" }}>
                  {rich.trim() ? <RichContent text={rich} legacy={(s2) => <RichText text={s2} />} /> : <span style={{ color: MUTED }}>No description — ✏️ writes one for this quote.</span>}
                </div>
              )}
            </div>
            <div style={{ width: 220, flexShrink: 0 }}>
              <div className="text-xs font-semibold mb-0.5" style={{ color: MUTED }}>IMAGE</div>
              {image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={image} alt="" style={{ maxWidth: "100%", maxHeight: 180, borderRadius: 8, border: `1px solid ${BORDER}`, cursor: "zoom-in" }}
                  onClick={() => window.open(image, "_blank", "noopener")} />
              ) : (
                <div className="rounded border text-xs flex items-center justify-center" style={{ borderColor: BORDER, color: MUTED, height: 100 }}>no image</div>
              )}
              <input value={image} onChange={(e) => setImage(e.target.value)} placeholder="image URL…"
                className="w-full mt-1.5 px-2 py-1 rounded border text-xs" style={{ borderColor: BORDER }} />
              {/* or straight from the computer (Dr Raghu, 30 Aug 2026) */}
              <label className="block mt-1.5 text-xs rounded border px-2 py-1 font-bold cursor-pointer text-center"
                style={{ borderColor: BORDER, background: "#fff", color: NAVY }}>
                {busy ? "Uploading…" : "⬆ Upload from computer"}
                <input type="file" className="hidden" accept="image/*" disabled={busy}
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (!f) return;
                    setBusy(true); setErr("");
                    try {
                      const fd = new FormData();
                      fd.append("target_type", "quotation_line"); fd.append("target_id", line.id); fd.append("file", f);
                      const r = await fetch("/api/crm/opp-attach", { method: "POST", body: fd });
                      const j = await r.json();
                      if (!r.ok) throw new Error(j.error || "Upload failed");
                      setImage(String(j.url));
                    } catch (e2) { setErr(e2 instanceof Error ? e2.message : String(e2)); }
                    finally { setBusy(false); }
                  }} />
              </label>
            </div>
          </div>
        </div>
        <div className="flex gap-2 px-4 py-3" style={{ borderTop: `1px solid ${BORDER}` }}>
          <button onClick={() => void save()} disabled={busy || editingDesc}
            title={editingDesc ? "Finish the description edit first (✓ Save inside the editor)" : ""}
            className="rounded px-4 py-1.5 text-sm font-bold text-white" style={{ background: busy || editingDesc ? "#B9BEC4" : "var(--green)" }}>
            {busy ? "Saving…" : "✓ Save to this quote"}
          </button>
          <button onClick={onClose} className="rounded px-3 py-1.5 text-sm font-bold" style={{ background: "var(--line-soft)", color: "var(--dim)" }}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

/** The Item cell IS the search (Dr Raghu, 30 Aug 2026: "type in the item
 *  and search item name or item group or description") — free text stays
 *  free; a pick fills rate, group and description. Two lines per hit. */
export type CatHit = { id: string; name: string; sku: string; item_group: string | null; approved_price_inr: number | null; alt_price_usd?: number | null; snippet: string };

export function ItemSearchCell({ value, group, placeholder, onType, onCommit, onPick, onEnter, style, priceLabel }: {
  value: string; group?: string; placeholder?: string;
  onType: (v: string) => void; onCommit?: () => void;
  onPick: (hit: CatHit) => void; onEnter?: () => void;
  style?: React.CSSProperties;
  /* the desk hands its own currency down, so the list quotes what the item
     will actually cost on THIS quote (Dr Raghu, 8 Sep 2026) */
  priceLabel?: (hit: CatHit) => string | null;
}) {
  const [hits, setHits] = useState<CatHit[]>([]);
  const [note, setNote] = useState("");
  const [open, setOpen] = useState(false);
  const timer = useRef<number | null>(null);
  const seek = (q: string) => {
    if (timer.current) window.clearTimeout(timer.current);
    if (q.trim().length < 2 && !group) { setHits([]); setOpen(false); return; }
    timer.current = window.setTimeout(() => {
      setNote("searching…"); setOpen(true);
      fetch(`/api/crm/product-extra?search=${encodeURIComponent(q.trim())}${group ? `&group=${encodeURIComponent(group)}` : ""}`, { cache: "no-store" })
        .then(async (r) => {
          const j = await r.json();
          if (!r.ok) throw new Error(j.error || String(r.status));
          const h = (j.hits ?? []) as CatHit[];
          setHits(h); setNote(h.length ? "" : group ? `nothing in ${group} matches` : "no match — Enter files it as written"); setOpen(true);
        })
        .catch((e) => { setHits([]); setNote(e instanceof Error ? e.message : String(e)); setOpen(true); });
    }, 200);
  };
  return (
    <div style={{ position: "relative", flex: 1, minWidth: 0 }}>
      <input style={style} value={value} placeholder={placeholder}
        onChange={(e) => { onType(e.target.value); seek(e.target.value); }}
        onFocus={() => { if (hits.length) setOpen(true); else seek(value); }}
        onBlur={() => { window.setTimeout(() => setOpen(false), 200); onCommit?.(); }}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); setOpen(false); onEnter?.(); } if (e.key === "Escape") setOpen(false); }} />
      {open && (hits.length > 0 || note) && (
        <div className="rounded border" style={{ position: "absolute", top: "100%", left: 0, zIndex: 45, background: "#fff", borderColor: BORDER, boxShadow: "0 8px 24px rgba(27,45,107,.18)", minWidth: 320, maxWidth: 460, maxHeight: 300, overflowY: "auto" }}>
          {note && <div className="px-2.5 py-1.5 text-xs" style={{ color: MUTED }}>{note}</div>}
          {hits.map((h) => (
            <button key={h.id} type="button" onMouseDown={(e) => e.preventDefault()}
              onClick={() => { setOpen(false); onPick(h); }}
              className="block w-full text-left px-2.5 py-1.5 hover:bg-[#F7F5F0]" style={{ borderBottom: `1px solid ${BORDER}` }}>
              <div className="text-sm font-bold" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{h.name}</div>
              <div className="text-xs" style={{ color: MUTED, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {[h.item_group,
                  priceLabel ? priceLabel(h)
                    : h.approved_price_inr != null ? `₹ ${Number(h.approved_price_inr).toLocaleString("en-IN")}` : null,
                  h.snippet].filter(Boolean).join(" · ")}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** The little 📦 that turns into a product search inside a grid cell. */
export function ProductCellPick({ onPick, group }: { onPick: (productId: string) => void; group?: string }) {
  const [open, setOpen] = useState(false);
  if (!open)
    return <button title={group ? `Pick from ${group}` : "Pick from the Products catalogue"} onClick={() => setOpen(true)} style={{ fontSize: 13, opacity: 0.65, flexShrink: 0 }}>📦</button>;
  return (
    <div style={{ width: 220, flexShrink: 0 }}>
      <LinkAutocomplete target="product" value="" valueLabel=""
        extraQuery={group ? `f_item_group=${encodeURIComponent(group)}` : undefined}
        onPick={(id) => { setOpen(false); if (id) onPick(id); }} />
    </div>
  );
}

/** The client's addresses in a dropdown, the client's own as default
 *  (Dr Raghu, 30 Aug 2026: "Address have a drop down — the default should
 *  be the one of the client"). */
export function AddressSelect({ companyId, value, onPick }: {
  companyId: string; value: string; onPick: (id: string) => void;
}) {
  const [opts, setOpts] = useState<{ id: string; label: string }[]>([]);
  // "add address also in the quotation" (Dr Raghu, 30 Aug 2026) — a new
  // address for the client, born right here
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ label: "Billing", line1: "", line2: "", city: "", state: "", pincode: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const createAddress = async () => {
    if (!form.line1.trim()) { setErr("At least the first line."); return; }
    setBusy(true); setErr("");
    try {
      const r = await fetch("/api/crm/address", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ company_id: companyId, ...form }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Could not save the address");
      const label = [form.label, form.line1, form.city].filter(Boolean).join(" · ");
      setOpts((cur) => [...cur, { id: String(j.row.id), label }]);
      onPick(String(j.row.id));
      setAdding(false);
      setForm({ label: "Billing", line1: "", line2: "", city: "", state: "", pincode: "" });
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };
  useEffect(() => {
    if (!companyId) { setOpts([]); return; }
    let dead = false;
    void (async () => {
      try {
        const j = await (await fetch(`/api/crm/address?f_company_id=${encodeURIComponent(companyId)}&limit=100`, { cache: "no-store" })).json();
        const rows = (j.rows ?? []) as Row[];
        if (!dead) setOpts(rows.map((r) => ({
          id: String(r.id),
          label: [r.label, r.line1, r.city].filter(Boolean).join(" · ") || String(r.id),
        })));
      } catch (e) { swallow("crm/CrmApp", e); /* the quote can still save without one */ }
    })();
    return () => { dead = true; };
  }, [companyId]);
  useEffect(() => {
    if (!value && opts.length) onPick(opts[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts]);
  return (
    <div>
      <select value={value} disabled={busy}
        onChange={(e) => { if (e.target.value === "__new") { setAdding(true); return; } onPick(e.target.value); }}
        className="w-full px-2 py-1.5 rounded text-sm border" style={{ borderColor: "var(--line)", background: "#fff" }}>
        <option value="">{companyId ? (opts.length ? "—" : "no address on the company yet") : "pick the company first"}</option>
        {opts.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
        {companyId && <option value="__new">＋ Add new address…</option>}
      </select>
      {adding && (
        <div className="rounded border p-2.5 mt-1.5" style={{ borderColor: ORANGE, background: "#FFFDF9" }}>
          {err && <div className="text-xs mb-1 font-semibold" style={{ color: "#8E2C20" }}>{err}</div>}
          <div className="grid gap-1.5" style={{ gridTemplateColumns: "1fr 1fr" }}>
            <select value={form.label} onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
              className="px-2 py-1 rounded border text-xs" style={{ borderColor: BORDER, background: "#fff" }}>
              {["Billing", "Shipping", "Works", "Office"].map((l) => <option key={l}>{l}</option>)}
            </select>
            <input value={form.pincode} onChange={(e) => setForm((f) => ({ ...f, pincode: e.target.value }))} placeholder="PIN code"
              className="px-2 py-1 rounded border text-xs" style={{ borderColor: BORDER }} />
            <input value={form.line1} onChange={(e) => setForm((f) => ({ ...f, line1: e.target.value }))} placeholder="Address line 1 *"
              className="px-2 py-1 rounded border text-xs" style={{ borderColor: BORDER, gridColumn: "1 / -1" }} />
            <input value={form.line2} onChange={(e) => setForm((f) => ({ ...f, line2: e.target.value }))} placeholder="Address line 2"
              className="px-2 py-1 rounded border text-xs" style={{ borderColor: BORDER, gridColumn: "1 / -1" }} />
            <input value={form.city} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} placeholder="City"
              className="px-2 py-1 rounded border text-xs" style={{ borderColor: BORDER }} />
            <input value={form.state} onChange={(e) => setForm((f) => ({ ...f, state: e.target.value }))} placeholder="State (decides IGST vs CGST+SGST)"
              className="px-2 py-1 rounded border text-xs" style={{ borderColor: BORDER }} />
          </div>
          <div className="flex gap-2 mt-1.5">
            <button onClick={() => void createAddress()} disabled={busy}
              className="rounded px-2.5 py-1 text-xs font-bold text-white" style={{ background: busy ? "#B9BEC4" : "var(--green)" }}>
              {busy ? "Saving…" : "✓ Save address"}
            </button>
            <button onClick={() => setAdding(false)} className="rounded px-2 py-1 text-xs font-bold" style={{ background: "var(--line-soft)", color: "var(--dim)" }}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

/** The recipient type-ahead: the client's people first, then everyone —
 *  and a typed EMAIL nobody has offers "Add contact?" in a popup that also
 *  asks for the mobile, filing the person under the same client
 *  (Dr Raghu, 30 Aug 2026). */
export function RecipientAdd({ companyId, onPick }: { companyId?: string; onPick: (pid: string) => void }) {
  const [text, setText] = useState("");
  const [opts, setOpts] = useState<{ id: string; label: string; mine?: boolean }[]>([]);
  const [open, setOpen] = useState(false);
  const [popup, setPopup] = useState<{ email: string; name: string; phone: string; companyId: string; companyLabel: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const timer = useRef<number | null>(null);
  const seek = (q: string) => {
    if (timer.current) window.clearTimeout(timer.current);
    if (q.trim().length < 2) { setOpts([]); setOpen(false); return; }
    timer.current = window.setTimeout(async () => {
      try {
        const [mine, all] = await Promise.all([
          companyId
            ? (await fetch(`/api/crm/person?pick=${encodeURIComponent(q)}&f_company_id=${encodeURIComponent(companyId)}`, { cache: "no-store" })).json()
            : Promise.resolve({ options: [] }),
          (await fetch(`/api/crm/person?pick=${encodeURIComponent(q)}`, { cache: "no-store" })).json(),
        ]);
        const seen = new Set<string>();
        const merged: { id: string; label: string; mine?: boolean }[] = [];
        for (const o of (mine.options ?? []) as { id: string; label: string }[]) { seen.add(o.id); merged.push({ ...o, mine: true }); }
        for (const o of (all.options ?? []) as { id: string; label: string }[]) if (!seen.has(o.id)) merged.push(o);
        setOpts(merged.slice(0, 8)); setOpen(true);
      } catch { setOpts([]); }
    }, 250);
  };
  const createContact = async () => {
    if (!popup) return;
    setBusy(true); setErr("");
    try {
      const r = await fetch("/api/crm/person", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({
          first_name: popup.name.trim() || popup.email.split("@")[0],
          primary_email: popup.email.trim(),
          primary_phone: popup.phone.trim() || null,
          ...(popup.companyId ? { company_id: popup.companyId } : {}),
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Could not add the contact");
      onPick(String(j.row.id));
      setPopup(null); setText(""); setOpts([]); setOpen(false);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };
  const emailish = isEmailish(text.trim());
  return (
    <div style={{ position: "relative", width: 230 }}>
      <input value={text} placeholder="add a person or email…"
        onChange={(e) => { setText(e.target.value); seek(e.target.value); }}
        onFocus={() => { if (opts.length) setOpen(true); }}
        onBlur={() => window.setTimeout(() => setOpen(false), 200)}
        onKeyDown={(e) => { if (e.key === "Enter" && emailish) { e.preventDefault(); setOpen(false); setPopup({ email: text.trim(), name: "", phone: "", companyId: companyId || "", companyLabel: "" }); } }}
        className="w-full px-2 py-1 rounded border text-xs" style={{ borderColor: BORDER }} />
      {open && (opts.length > 0 || emailish) && (
        <div className="rounded border" style={{ position: "absolute", top: "100%", left: 0, zIndex: 45, background: "#fff", borderColor: BORDER, boxShadow: "0 8px 24px rgba(27,45,107,.18)", minWidth: 260, maxHeight: 240, overflowY: "auto" }}>
          {opts.map((o) => (
            <button key={o.id} type="button" onMouseDown={(e) => e.preventDefault()}
              onClick={() => { onPick(o.id); setText(""); setOpts([]); setOpen(false); }}
              className="block w-full text-left px-2.5 py-1.5 text-sm hover:bg-[#F7F5F0]" style={{ borderBottom: `1px solid ${BORDER}` }}>
              {o.label}{o.mine && <span className="text-xs" style={{ color: "#1A7F4E" }}> · this client</span>}
            </button>
          ))}
          {emailish && (
            <button type="button" onMouseDown={(e) => e.preventDefault()}
              onClick={() => { setOpen(false); setPopup({ email: text.trim(), name: "", phone: "", companyId: companyId || "", companyLabel: "" }); }}
              className="block w-full text-left px-2.5 py-1.5 text-sm font-bold hover:bg-[#F7F5F0]" style={{ color: ORANGE }}>
              ＋ Add {text.trim()} as a contact…
            </button>
          )}
        </div>
      )}
      {popup && (
        <div onClick={() => setPopup(null)} style={{ position: "fixed", inset: 0, zIndex: 80, background: "rgba(22,35,47,.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div onClick={(e) => e.stopPropagation()} className="rounded p-4" style={{ background: "#fff", width: "min(420px, 100%)", boxShadow: "0 12px 40px rgba(27,45,107,.35)" }}>
            <div className="font-bold text-sm mb-2">Add contact?</div>
            <div className="text-xs mb-3" style={{ color: MUTED }}>Nobody has {popup.email} yet.</div>
            {err && <div className="rounded p-2 mb-2 text-sm" style={{ background: "#FBEAE8", color: "#8E2C20" }}>{err}</div>}
            <label className="block mb-2">
              <div className="text-xs font-semibold mb-0.5" style={{ color: MUTED }}>Name</div>
              <input value={popup.name} autoFocus onChange={(e) => setPopup((p) => p && { ...p, name: e.target.value })}
                className="w-full px-2 py-1.5 rounded border text-sm" style={{ borderColor: BORDER }} />
            </label>
            <label className="block mb-2">
              <div className="text-xs font-semibold mb-0.5" style={{ color: MUTED }}>Email</div>
              <input value={popup.email} onChange={(e) => setPopup((p) => p && { ...p, email: e.target.value })}
                className="w-full px-2 py-1.5 rounded border text-sm" style={{ borderColor: BORDER }} />
            </label>
            <label className="block mb-2">
              <div className="text-xs font-semibold mb-0.5" style={{ color: MUTED }}>Mobile</div>
              <input value={popup.phone} onChange={(e) => setPopup((p) => p && { ...p, phone: e.target.value })} placeholder="+91 …"
                className="w-full px-2 py-1.5 rounded border text-sm" style={{ borderColor: BORDER }} />
            </label>
            {/* files under THIS company by default — any company can be picked
                (Dr Raghu, 30 Aug 2026) */}
            <div className="mb-3">
              <div className="text-xs font-semibold mb-0.5" style={{ color: MUTED }}>Company</div>
              <LinkAutocomplete target="company" value={popup.companyId} valueLabel={popup.companyLabel}
                onPick={(cid) => setPopup((p) => p && { ...p, companyId: cid })} />
            </div>
            <div className="flex gap-2">
              <button onClick={() => void createContact()} disabled={busy || !isEmailish(popup.email)}
                className="rounded px-3 py-1.5 text-sm font-bold text-white" style={{ background: busy ? "#B9BEC4" : "var(--green)" }}>
                {busy ? "Adding…" : "✓ Add contact"}
              </button>
              <button onClick={() => setPopup(null)} className="rounded px-3 py-1.5 text-sm font-bold" style={{ background: "var(--line-soft)", color: "var(--dim)" }}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** SUBMIT THE QUOTE (Dr Raghu, 30 Aug 2026): to Raghu for review, or to
 *  the client — a popup with To/CC/BCC/Subject, the covering letter as the
 *  body, the PDF riding along with any ticked attachments; sent through the
 *  salesperson's own Gmail and logged into Communication. */
export function SubmitQuoteModal({ row, mode, onClose, onSent }: {
  row: Row; mode: "review" | "client"; onClose: () => void; onSent: () => void;
}) {
  const rid = String(row.id ?? "");
  const dISub = String(row.quoted_on ?? "").slice(0, 10).split("-").reverse().join("/");
  const [to, setTo] = useState("");
  const [cc, setCc] = useState("sales@nandan.co.in");
  const [bcc, setBcc] = useState("");
  const [subject, setSubject] = useState(
    `Submission of Qtn ${String(row.quote_no ?? "")} : Dt ${dISub}${row.subject ? ` | ${row.subject}` : ""}`);
  const [files, setFiles] = useState<{ name: string; path: string; from: "quote" | "library" }[]>([]);
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  /* WHO IT COULD GO TO (Dr Raghu, 8 Sep 2026: "i need to send quote, check
     why not possible"). 40707 had no contact and an empty To:, so Send
     refused — but only AFTER he pressed it, with "Who does it go To?", which
     reads as a wall rather than an instruction. The client's people are
     offered here as one press each. They are OFFERED, never filled in by
     themselves: a quote addressed by a guess is worse than one not sent. */
  const [book, setBook] = useState<{ id: string; name: string; email: string }[]>([]);
  const [busy, setBusy] = useState<"send" | "up" | null>(null);
  const [err, setErr] = useState("");

  // the quote's To/CC/BCC arrive resolved to real addresses
  useEffect(() => {
    void (async () => {
      const resolve = async (ids: unknown): Promise<string> => {
        const list = Array.isArray(ids) ? ids.map(String) : [];
        const emails: string[] = [];
        for (const pid of list) {
          try {
            const j = await (await fetch(`/api/crm/person?id=${encodeURIComponent(pid)}`, { cache: "no-store" })).json();
            if (j?.row?.primary_email) emails.push(String(j.row.primary_email));
          } catch (e) { swallow("crm/CrmApp", e); /* skip */ }
        }
        return emails.join(", ");
      };
      /* the quote's own contact is a link HE made, so it may prefill; the
         rest of the company's people are only ever offered below */
      let t = await resolve(row.mail_to);
      if (!t && row.contact_id) t = await resolve([row.contact_id]);
      setTo(t);
      const ccR = await resolve(row.mail_cc);
      setCc(["sales@nandan.co.in", ccR].filter(Boolean).join(", "));
      setBcc(await resolve(row.mail_bcc));
    })();
    if (row.company_id) {
      fetch(`/api/crm/person?f_company_id=${encodeURIComponent(String(row.company_id))}&limit=200`, { cache: "no-store" })
        .then((r) => r.json())
        .then((j) => setBook(((j?.rows ?? []) as { id: unknown; full_name: unknown; primary_email: unknown }[])
          .filter((p) => p.primary_email)
          .map((p) => ({ id: String(p.id), name: String(p.full_name ?? "—"), email: String(p.primary_email) }))))
        .catch((e) => swallow("crm/CrmApp", e));
    }
    fetch(`/api/crm/library?quote=${encodeURIComponent(rid)}`, { cache: "no-store" })
      .then(async (r) => {
        const j = await r.json();
        setFiles([
          ...((j.quoteFiles ?? []) as { name: string; path: string }[]).map((f) => ({ ...f, from: "quote" as const })),
          ...((j.library ?? []) as { name: string; path: string }[]).map((f) => ({ ...f, from: "library" as const })),
        ]);
      }).catch(() => setFiles([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rid]);

  const upload = async (f: File, toLibrary: boolean) => {
    setBusy("up"); setErr("");
    try {
      const fd = new FormData();
      if (toLibrary) { fd.append("file", f); }
      else { fd.append("target_type", "quotation"); fd.append("target_id", rid); fd.append("file", f); }
      const r = await fetch(toLibrary ? "/api/crm/library" : "/api/crm/opp-attach", { method: "POST", body: fd });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Upload failed");
      const path = toLibrary ? String(j.path) : String(j.url).replace(/^.*path=/, "");
      const p = decodeURIComponent(path);
      setFiles((cur) => [{ name: f.name, path: p, from: toLibrary ? "library" : "quote" }, ...cur]);
      setTicked((cur) => new Set([...cur, p]));
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(null); }
  };

  const send = async () => {
    setBusy("send"); setErr("");
    try {
      const split = (v: string) => v.split(/[,;\s]+/).map((x) => x.trim()).filter((x) => isEmailish(x));
      const r = await fetch("/api/crm/quote-submit", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({
          quotation_id: rid, mode,
          to: split(to), cc: split(cc), bcc: split(bcc),
          subject, body_html: String(row.letter_text || ""),
          attach_paths: [...ticked],
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "The send failed");
      window.alert(mode === "client"
        ? `✈ Submitted to the client — PDF + ${j.attachments - 1} attachment(s). The quote stands SUBMITTED; Edit is now Amend.`
        : "📨 Sent to Dr Raghu for review (DRAFT PDF).");
      onSent();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(null); }
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 75, background: "rgba(22,35,47,.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} className="rounded" style={{ background: "#fff", width: "min(680px, 100%)", maxHeight: "calc(100vh - 40px)", display: "flex", flexDirection: "column", boxShadow: "0 12px 40px rgba(27,45,107,.35)" }}>
        <div className="flex items-center justify-between px-4 py-2.5" style={{ background: mode === "client" ? "var(--green)" : NAVY, borderRadius: "6px 6px 0 0" }}>
          <div className="text-white font-bold text-sm">{mode === "client" ? "✈ Submit to Client" : "📨 Submit to Raghu for Review"}</div>
          <button onClick={onClose} className="text-white font-bold px-2">✕</button>
        </div>
        <div className="p-4" style={{ overflowY: "auto" }}>
          {err && <div className="rounded p-2 mb-2 text-sm" style={{ background: "#FBEAE8", color: "#8E2C20" }}>{err}</div>}
          {mode === "client" ? (
            <>
              {([["To", to, setTo], ["CC", cc, setCc], ["BCC", bcc, setBcc]] as const).map(([lab, v, set]) => (
                <label key={lab} className="block mb-2">
                  <div className="text-xs font-semibold mb-0.5" style={{ color: MUTED }}>{lab}</div>
                  <input value={v} onChange={(e) => set(e.target.value)} placeholder="addresses, comma-separated"
                    className="w-full px-2 py-1.5 rounded border text-sm" style={{ borderColor: BORDER }} />
                </label>
              ))}
              {!to.trim() && (
                <div className="rounded p-2 mb-2 text-xs" style={{ background: "#FDF0E7", border: "1px solid #F0C9A8", color: "#8A4520" }}>
                  <b>Nobody on To: — this quote cannot go out yet.</b>{" "}
                  {book.length
                    ? <>Press a name to address it, or type an address above.</>
                    : <>This client has no contact with an email on record. Type the address above, or add the person on the Contacts panel.</>}
                  {book.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      {book.map((p) => (
                        <button key={p.id} onClick={() => setTo((v) => (v.trim() ? `${v}, ${p.email}` : p.email))}
                          className="rounded px-2 py-0.5" style={{ background: "#fff", border: "1px solid #C9D6E2", color: "#2C5B82" }}>
                          <b>{p.name}</b> &lt;{p.email}&gt;
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            <div className="text-xs mb-2 rounded px-3 py-2" style={{ background: "#EEF3F8", color: NAVY }}>Goes to <b>raghu@nandan.co.in</b> with the DRAFT-watermarked PDF.</div>
          )}
          <label className="block mb-2">
            <div className="text-xs font-semibold mb-0.5" style={{ color: MUTED }}>Subject</div>
            <input value={subject} onChange={(e) => setSubject(e.target.value)}
              className="w-full px-2 py-1.5 rounded border text-sm" style={{ borderColor: BORDER }} />
          </label>
          <div className="text-xs mb-2 rounded px-3 py-2" style={{ background: "#FAF9F5", border: `1px solid ${BORDER}`, color: "var(--dim)" }}>
            The <b>Covering Letter</b> rides as the email body — edit it on the Covering Letter tab. The quotation
            <b> PDF attaches itself</b>{mode === "client" ? " (clean, no watermark)" : " (DRAFT watermark)"}.
          </div>
          <div className="text-xs font-bold mb-1" style={{ color: MUTED, letterSpacing: 0.6 }}>MORE ATTACHMENTS</div>
          {files.length === 0 && <div className="text-xs mb-1" style={{ color: MUTED }}>None on the quote, and the Library is empty.</div>}
          <div style={{ maxHeight: 160, overflowY: "auto" }}>
            {files.map((f) => (
              <label key={f.path} className="flex items-center gap-2 text-sm py-0.5">
                <input type="checkbox" checked={ticked.has(f.path)}
                  onChange={() => setTicked((cur) => { const n = new Set(cur); if (n.has(f.path)) n.delete(f.path); else n.add(f.path); return n; })}
                  style={{ accentColor: NAVY }} />
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</span>
                <span className="text-xs" style={{ color: MUTED }}>{f.from === "library" ? "· Library" : "· this quote"}</span>
              </label>
            ))}
          </div>
          <div className="flex gap-2 mt-2 flex-wrap">
            <label className="text-xs rounded border px-2 py-1 font-bold cursor-pointer" style={{ borderColor: BORDER, background: "#fff" }}>
              {busy === "up" ? "Uploading…" : "⬆ Attach from computer"}
              <input type="file" className="hidden" disabled={busy !== null}
                onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void upload(f, false); }} />
            </label>
            <label className="text-xs rounded border px-2 py-1 font-bold cursor-pointer" style={{ borderColor: BORDER, background: "#fff", color: "#2C5B82" }}>
              ＋ Add to Library (brochures…)
              <input type="file" className="hidden" disabled={busy !== null}
                onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void upload(f, true); }} />
            </label>
          </div>
        </div>
        <div className="flex gap-2 px-4 py-3" style={{ borderTop: `1px solid ${BORDER}` }}>
          <button onClick={() => void send()} disabled={busy !== null}
            className="rounded px-4 py-1.5 text-sm font-bold text-white" style={{ background: busy ? "#B9BEC4" : mode === "client" ? "var(--green)" : "#7C3AED" }}>
            {busy === "send" ? "Pressing the PDF & sending…" : mode === "client" ? "✈ Send to client" : "📨 Send for review"}
          </button>
          <button onClick={onClose} className="rounded px-3 py-1.5 text-sm font-bold" style={{ background: "var(--line-soft)", color: "var(--dim)" }}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

/** The quote's send list, dressed like an email header (Dr Raghu, 30 Aug
 *  2026: "keep like email — To: able to add people and their email id seen;
 *  CC: by default always cced to sales@nandan.co.in"). */
export function QuoteRecipients({ row, onSaved }: { row: Row; onSaved: (r?: Row) => void }) {
  const companyId = row.company_id ? String(row.company_id) : "";
  type P = { id: string; full_name: string | null; primary_email: string | null };
  const [book, setBook] = useState<Map<string, P>>(new Map());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const to = Array.isArray(row.mail_to) ? (row.mail_to as unknown[]).map(String) : [];
  const cc = Array.isArray(row.mail_cc) ? (row.mail_cc as unknown[]).map(String) : [];
  const bcc = Array.isArray(row.mail_bcc) ? (row.mail_bcc as unknown[]).map(String) : [];

  // the address book: the client's people, plus anyone already on the lists
  useEffect(() => {
    let dead = false;
    void (async () => {
      const m = new Map<string, P>();
      if (companyId) {
        try {
          const j = await (await fetch(`/api/crm/person?f_company_id=${encodeURIComponent(companyId)}&limit=200`, { cache: "no-store" })).json();
          for (const p of (j.rows ?? []) as P[]) m.set(String(p.id), p);
        } catch (e) { swallow("crm/CrmApp", e); /* chips heal below */ }
      }
      for (const pid of [...to, ...cc, ...bcc]) {
        if (m.has(pid)) continue;
        try {
          const j = await (await fetch(`/api/crm/person?id=${encodeURIComponent(pid)}`, { cache: "no-store" })).json();
          if (j?.row) m.set(pid, j.row as P);
        } catch (e) { swallow("crm/CrmApp", e); /* an unresolvable chip still shows its ✕ */ }
      }
      if (!dead) setBook(m);
    })();
    return () => { dead = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, to.join(","), cc.join(","), bcc.join(",")]);

  const save2 = async (field: string, v: string) => {
    try {
      const r = await fetch(`/api/crm/quotation?id=${encodeURIComponent(String(row.id))}`, {
        method: "PATCH", headers: { "content-type": "application/json" },
        body: JSON.stringify({ [field]: v }),
      });
      const j = await r.json();
      if (r.ok) onSaved(j.row as Row);
    } catch (e) { swallow("crm/CrmApp", e); /* typed again, saved again */ }
  };
  const save = async (kind: "mail_to" | "mail_cc" | "mail_bcc", ids: string[]) => {
    setBusy(true); setErr("");
    try {
      const r = await fetch(`/api/crm/quotation?id=${encodeURIComponent(String(row.id))}`, {
        method: "PATCH", headers: { "content-type": "application/json" },
        body: JSON.stringify({ [kind]: ids }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Could not save");
      onSaved(j.row as Row);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  const Chip = ({ pid, kind }: { pid: string; kind: "mail_to" | "mail_cc" | "mail_bcc" }) => {
    const p = book.get(pid);
    const email = p?.primary_email || null;
    return (
      <span className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs"
        style={{ background: email ? "#EEF3F8" : "#FDF0E7", border: `1px solid ${email ? "#C9D6E2" : "#F0C9A8"}` }}>
        <b>{p?.full_name || "…"}</b>
        <span style={{ color: email ? "#2C5B82" : "#B3541E" }}>{email ? `<${email}>` : "· no email on record"}</span>
        <button title="Remove" disabled={busy}
          onClick={() => void save(kind, (kind === "mail_to" ? to : kind === "mail_cc" ? cc : bcc).filter((x) => x !== pid))}
          style={{ color: MUTED, fontWeight: 700 }}>✕</button>
      </span>
    );
  };
  const Line = ({ label, kind, ids, fixed }: { label: string; kind: "mail_to" | "mail_cc" | "mail_bcc"; ids: string[]; fixed?: React.ReactNode }) => (
    <div className="flex items-center gap-1.5 flex-wrap py-1.5" style={{ borderBottom: `1px solid ${BORDER}` }}>
      <span className="text-xs font-bold" style={{ color: MUTED, width: 34 }}>{label}</span>
      {fixed}
      {ids.map((pid) => <Chip key={pid} pid={pid} kind={kind} />)}
      <RecipientAdd companyId={companyId || undefined}
        onPick={(pid) => { if (pid && !ids.includes(pid)) void save(kind, [...ids, pid]); }} />
    </div>
  );

  return (
    <div className="rounded border p-3 mt-1" style={{ borderColor: BORDER }}>
      <div className="text-xs font-bold mb-1" style={{ color: MUTED, letterSpacing: 0.6 }}>
        CONTACTS — the quote mails to {busy && <span style={{ fontWeight: 500 }}>· saving…</span>}
      </div>
      {err && <div className="rounded p-2 mb-2 text-sm" style={{ background: "#FBEAE8", color: "#8E2C20" }}>{err}</div>}
      <Line label="To:" kind="mail_to" ids={to} />
      <Line label="CC:" kind="mail_cc" ids={cc}
        fixed={
          <span className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs"
            title="Every quote is always copied to sales — this one cannot be removed"
            style={{ background: "var(--line-soft)", border: `1px solid ${BORDER}`, color: "var(--dim)" }}>
            sales@nandan.co.in <span style={{ fontSize: 10 }}>(always)</span>
          </span>
        } />
      <Line label="BCC:" kind="mail_bcc" ids={bcc} />
      {/* the SUBJECT lives on the quote and prints on page one
          (Dr Raghu, 30 Aug 2026) */}
      <div className="flex items-center gap-1.5 py-1.5" style={{ borderBottom: `1px solid ${BORDER}` }}>
        <span className="text-xs font-bold" style={{ color: MUTED, width: 34, flexShrink: 0 }}>Sub:</span>
        <input defaultValue={String(row.subject ?? "")} placeholder="Subject — prints on the quote's first page and rides the email"
          onBlur={(e) => { if (e.target.value !== String(row.subject ?? "")) void save2("subject", e.target.value); }}
          className="flex-1 px-2 py-1 rounded border text-xs" style={{ borderColor: BORDER, minWidth: 240 }} />
      </div>
      <div className="text-xs mt-1.5" style={{ color: MUTED }}>Type a name to add — the client&apos;s people come up first, then everyone. Type an email nobody has and Genie offers to make the contact. A chip without an email needs one before sending.</div>
    </div>
  );
}