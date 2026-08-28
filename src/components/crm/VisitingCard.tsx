"use client";
/**
 * Tools → Add Visiting Card — the screen is the ledger of scans, ADD NEW is
 * the lightbox: front and back tiles (a tap opens the camera), the verbatim
 * transcript under them, and four buttons that say exactly how far to go —
 * Save (scan on file) · Save and Add to CRM · …and Add Another · Cancel.
 *
 * PersonCardPanel at the foot of this file is the contact's own Visiting
 * Card tab: the images that made the record, plus Enrich from Apollo —
 * which SHOWS what Apollo claims and writes only what the human ticks,
 * because enrichment is a claim by an outside service, not a fact.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { NAVY, NAVY_SOFT, INK, MUTED, BORDER, ORANGE, GREEN } from "./palette";

interface Read {
  person_name: string | null; salutation: string | null; designation: string | null;
  company: string | null; phones: string[]; emails: string[];
  website: string | null; address: string | null; city: string | null; notes: string | null;
  transcript: string | null;
}
interface CardRow {
  id: string; front_url: string | null; back_url: string | null;
  transcript: string | null; status: string; person_id: string | null; added_at: string;
  extracted: Read | null;
}

const EMPTY_FORM = { person_name: "", salutation: "", designation: "", company: "", company_id: "", email: "", phone: "", website: "" };

/**
 * A phone photographs a card at 4000px and 8MB; the model's ceiling is 5MB
 * and nothing on a card needs that many pixels. Shrunk HERE, in the browser
 * — the upload gets fast on mobile data, HEIC becomes plain JPEG, and the
 * reader never sees an image it must refuse. Falls back to the original if
 * the canvas cannot cope.
 */
async function shrinkImage(file: File, maxEdge = 1600): Promise<{ blob: Blob; name: string }> {
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, maxEdge / Math.max(bmp.width, bmp.height));
    const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return { blob: file, name: file.name };
    ctx.drawImage(bmp, 0, 0, w, h);
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.85));
    return blob ? { blob, name: file.name.replace(/\.[^.]+$/, "") + ".jpg" } : { blob: file, name: file.name };
  } catch {
    return { blob: file, name: file.name };
  }
}

