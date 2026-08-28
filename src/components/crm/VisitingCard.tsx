"use client";
/**
 * Tools → Add Visiting Card.
 *
 * Photograph → Claude reads what is PRINTED (never what it can guess) → the
 * human checks every field → one press makes the Contact and, where needed,
 * the Company. Matching companies are offered by name so "existing or new"
 * is a decision made with names in front of you, not a duplicate found in
 * next month's merge.
 */
import { useRef, useState } from "react";
import { NAVY, NAVY_SOFT, INK, MUTED, BORDER, ORANGE, GREEN } from "./palette";

interface Read {
  person_name: string | null; salutation: string | null; designation: string | null;
  company: string | null; phones: string[]; emails: string[];
  website: string | null; address: string | null; city: string | null; notes: string | null;
}

export default function VisitingCard({ onOpen }: { onOpen: (target: string, id: string) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState<"read" | "create" | null>(null);
  const [err, setErr] = useState("");
  const [note, setNote] = useState("");
  const [path, setPath] = useState<string | null>(null);
  const [read, setRead] = useState<Read | null>(null);
  const [matches, setMatches] = useState<{ id: string; name: string }[]>([]);
  const [f, setF] = useState({ person_name: "", salutation: "", designation: "", company: "", company_id: "", email: "", phone: "", website: "" });
  const [made, setMade] = useState<{ person_id: string | null; company_id: string | null } | null>(null);

  const pick = (file: File | null) => {
    if (!file) return;
    setPreview(URL.createObjectURL(file));
    setRead(null); setMade(null); setErr(""); setNote("");
  };

  const readIt = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) { setErr("Photograph the card first."); return; }
    setBusy("read"); setErr(""); setNote("");
    try {
      const fd = new FormData(); fd.append("file", file);
      const r = await fetch("/api/crm/visiting-card", { method: "POST", body: fd });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(String(j.error || r.status));
      setPath(String(j.path));
      const rd = (j.read || null) as Read | null;
      setRead(rd); setMatches(j.matches || []);
      if (rd) {
        setF({
          person_name: rd.person_name || "", salutation: rd.salutation || "",
          designation: rd.designation || "", company: rd.company || "", company_id: "",
          email: rd.emails?.[0] || "", phone: rd.phones?.[0] || "", website: rd.website || "",
        });
        setNote("Read from the card. Check every field — especially the digits — before creating anything.");
      } else setNote(`The image is stored but nothing could be read${j.why ? ` — ${j.why}` : ""}. Type it in.`);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    setBusy(null);
  };

  const create = async () => {
    if (!f.person_name.trim()) { setErr("The contact needs a name."); return; }
    setBusy("create"); setErr("");
    try {
      const r = await fetch("/api/crm/visiting-card", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "create", ...f, path, extracted: read }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(String(j.error || r.status));
      setMade({ person_id: j.person_id, company_id: j.company_id });
      setNote("Created ✓");
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    setBusy(null);
  };

  const I = (k: keyof typeof f, label: string, ph = "") => (
    <label className="block mb-2" style={{ fontSize: 11.5, color: MUTED }}>
      {label}
      <input value={f[k]} placeholder={ph} onChange={(e) => setF((x) => ({ ...x, [k]: e.target.value }))}
        className="w-full rounded border px-2 py-1.5 block" style={{ borderColor: BORDER, fontSize: 13.5, color: INK }} />
    </label>
  );

  return (
    <div style={{ maxWidth: 880 }}>
      <h2 className="font-bold mb-1" style={{ fontSize: 17, color: INK }}>🪪 Add Visiting Card</h2>
      <p className="text-xs mb-3" style={{ color: MUTED, maxWidth: "70ch", lineHeight: 1.6 }}>
        Photograph the card — the details are read off it and checked by you before anything is created.
        The image is kept as the evidence the record was typed from.
      </p>

      <div className="grid gap-4" style={{ gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)" }}>
        <div>
          <div className="rounded-lg border p-3 mb-3" style={{ borderColor: BORDER, background: "#fff" }}>
            <input ref={fileRef} type="file" accept="image/*" capture="environment"
              onChange={(e) => pick(e.target.files?.[0] ?? null)} style={{ fontSize: 12, maxWidth: "100%" }} />
            {preview && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview} alt="the card" className="rounded border mt-2"
                style={{ borderColor: BORDER, maxWidth: "100%", maxHeight: 260, objectFit: "contain" }} />
            )}
            <button onClick={readIt} disabled={busy !== null}
              className="rounded px-3 py-1.5 font-bold mt-2 block" style={{ background: NAVY, color: "#fff", fontSize: 12.5 }}>
              {busy === "read" ? "Reading…" : "Read the card"}
            </button>
          </div>
          {read?.notes && <div className="text-xs rounded border p-2" style={{ borderColor: BORDER, color: MUTED, background: "#F8F9FC" }}><b>On the card:</b> {read.notes}</div>}
          {(read?.phones?.length || 0) > 1 && (
            <div className="text-xs mt-2" style={{ color: MUTED }}>
              Other numbers on the card:{" "}
              {read!.phones.slice(1).map((p) => (
                <button key={p} onClick={() => setF((x) => ({ ...x, phone: p }))} className="underline mr-2" style={{ color: NAVY }}>{p}</button>
              ))}
            </div>
          )}
        </div>

        <div>
          {note && <div className="text-xs font-semibold mb-2" style={{ color: note.includes("✓") ? GREEN : "#8A5B00" }}>{note}</div>}
          {err && <div className="text-xs font-semibold mb-2" style={{ color: "#B3261E" }}>{err}</div>}

          {I("person_name", "Name")}
          <div className="grid gap-2" style={{ gridTemplateColumns: "90px 1fr" }}>
            {I("salutation", "Salutation", "Mr / Dr")}
            {I("designation", "Designation")}
          </div>
          {I("company", "Company")}
          {matches.length > 0 && !f.company_id && (
            <div className="text-xs rounded border p-2 mb-2" style={{ borderColor: "#F5D9A8", background: "#FFF7E6", color: "#8A5B00" }}>
              Existing compan{matches.length === 1 ? "y" : "ies"} with a similar name — pick one to attach the contact there instead of creating a duplicate:{" "}
              {matches.map((m) => (
                <button key={m.id} onClick={() => setF((x) => ({ ...x, company_id: m.id, company: m.name }))}
                  className="underline mr-2 font-bold" style={{ color: NAVY }}>{m.name}</button>
              ))}
            </div>
          )}
          {f.company_id && (
            <div className="text-xs mb-2" style={{ color: GREEN }}>
              ✓ attaching to the existing company · <button onClick={() => setF((x) => ({ ...x, company_id: "" }))} className="underline" style={{ color: MUTED }}>undo</button>
            </div>
          )}
          {I("email", "Email")}
          {I("phone", "Phone")}
          {I("website", "Website")}

          {!made ? (
            <button onClick={create} disabled={busy !== null}
              className="rounded px-4 py-2 font-bold" style={{ background: GREEN, color: "#fff", fontSize: 13.5 }}>
              {busy === "create" ? "Creating…" : `✓ Create contact${f.company_id ? "" : f.company.trim() ? " + company" : ""}`}
            </button>
          ) : (
            <div className="flex gap-2 flex-wrap">
              {made.person_id && <button onClick={() => onOpen("person", made.person_id!)} className="rounded px-3 py-1.5 font-bold" style={{ background: NAVY, color: "#fff", fontSize: 12.5 }}>Open the contact</button>}
              {made.company_id && <button onClick={() => onOpen("company", made.company_id!)} className="rounded px-3 py-1.5 font-bold" style={{ background: NAVY_SOFT, color: NAVY, fontSize: 12.5 }}>Open the company</button>}
              <button onClick={() => { setMade(null); setRead(null); setPreview(null); setF({ person_name: "", salutation: "", designation: "", company: "", company_id: "", email: "", phone: "", website: "" }); if (fileRef.current) fileRef.current.value = ""; }}
                className="rounded px-3 py-1.5 font-bold" style={{ background: ORANGE, color: "#fff", fontSize: 12.5 }}>+ Next card</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
