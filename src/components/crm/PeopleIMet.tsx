"use client";
/**
 * PEOPLE I MET — the context nobody else writes down, and what it produces.
 *
 * Dr Raghu, 16 Sep 2026: "make an app called people i met. I should be able
 * to add from database or from card or add alone. Add a field to add context.
 * With each contact have option for personalised email and message ... the
 * queue on wa also should be made so it can be sent manually from my own wa.
 * It makes message and keeps."
 *
 * THE CONTEXT IS THE RECORD. A name and a company are already in the CRM and
 * already useless on their own. What decides whether a follow-up is worth
 * sending is the line nobody writes down — which hall, what was said, what
 * was promised. By the evening they are a face half remembered.
 *
 * THE REASON IS A LENS, NOT A SENTENCE. It never appears in the message. It
 * decides three things and nothing else: the last line, whether a claim about
 * the sender is used at all, and whether there is an ask. "Keep warm" earns
 * its place — without it every friendly chat turns into a pitch.
 *
 * NOTHING SENDS ITSELF. The e-mail waits in the queue for the hand that read
 * it; the WhatsApp is written, kept, and copied out to his own phone. A
 * WhatsApp from a business gateway reads as a business gateway. The same
 * words from his own number, to somebody who met him an hour ago, read as him.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { NAVY, NAVY_SOFT, INK, MUTED, BORDER, ORANGE, GREEN } from "./palette";

type Met = {
  id: string; source: string; person_id: string | null; card_id: string | null;
  name: string; company_name: string | null; job_title: string | null;
  email: string | null; phone: string | null;
  context: string | null; met_on: string; event: string | null; reason: string;
  added_by: string;
};
type Reason = { key: string; label: string; ask: string };
type Draft = { channel: "email" | "whatsapp"; subject: string; body: string };

const box: React.CSSProperties = { border: `1px solid ${BORDER}`, borderRadius: 6, padding: "4px 7px", fontSize: 13, color: INK, width: "100%" };

export default function PeopleIMet({ onOpen }: { onOpen: (target: string, id: string) => void }) {
  const [rows, setRows] = useState<Met[] | null>(null);
  const [queued, setQueued] = useState<Record<string, { email?: string; whatsapp?: string }>>({});
  const [reasons, setReasons] = useState<Reason[]>([]);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false);
  const [open, setOpen] = useState<Met | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/crm/met", { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(String(j.error || r.status));
      setRows(j.people || []); setQueued(j.queued || {}); setReasons(j.reasons || []); setErr("");
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); setRows([]); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const shown = useMemo(() => {
    const k = q.trim().toLowerCase();
    if (!k || !rows) return rows || [];
    return rows.filter((m) => [m.name, m.company_name, m.event, m.context, m.job_title]
      .some((v) => String(v || "").toLowerCase().includes(k)));
  }, [rows, q]);

  const byEvent = useMemo(() => {
    const g = new Map<string, Met[]>();
    for (const m of shown) { const k = m.event?.trim() || "—"; g.set(k, [...(g.get(k) || []), m]); }
    return [...g.entries()];
  }, [shown]);

  return (
    <div className="p-4">
      <div className="flex items-center gap-2 flex-wrap mb-2">
        <div>
          <div className="text-xs font-bold" style={{ color: MUTED, letterSpacing: 1.4 }}>TOOLS</div>
          <div className="text-lg font-bold" style={{ color: NAVY, lineHeight: 1.2 }}>🤝 People I Met</div>
        </div>
        <div className="flex-1" style={{ minWidth: 10 }} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="name, company, show, anything in the context…"
          style={{ ...box, width: 280 }} />
        <button onClick={() => setAdding(true)} className="text-xs font-bold rounded px-3 py-1.5 text-white" style={{ background: ORANGE }}>
          + Someone I met
        </button>
      </div>
      <div className="text-xs mb-3" style={{ color: MUTED, lineHeight: 1.6 }}>
        Add them from the CRM, from a card you scanned, or from nothing at all when there was no card.
        <b> The context is the record</b> — where you met, what was said, what you promised. Genie writes the follow-up from that,
        and <b>nothing sends itself</b>: the e-mail waits for your hand and the WhatsApp is written for you to send from your own phone.
      </div>

      {err && <div className="rounded border p-2 mb-2 text-xs font-semibold" style={{ borderColor: "#B3261E", color: "#B3261E", background: "#FDF3F2" }}>{err}</div>}

      {rows && rows.length === 0 && (
        <div className="rounded border p-4 text-sm" style={{ borderColor: BORDER, color: MUTED, background: "#FAFBFD" }}>
          Nobody yet. After a show, add each person with a line about the conversation while you still remember it.
        </div>
      )}

      {byEvent.map(([event, people]) => (
        <div key={event} className="mb-4">
          <div className="text-xs font-bold mb-1" style={{ color: MUTED, letterSpacing: 1 }}>
            {event === "—" ? "NO EVENT NAMED" : event.toUpperCase()} · {people.length}
          </div>
          <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fill, minmax(290px, 1fr))" }}>
            {people.map((m) => (
              <div key={m.id} className="rounded border p-2" style={{ borderColor: BORDER, background: "#fff" }}>
                <div className="flex items-start gap-2">
                  <span style={{ minWidth: 0, flex: 1 }}>
                    <div className="font-bold" style={{ color: NAVY, fontSize: 14 }}>{m.name}</div>
                    <div style={{ fontSize: 11.5, color: MUTED }}>
                      {[m.job_title, m.company_name].filter(Boolean).join(" · ") || "—"}
                    </div>
                  </span>
                  <span className="rounded px-1.5" style={{ background: NAVY_SOFT, color: NAVY, fontSize: 10, fontWeight: 700, whiteSpace: "nowrap" }}>
                    {m.source === "database" ? "from CRM" : m.source === "card" ? "from a card" : "typed"}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: m.context ? INK : "#B23B12", margin: "5px 0", lineHeight: 1.5 }}>
                  {m.context || "No context yet — without it the follow-up has nothing true to say."}
                </div>
                <div className="flex items-center gap-1 flex-wrap" style={{ fontSize: 11, color: MUTED }}>
                  <span>{m.met_on}</span>
                  {queued[m.id]?.email && <span title="An e-mail is written and waiting in the queue" style={{ color: GREEN, fontWeight: 700 }}>✉ ready</span>}
                  {queued[m.id]?.whatsapp && <span title="A WhatsApp is written and waiting for you to send" style={{ color: GREEN, fontWeight: 700 }}>💬 ready</span>}
                  <span className="flex-1" />
                  {m.person_id && <button onClick={() => onOpen("person", m.person_id!)} style={{ color: "var(--blue)", textDecoration: "underline" }}>record</button>}
                  <button onClick={() => setOpen(m)} className="font-bold" style={{ color: ORANGE }}>open</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {adding && <AddBox reasons={reasons} onClose={() => setAdding(false)} onDone={() => { setAdding(false); load(); }} />}
      {open && <MetBox met={open} reasons={reasons} queued={queued[open.id] || {}} onClose={() => setOpen(null)} onChanged={load} />}
    </div>
  );
}

/* ── ADDING: three doors, one row ─────────────────────────────────────── */
function AddBox({ reasons, onClose, onDone }: { reasons: Reason[]; onClose: () => void; onDone: () => void }) {
  const [door, setDoor] = useState<"typed" | "database" | "card">("typed");
  const [f, setF] = useState({ name: "", company_name: "", job_title: "", email: "", phone: "", context: "", event: "", reason: "keep_warm", person_id: "", card_id: "" });
  const [hits, setHits] = useState<{ id: string; full_name: string; primary_email: string | null; company: string | null }[]>([]);
  const [look, setLook] = useState("");
  const [cards, setCards] = useState<{ id: string; name: string; company: string | null; email: string | null }[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (door !== "database" || look.trim().length < 2) { setHits([]); return; }
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/crm/search?q=${encodeURIComponent(look)}&doctype=person`, { cache: "no-store" });
        const j = await r.json();
        setHits((j.rows || j.results || []).slice(0, 8));
      } catch { setHits([]); }
    }, 250);
    return () => clearTimeout(t);
  }, [look, door]);

  useEffect(() => {
    if (door !== "card") return;
    fetch("/api/crm/visiting-card", { cache: "no-store" }).then(async (r) => {
      const j = await r.json();
      const list = (j.cards || []).filter((c: Record<string, unknown>) => c.extracted).slice(0, 30)
        .map((c: Record<string, unknown>) => {
          const x = c.extracted as Record<string, unknown>;
          return { id: String(c.id), name: String(x.person_name || "(no name read)"), company: (x.company as string) || null, email: ((x.emails as string[]) || [])[0] || null };
        });
      setCards(list);
    }).catch(() => setCards([]));
  }, [door]);

  const save = async () => {
    setBusy(true); setErr("");
    try {
      const r = await fetch("/api/crm/met", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "add", source: door, ...f }) });
      const j = await r.json();
      if (!r.ok) throw new Error(String(j.error || r.status));
      onDone();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    setBusy(false);
  };

  const I = (k: keyof typeof f, label: string, ph?: string) => (
    <label className="block" style={{ fontSize: 11, color: MUTED }}>{label}
      <input value={f[k]} onChange={(e) => setF((x) => ({ ...x, [k]: e.target.value }))} placeholder={ph} style={box} /></label>
  );

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 70, background: "rgba(22,35,47,.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} className="rounded bg-white" style={{ width: "min(620px,100%)", maxHeight: "calc(100vh - 32px)", overflowY: "auto" }}>
        <div className="flex items-center justify-between px-4 py-3" style={{ background: NAVY, borderRadius: "6px 6px 0 0" }}>
          <b className="text-white" style={{ fontSize: 15 }}>🤝 Someone I met</b>
          <button onClick={onClose} className="px-2 py-1 rounded text-sm font-semibold" style={{ background: "rgba(255,255,255,.12)", color: "#C8D2DC" }}>✕</button>
        </div>
        <div className="p-4">
          <div className="flex gap-1 mb-3">
            {([["typed", "Type it in"], ["database", "From the CRM"], ["card", "From a card"]] as const).map(([k, label]) => (
              <button key={k} onClick={() => setDoor(k)} className="text-xs font-bold rounded px-2.5 py-1.5"
                style={{ background: door === k ? NAVY : "#fff", color: door === k ? "#fff" : NAVY, border: `1px solid ${BORDER}` }}>{label}</button>
            ))}
          </div>

          {door === "database" && (
            <div className="mb-3">
              <input value={look} onChange={(e) => setLook(e.target.value)} placeholder="search the CRM for a name…" style={box} />
              {hits.map((h) => (
                <button key={h.id} onClick={() => { setF((x) => ({ ...x, person_id: h.id, name: h.full_name, email: h.primary_email || "", company_name: h.company || "" })); setLook(h.full_name); setHits([]); }}
                  className="block w-full text-left px-2 py-1 text-sm hover:bg-gray-50" style={{ color: INK }}>
                  {h.full_name} <span style={{ color: MUTED, fontSize: 11 }}>{h.company || ""} {h.primary_email || ""}</span>
                </button>
              ))}
              {f.person_id && <div className="text-xs mt-1" style={{ color: GREEN }}>✓ attached to their CRM record</div>}
            </div>
          )}

          {door === "card" && (
            <div className="mb-3" style={{ maxHeight: 170, overflowY: "auto", border: `1px solid ${BORDER}`, borderRadius: 6 }}>
              {cards.length === 0 && <div className="p-2 text-xs" style={{ color: MUTED }}>No scanned cards yet — use Add Visiting Card first.</div>}
              {cards.map((c) => (
                <button key={c.id} onClick={() => setF((x) => ({ ...x, card_id: c.id, name: c.name, company_name: c.company || "", email: c.email || "" }))}
                  className="block w-full text-left px-2 py-1 text-sm hover:bg-gray-50"
                  style={{ color: INK, background: f.card_id === c.id ? "#EFF6FF" : undefined }}>
                  {c.name} <span style={{ color: MUTED, fontSize: 11 }}>{c.company || ""}</span>
                </button>
              ))}
            </div>
          )}

          <div style={{ display: "grid", gap: 6, gridTemplateColumns: "1fr 1fr" }}>
            {I("name", "Name *")}{I("company_name", "Company")}
            {I("job_title", "Designation")}{I("event", "Where you met", "GSE Expo Lisbon 2026")}
            {I("email", "E-mail")}{I("phone", "WhatsApp / phone")}
          </div>

          <label className="block mt-2" style={{ fontSize: 11, color: MUTED }}>
            Context — what was actually said, in your words
            <textarea value={f.context} onChange={(e) => setF((x) => ({ ...x, context: e.target.value }))} rows={3}
              placeholder="Met at our stand in Hall 3. He runs ground handling at two airports and said the belt loaders they have now keep failing in the monsoon."
              style={{ ...box, resize: "vertical" }} />
            <span style={{ color: MUTED }}>This is the record. The follow-up can only say what you put here.</span>
          </label>

          <label className="block mt-2" style={{ fontSize: 11, color: MUTED }}>
            What do you want out of it
            <select value={f.reason} onChange={(e) => setF((x) => ({ ...x, reason: e.target.value }))} style={box}>
              {reasons.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
            </select>
            <span style={{ color: MUTED }}>Never written into the message. It decides the last line, and whether there is an ask at all.</span>
          </label>

          {err && <div className="text-xs mt-2 font-semibold" style={{ color: "#B3261E" }}>{err}</div>}
          <div className="flex gap-2 mt-3">
            <button onClick={save} disabled={busy || !f.name.trim()} className="text-xs font-bold rounded px-3 py-2 text-white" style={{ background: busy || !f.name.trim() ? "#B9BEC4" : GREEN }}>
              {busy ? "saving…" : "Save"}
            </button>
            <button onClick={onClose} className="text-xs font-bold rounded px-3 py-2" style={{ background: "#fff", border: `1px solid ${BORDER}`, color: MUTED }}>Cancel</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── ONE PERSON: the context, and the two messages ────────────────────── */
function MetBox({ met, reasons, queued, onClose, onChanged }: {
  met: Met; reasons: Reason[]; queued: { email?: string; whatsapp?: string }; onClose: () => void; onChanged: () => void;
}) {
  const [f, setF] = useState({ context: met.context || "", reason: met.reason, email: met.email || "", phone: met.phone || "", event: met.event || "" });
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [note, setNote] = useState("");
  const [copied, setCopied] = useState(false);

  const post = async (body: Record<string, unknown>) => {
    const r = await fetch("/api/crm/met", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json();
    if (!r.ok) throw new Error(String(j.error || r.status));
    return j;
  };

  const save = async () => {
    setBusy("save"); setErr("");
    try { await post({ action: "save", id: met.id, ...f }); setNote("saved ✓"); onChanged(); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    setBusy("");
  };

  const write = async (channel: "email" | "whatsapp") => {
    setBusy(channel); setErr(""); setNote(""); setCopied(false);
    try {
      await post({ action: "save", id: met.id, ...f });          // write from what is on screen now
      const j = await post({ action: "write", id: met.id, channel });
      setDraft({ channel, subject: String(j.subject || ""), body: String(j.body || "") });
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    setBusy("");
  };

  const keep = async () => {
    if (!draft) return;
    setBusy("queue"); setErr("");
    try {
      await post({ action: "queue", id: met.id, channel: draft.channel, subject: draft.subject, body: draft.body });
      setNote(draft.channel === "email" ? "In the e-mail queue. Nothing sends until you press send there." : "Kept. Copy it and send from your own WhatsApp.");
      onChanged();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    setBusy("");
  };

  const waLink = draft && draft.channel === "whatsapp" && f.phone
    ? `https://wa.me/${f.phone.replace(/[^\d]/g, "")}?text=${encodeURIComponent(draft.body)}`
    : null;

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 70, background: "rgba(22,35,47,.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} className="rounded bg-white" style={{ width: "min(680px,100%)", maxHeight: "calc(100vh - 32px)", overflowY: "auto" }}>
        <div className="flex items-center justify-between px-4 py-3" style={{ background: NAVY, borderRadius: "6px 6px 0 0" }}>
          <b className="text-white" style={{ fontSize: 15 }}>{met.name}{met.company_name ? ` · ${met.company_name}` : ""}</b>
          <button onClick={onClose} className="px-2 py-1 rounded text-sm font-semibold" style={{ background: "rgba(255,255,255,.12)", color: "#C8D2DC" }}>✕</button>
        </div>
        <div className="p-4">
          <label className="block" style={{ fontSize: 11, color: MUTED }}>Context — what was actually said
            <textarea value={f.context} onChange={(e) => setF((x) => ({ ...x, context: e.target.value }))} rows={3} style={{ ...box, resize: "vertical" }} /></label>

          <div style={{ display: "grid", gap: 6, gridTemplateColumns: "1fr 1fr", marginTop: 6 }}>
            <label style={{ fontSize: 11, color: MUTED }}>E-mail<input value={f.email} onChange={(e) => setF((x) => ({ ...x, email: e.target.value }))} style={box} /></label>
            <label style={{ fontSize: 11, color: MUTED }}>WhatsApp / phone<input value={f.phone} onChange={(e) => setF((x) => ({ ...x, phone: e.target.value }))} style={box} /></label>
            <label style={{ fontSize: 11, color: MUTED }}>Where you met<input value={f.event} onChange={(e) => setF((x) => ({ ...x, event: e.target.value }))} style={box} /></label>
            <label style={{ fontSize: 11, color: MUTED }}>What you want out of it
              <select value={f.reason} onChange={(e) => setF((x) => ({ ...x, reason: e.target.value }))} style={box}>
                {reasons.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
              </select></label>
          </div>

          <div className="flex gap-2 mt-3 flex-wrap items-center">
            <button onClick={save} disabled={!!busy} className="text-xs font-bold rounded px-3 py-2" style={{ background: "#fff", border: `1px solid ${BORDER}`, color: NAVY }}>Save</button>
            <button onClick={() => write("email")} disabled={!!busy} className="text-xs font-bold rounded px-3 py-2 text-white" style={{ background: busy === "email" ? "#B9BEC4" : ORANGE }}>
              {busy === "email" ? "writing…" : "✉ Write the e-mail"}
            </button>
            <button onClick={() => write("whatsapp")} disabled={!!busy} className="text-xs font-bold rounded px-3 py-2 text-white" style={{ background: busy === "whatsapp" ? "#B9BEC4" : "#128C7E" }}>
              {busy === "whatsapp" ? "writing…" : "💬 Write the WhatsApp"}
            </button>
            {queued.email && <span style={{ fontSize: 11, color: GREEN, fontWeight: 700 }}>✉ one already waiting</span>}
            {queued.whatsapp && <span style={{ fontSize: 11, color: GREEN, fontWeight: 700 }}>💬 one already kept</span>}
          </div>
          {!f.context.trim() && <div className="text-xs mt-1" style={{ color: "#8A5B00" }}>With no context it can only say that you met. Write a line first and it will say something true.</div>}

          {err && <div className="text-xs mt-2 font-semibold" style={{ color: "#B3261E" }}>{err}</div>}
          {note && <div className="text-xs mt-2 font-semibold" style={{ color: GREEN }}>{note}</div>}

          {draft && (
            <div className="rounded border p-3 mt-3" style={{ borderColor: BORDER, background: "#FAFBFD" }}>
              <div className="text-xs font-bold mb-1" style={{ color: MUTED, letterSpacing: .6 }}>
                {draft.channel === "email" ? "THE E-MAIL" : "THE WHATSAPP"} · edit anything before you keep it
              </div>
              {draft.channel === "email" && (
                <label className="block mb-1" style={{ fontSize: 11, color: MUTED }}>Subject
                  <input value={draft.subject} onChange={(e) => setDraft({ ...draft, subject: e.target.value })} style={box} /></label>
              )}
              <textarea value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} rows={draft.channel === "email" ? 9 : 5}
                style={{ ...box, resize: "vertical", fontFamily: "inherit", lineHeight: 1.6 }} />
              <div className="flex gap-2 mt-2 flex-wrap items-center">
                <button onClick={keep} disabled={!!busy} className="text-xs font-bold rounded px-3 py-2 text-white" style={{ background: GREEN }}>
                  {draft.channel === "email" ? "Keep it in the e-mail queue" : "Keep it"}
                </button>
                <button onClick={() => { navigator.clipboard?.writeText(draft.body); setCopied(true); }} className="text-xs font-bold rounded px-3 py-2" style={{ background: "#fff", border: `1px solid ${BORDER}`, color: NAVY }}>
                  {copied ? "copied ✓" : "Copy the text"}
                </button>
                {waLink && <a href={waLink} target="_blank" rel="noreferrer" className="text-xs font-bold rounded px-3 py-2 text-white" style={{ background: "#128C7E" }}>Open in WhatsApp</a>}
                <button onClick={() => write(draft.channel)} disabled={!!busy} className="text-xs rounded px-3 py-2" style={{ background: "#fff", border: `1px solid ${BORDER}`, color: MUTED }}>Write it again</button>
              </div>
              <div className="text-xs mt-2" style={{ color: MUTED, lineHeight: 1.5 }}>
                Read it before it goes. <b>Nothing here sends itself</b> — the e-mail waits in the queue for your hand, and the WhatsApp opens on your own phone so it arrives from you.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