export default function VisitingCard({ onOpen }: { onOpen: (target: string, id: string) => void }) {
  const [cards, setCards] = useState<CardRow[] | null>(null);
  const [needs, setNeeds] = useState(false);
  const [box, setBox] = useState(false);

  const load = useCallback(() => {
    fetch("/api/crm/visiting-card").then(async (r) => {
      const j = await r.json();
      setCards(j.cards || []); setNeeds(!!j.needsMigration);
    }).catch(() => setCards([]));
  }, []);
  useEffect(() => { load(); }, [load]);

  return (
    <div style={{ maxWidth: 980 }}>
      <div className="flex items-center gap-3 mb-1">
        <h2 className="font-bold" style={{ fontSize: 17, color: INK }}>🪪 Visiting Cards</h2>
        <button onClick={() => setBox(true)} className="rounded px-3 py-1.5 font-bold"
          style={{ background: ORANGE, color: "#fff", fontSize: 13 }}>+ Add new</button>
      </div>
      <p className="text-xs mb-3" style={{ color: MUTED, maxWidth: "72ch", lineHeight: 1.6 }}>
        Every card scanned, and what it became. The image is kept as the evidence the record was typed from.
      </p>
      {needs && <div className="text-xs rounded border p-2 mb-3" style={{ borderColor: "#F5D9A8", background: "#FFF7E6", color: "#8A5B00" }}>Run CRM migrations 0018 and 0019 — the card ledger has nowhere to live yet.</div>}

      <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}>
        {(cards || []).map((c) => (
          <div key={c.id} className="rounded border p-2" style={{ borderColor: BORDER, background: "#fff" }}>
            {c.front_url
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={c.front_url} alt="card" className="rounded w-full" style={{ height: 110, objectFit: "cover" }} />
              : <div className="rounded" style={{ height: 110, background: "#F2F4F8" }} />}
            <div className="flex items-center gap-1.5 mt-1.5">
              <span className="rounded px-1.5 font-bold" style={{ fontSize: 9.5, background: c.status === "added" ? "#E6F4EB" : NAVY_SOFT, color: c.status === "added" ? GREEN : NAVY }}>
                {c.status === "added" ? "IN CRM" : "SAVED"}
              </span>
              <span style={{ fontSize: 10, color: MUTED }}>{String(c.added_at).slice(0, 10)}</span>
              <span style={{ flex: 1 }} />
              {c.person_id && (
                <button onClick={() => onOpen("person", c.person_id!)} className="underline font-bold" style={{ fontSize: 10.5, color: NAVY }}>contact ↗</button>
              )}
            </div>
            <div style={{ fontSize: 11, color: INK, fontWeight: 700, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {c.extracted?.person_name || c.transcript?.split("\n")[0] || "(unread)"}
            </div>
          </div>
        ))}
        {cards !== null && !cards.length && !needs && (
          <div className="text-sm" style={{ color: MUTED }}>No cards yet — press Add new.</div>
        )}
      </div>

      {box && <CardLightbox onClose={() => setBox(false)} onChanged={load} onOpen={onOpen} />}
    </div>
  );
}

/* ══════════ the lightbox ══════════ */
function CardLightbox({ onClose, onChanged, onOpen }: {
  onClose: () => void; onChanged: () => void; onOpen: (t: string, id: string) => void;
}) {
  const frontRef = useRef<HTMLInputElement>(null);
  const backRef = useRef<HTMLInputElement>(null);
  const [previews, setPreviews] = useState<{ front: string | null; back: string | null }>({ front: null, back: null });
  const [paths, setPaths] = useState<{ front: string | null; back: string | null }>({ front: null, back: null });
  const [read, setRead] = useState<Read | null>(null);
  const [transcript, setTranscript] = useState("");
  const [matches, setMatches] = useState<{ id: string; name: string }[]>([]);
  const [f, setF] = useState({ ...EMPTY_FORM });
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const [note, setNote] = useState("");

  const upload = async (side: "front" | "back", file: File | null) => {
    if (!file) return;
    setPreviews((p) => ({ ...p, [side]: URL.createObjectURL(file) }));
    setBusy(side); setErr("");
    try {
      const small = await shrinkImage(file);
      const fd = new FormData();
      fd.append("file", small.blob, small.name); fd.append("side", side);
      const r = await fetch("/api/crm/visiting-card", { method: "POST", body: fd });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(String(j.error || r.status));
      setPaths((p) => ({ ...p, [side]: String(j.path) }));
      if (side === "front") {
        const rd = (j.read || null) as Read | null;
        setRead(rd); setMatches(j.matches || []);
        if (rd) {
          setTranscript(rd.transcript || "");
          setF({
            person_name: rd.person_name || "", salutation: rd.salutation || "",
            designation: rd.designation || "", company: rd.company || "", company_id: "",
            email: rd.emails?.[0] || "", phone: rd.phones?.[0] || "", website: rd.website || "",
          });
          setNote("Read from the card — check every field, especially the digits.");
        } else setNote(`Stored, but nothing could be read${j.why ? ` — ${j.why}` : ""}. Type it in.`);
      }
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    setBusy(null);
  };

  const saveOnly = async (): Promise<string | null> => {
    const r = await fetch("/api/crm/visiting-card", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "save", path: paths.front, back_path: paths.back, transcript, extracted: read }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(String(j.error || r.status));
    return j.card_id ?? null;
  };
  const addToCrm = async (cardId: string | null) => {
    const r = await fetch("/api/crm/visiting-card", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "create", ...f, path: paths.front, back_path: paths.back, transcript, extracted: read, card_id: cardId }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(String(j.error || r.status));
    return j as { person_id: string | null; company_id: string | null };
  };

  const reset = () => {
    setPreviews({ front: null, back: null }); setPaths({ front: null, back: null });
    setRead(null); setTranscript(""); setMatches([]); setF({ ...EMPTY_FORM }); setNote(""); setErr("");
    if (frontRef.current) frontRef.current.value = "";
    if (backRef.current) backRef.current.value = "";
  };

  const go = async (mode: "save" | "crm" | "crm_more") => {
    if (!paths.front) { setErr("Photograph the front first."); return; }
    if (mode !== "save" && !f.person_name.trim()) { setErr("The contact needs a name to go into the CRM."); return; }
    setBusy(mode); setErr("");
    try {
      if (mode === "save") { await saveOnly(); onChanged(); onClose(); return; }
      const cardId = await saveOnly();
      const made = await addToCrm(cardId);
      onChanged();
      if (mode === "crm") {
        if (made.person_id) onOpen("person", made.person_id);
        onClose();
      } else {
        setNote("Added to CRM ✓ — next card");
        reset();
      }
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    setBusy(null);
  };

  const Tile = ({ side }: { side: "front" | "back" }) => {
    const ref = side === "front" ? frontRef : backRef;
    const img = previews[side];
    return (
      <button onClick={() => ref.current?.click()} className="rounded border relative"
        title={`${side === "front" ? "Front" : "Back"} — tap to photograph or choose an image`}
        style={{ borderColor: paths[side] ? GREEN : BORDER, borderStyle: img ? "solid" : "dashed", height: 150, background: "#F8F9FC", overflow: "hidden" }}>
        {img
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={img} alt={side} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
          : <span style={{ fontSize: 12.5, color: MUTED, fontWeight: 700 }}>📷 {side === "front" ? "FRONT" : "BACK"}</span>}
        {busy === side && <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(255,255,255,.7)", fontSize: 12, fontWeight: 700, color: NAVY }}>reading…</span>}
        <input ref={ref} type="file" accept="image/*" capture="environment" hidden
          onChange={(e) => upload(side, e.target.files?.[0] ?? null)} />
      </button>
    );
  };

  const I = (k: keyof typeof f, label: string) => (
    <label className="block mb-1.5" style={{ fontSize: 11, color: MUTED }}>
      {label}
      <input value={f[k]} onChange={(e) => setF((x) => ({ ...x, [k]: e.target.value }))}
        className="w-full rounded border px-2 py-1 block" style={{ borderColor: BORDER, fontSize: 13, color: INK }} />
    </label>
  );

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 70, background: "rgba(22,35,47,.5)", display: "flex", alignItems: "stretch", justifyContent: "center", padding: "10px 16px" }}>
      <div onClick={(e) => e.stopPropagation()} className="rounded" style={{ background: "#fff", width: "min(760px,100%)", height: "calc(100vh - 20px)", display: "flex", flexDirection: "column", minHeight: 0, boxShadow: "0 12px 40px rgba(27,45,107,.35)" }}>
        <div className="flex items-center justify-between px-4 py-3" style={{ background: NAVY, borderRadius: "6px 6px 0 0", flexShrink: 0 }}>
          <b className="text-white" style={{ fontSize: 15 }}>🪪 Add Visiting Card</b>
          <button onClick={onClose} className="px-2 py-1 rounded text-sm font-semibold" style={{ background: "rgba(255,255,255,.12)", color: "#C8D2DC" }}>✕</button>
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: 16 }}>
          <div className="grid gap-3 mb-3" style={{ gridTemplateColumns: "1fr 1fr" }}>
            <Tile side="front" /><Tile side="back" />
          </div>

          {note && <div className="text-xs font-semibold mb-2" style={{ color: note.includes("✓") ? GREEN : "#8A5B00" }}>{note}</div>}
          {err && <div className="text-xs font-semibold mb-2" style={{ color: "#B3261E" }}>{err}</div>}

          <div style={{ fontSize: 10.5, letterSpacing: ".04em", fontWeight: 800, color: MUTED, marginBottom: 3 }}>TRANSCRIBED TEXT</div>
          <textarea value={transcript} onChange={(e) => setTranscript(e.target.value)} rows={5}
            placeholder="Everything printed on the card, line by line — filled by the reader, correctable by you."
            className="w-full rounded border px-2 py-1.5 mb-3" style={{ borderColor: BORDER, fontSize: 12.5, lineHeight: 1.55, fontFamily: "ui-monospace, monospace" }} />

          <div className="grid gap-x-3" style={{ gridTemplateColumns: "1fr 1fr" }}>
            {I("person_name", "Name")}{I("designation", "Designation")}
            {I("company", "Company")}{I("email", "Email")}
            {I("phone", "Phone")}{I("website", "Website")}
          </div>
          {matches.length > 0 && !f.company_id && (
            <div className="text-xs rounded border p-2 mt-1" style={{ borderColor: "#F5D9A8", background: "#FFF7E6", color: "#8A5B00" }}>
              Existing compan{matches.length === 1 ? "y" : "ies"} with a similar name — pick to attach there instead of duplicating:{" "}
              {matches.map((m) => (
                <button key={m.id} onClick={() => setF((x) => ({ ...x, company_id: m.id, company: m.name }))} className="underline mr-2 font-bold" style={{ color: NAVY }}>{m.name}</button>
              ))}
            </div>
          )}
          {f.company_id && <div className="text-xs mt-1" style={{ color: GREEN }}>✓ attaching to the existing company</div>}
          {(read?.phones?.length || 0) > 1 && (
            <div className="text-xs mt-1" style={{ color: MUTED }}>
              Other numbers: {read!.phones.slice(1).map((p) => (
                <button key={p} onClick={() => setF((x) => ({ ...x, phone: p }))} className="underline mr-2" style={{ color: NAVY }}>{p}</button>
              ))}
            </div>
          )}
        </div>

        <div className="flex gap-2 flex-wrap px-4 py-3" style={{ borderTop: `1px solid ${BORDER}`, flexShrink: 0 }}>
          <button onClick={() => go("save")} disabled={busy !== null}
            className="rounded px-3 py-2 font-bold" style={{ background: NAVY_SOFT, color: NAVY, fontSize: 13 }}
            title="Keep the scan on file — no CRM records yet">
            Save
          </button>
          <button onClick={() => go("crm")} disabled={busy !== null}
            className="rounded px-3 py-2 font-bold" style={{ background: GREEN, color: "#fff", fontSize: 13 }}>
            Save and Add to CRM
          </button>
          <button onClick={() => go("crm_more")} disabled={busy !== null}
            className="rounded px-3 py-2 font-bold" style={{ background: ORANGE, color: "#fff", fontSize: 13 }}>
            Save, Add to CRM &amp; Add Another
          </button>
          <span style={{ flex: 1 }} />
          <button onClick={onClose} className="rounded px-3 py-2 font-bold" style={{ color: MUTED, fontSize: 13 }}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

/* ══════════ the contact's own tab ══════════ */
export function PersonCardPanel({ personId, personRow, onSaved }: {
  personId: string; personRow: Record<string, unknown>; onSaved: () => void;
}) {
  const [cards, setCards] = useState<CardRow[] | null>(null);
  const [sug, setSug] = useState<Record<string, string | null> | null>(null);
  const [ticked, setTicked] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    fetch(`/api/crm/visiting-card?person_id=${encodeURIComponent(personId)}`)
      .then(async (r) => setCards(((await r.json()).cards || []) as CardRow[]))
      .catch(() => setCards([]));
  }, [personId]);

  const lookup = async () => {
    setBusy("lookup"); setMsg("");
    try {
      const r = await fetch("/api/crm/enrich", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "lookup", person_id: personId }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(String(j.error || r.status));
      if (!j.found) { setMsg("Apollo has no match for this contact."); setSug(null); }
      else {
        setSug(j.suggestion);
        const t: Record<string, boolean> = {};
        for (const k of ["job_title", "department", "primary_email", "primary_phone"])
          t[k] = !!j.suggestion[k] && !String(personRow[k] ?? "").trim();
        setTicked(t);
      }
    } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
    setBusy(null);
  };

  const apply = async () => {
    setBusy("apply"); setMsg("");
    try {
      const fields: Record<string, string> = {};
      for (const [k, on] of Object.entries(ticked)) if (on && sug?.[k]) fields[k] = String(sug[k]);
      const r = await fetch("/api/crm/enrich", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "apply", person_id: personId, fields }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(String(j.error || r.status));
      setMsg(`Applied ${j.applied.length} field${j.applied.length === 1 ? "" : "s"} ✓`);
      onSaved();
    } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
    setBusy(null);
  };

  const APPLYABLE = ["job_title", "department", "primary_email", "primary_phone"];
  const LABEL: Record<string, string> = {
    job_title: "Designation", department: "Department", primary_email: "Email", primary_phone: "Phone",
    linkedin: "LinkedIn", city: "Location", company: "Company (per Apollo)", seniority: "Seniority", name: "Name (per Apollo)",
  };

  return (
    <div className="p-4">
      <div style={{ fontSize: 11, letterSpacing: ".04em", fontWeight: 800, color: MUTED, marginBottom: 6 }}>VISITING CARD</div>
      {cards === null ? <div className="text-xs" style={{ color: MUTED }}>loading…</div>
        : !cards.length ? <div className="text-xs mb-3" style={{ color: MUTED }}>No card on file for this contact — Tools → Add Visiting Card files one.</div>
        : (
          <div className="flex gap-2 flex-wrap mb-3">
            {cards.map((c) => (
              <div key={c.id} className="flex gap-2">
                {c.front_url && /* eslint-disable-next-line @next/next/no-img-element */
                  <a href={c.front_url} target="_blank" rel="noopener noreferrer"><img src={c.front_url} alt="front" className="rounded border" style={{ borderColor: BORDER, height: 130 }} /></a>}
                {c.back_url && /* eslint-disable-next-line @next/next/no-img-element */
                  <a href={c.back_url} target="_blank" rel="noopener noreferrer"><img src={c.back_url} alt="back" className="rounded border" style={{ borderColor: BORDER, height: 130 }} /></a>}
              </div>
            ))}
          </div>
        )}

      <div style={{ fontSize: 11, letterSpacing: ".04em", fontWeight: 800, color: MUTED, margin: "10px 0 6px" }}>ENRICH FROM APOLLO.IO</div>
      <button onClick={lookup} disabled={busy !== null} className="rounded px-3 py-1.5 font-bold" style={{ background: NAVY, color: "#fff", fontSize: 12.5 }}>
        {busy === "lookup" ? "Asking Apollo…" : "Look this contact up"}
      </button>
      {msg && <span className="text-xs font-semibold ml-2" style={{ color: msg.includes("✓") ? GREEN : "#8A5B00" }}>{msg}</span>}

      {sug && (
        <div className="rounded border p-3 mt-2" style={{ borderColor: BORDER, maxWidth: 560 }}>
          <div className="text-xs mb-2" style={{ color: MUTED }}>
            What Apollo claims — tick what should be written. A claim by an outside service goes through the same hands as a visiting card.
          </div>
          {Object.entries(LABEL).map(([k, label]) => {
            const v = sug[k];
            if (!v) return null;
            const applyable = APPLYABLE.includes(k);
            return (
              <div key={k} className="flex items-center gap-2 py-0.5" style={{ fontSize: 12.5 }}>
                {applyable
                  ? <input type="checkbox" checked={!!ticked[k]} onChange={(e) => setTicked((t) => ({ ...t, [k]: e.target.checked }))} />
                  : <span style={{ width: 13 }} />}
                <span style={{ width: 130, color: MUTED }}>{label}</span>
                {k === "linkedin"
                  ? <a href={String(v)} target="_blank" rel="noopener noreferrer" className="underline" style={{ color: NAVY }}>{String(v)}</a>
                  : <b style={{ color: INK }}>{String(v)}</b>}
                {applyable && String(personRow[k] ?? "").trim() && (
                  <span style={{ fontSize: 10.5, color: MUTED }}>(now: {String(personRow[k])})</span>
                )}
              </div>
            );
          })}
          <button onClick={apply} disabled={busy !== null || !Object.values(ticked).some(Boolean)}
            className="rounded px-3 py-1.5 font-bold mt-2" style={{ background: GREEN, color: "#fff", fontSize: 12.5 }}>
            {busy === "apply" ? "Writing…" : "Apply the ticked fields"}
          </button>
        </div>
      )}
    </div>
  );
}
