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
  tags: string[] | null; selfie_path: string | null; selfie?: string | null; interaction_id: string | null;
  added_by: string;
};
type Reason = { key: string; label: string; ask: string };
type Draft = { channel: "email" | "whatsapp"; subject: string; body: string };
type Chan = { id: string; email: string; label: string; kind: string; own: boolean };

const box: React.CSSProperties = { border: `1px solid ${BORDER}`, borderRadius: 6, padding: "4px 7px", fontSize: 13, color: INK, width: "100%" };


/**
 * THE LAST TAG CARRIES (Dr Raghu, 16 Sep 2026: "last filled tag continues").
 *
 * A show is forty people over two days and the label is the same for all
 * forty. Anything that has to be retyped forty times gets typed wrongly by
 * the tenth, or — worse — spelled three different ways, which is how a month
 * stops being countable by show.
 *
 * It lives in this browser, not the database: it is a convenience for the
 * person holding the phone, and the next trip will want different words.
 */
const TAG_KEY = "genie.met.tags.v1";
const lastTags = (): string[] => {
  try { const v = JSON.parse(window.localStorage.getItem(TAG_KEY) || "[]"); return Array.isArray(v) ? v.map(String).slice(0, 12) : []; }
  catch { return []; }
};
const keepTags = (t: string[]) => { try { window.localStorage.setItem(TAG_KEY, JSON.stringify(t)); } catch { /* storage refused */ } };

/** One tag chip row with an input, used on both boxes. */
function TagRow({ tags, known, onChange }: { tags: string[]; known: string[]; onChange: (t: string[]) => void }) {
  const [draft, setDraft] = useState("");
  const add = (raw: string) => {
    const t = raw.trim().replace(/,+$/, "");
    if (!t) return;
    if (!tags.some((x) => x.toLowerCase() === t.toLowerCase())) onChange([...tags, t].slice(0, 12));
    setDraft("");
  };
  const spare = known.filter((k) => !tags.some((x) => x.toLowerCase() === k.toLowerCase())).slice(0, 6);
  return (
    <div>
      <div className="flex flex-wrap items-center gap-1">
        {tags.map((t) => (
          <span key={t} className="rounded px-1.5 py-0.5 flex items-center gap-1" style={{ background: NAVY_SOFT, color: NAVY, fontSize: 12, fontWeight: 600 }}>
            {t}
            <button onClick={() => onChange(tags.filter((x) => x !== t))} title="Remove" style={{ color: MUTED, fontWeight: 700, lineHeight: 1 }}>×</button>
          </span>
        ))}
        <input value={draft}
          onChange={(e) => { const v = e.target.value; if (v.includes(",")) v.split(",").forEach(add); else setDraft(v); }}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === "Tab") { if (draft.trim()) { e.preventDefault(); add(draft); } } }}
          onBlur={() => add(draft)}
          placeholder={tags.length ? "another…" : "GSE Expo 2026, Met"}
          style={{ ...box, width: 150, flex: "0 1 170px", fontSize: 12.5 }} />
      </div>
      {spare.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1">
          {spare.map((k) => (
            <button key={k} onClick={() => add(k)} className="rounded px-1.5" style={{ fontSize: 11, color: MUTED, border: `1px dashed ${BORDER}` }}>+ {k}</button>
          ))}
        </div>
      )}
    </div>
  );
}


/**
 * WHAT WE DO, IN A LINE — the only thing a follow-up is allowed to claim.
 *
 * Dr Raghu, 16 Sep 2026: "keep it as a field. n genie can improve it all the
 * time."
 *
 * With nothing here every message is claim-free, which is shorter and never
 * wrong. With a line here, at most ONE fact from it may be used, and only
 * when it answers something the other person actually said.
 *
 * GENIE PROPOSES, HE DECIDES. The suggestion appears beside the current
 * words and changes nothing until he saves it. A sentence that rewrote
 * itself would mean the claim in tomorrow's e-mail is not the one he last
 * read, and this is the field whose entire job is to be true.
 */
function SenderLine() {
  const [open, setOpen] = useState(false);
  const [does, setDoes] = useState("");
  const [device, setDevice] = useState("");
  const [idea, setIdea] = useState<{ does: string; why: string; grounded: number } | null>(null);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [note, setNote] = useState("");

  const post = async (body: Record<string, unknown>) => {
    const r = await fetch("/api/crm/met", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json();
    if (!r.ok) throw new Error(String(j.error || r.status));
    return j;
  };
  const load = useCallback(async () => {
    try { const j = await post({ action: "sender" }); setDoes(j.does || ""); setDevice(j.device || ""); } catch { /* it simply stays empty */ }
  }, []);
  useEffect(() => { load(); }, [load]);

  const save = async () => {
    setBusy("save"); setErr("");
    try { await post({ action: "sender_save", does, device }); setNote("saved ✓"); setIdea(null); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    setBusy("");
  };
  const improve = async () => {
    setBusy("improve"); setErr(""); setNote("");
    try { const j = await post({ action: "sender_improve", does }); setIdea({ does: j.does || "", why: j.why || "", grounded: j.grounded || 0 }); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    setBusy("");
  };

  return (
    <div className="rounded border mb-3" style={{ borderColor: does ? BORDER : "#E0C88A", background: does ? "#FBFAF7" : "#FDF8EC" }}>
      <button onClick={() => setOpen((o) => !o)} className="w-full text-left px-3 py-2">
        <span style={{ fontSize: 12, fontWeight: 700, color: does ? MUTED : "#7A5B00", letterSpacing: .6 }}>
          WHAT WE DO, IN A LINE {open ? "▾" : "▸"}
        </span>
        <div style={{ fontSize: 12.5, color: does ? INK : "#7A5B00", marginTop: 2, lineHeight: 1.5 }}>
          {does || "Not set. Until it is, no follow-up makes any claim about Nandan — shorter, and never wrong."}
        </div>
      </button>

      {open && (
        <div className="px-3 pb-3">
          <textarea value={does} onChange={(e) => setDoes(e.target.value)} rows={2}
            placeholder="We build ground support equipment for airports in India. Belt loaders, tow tractors, ground power units."
            style={{ ...box, resize: "vertical" }} />
          <div className="text-xs mt-1" style={{ color: MUTED, lineHeight: 1.5 }}>
            At most <b>one fact from this</b> reaches any message, and only where it answers something the other person actually said. Plain and concrete beats impressive.
          </div>

          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <label style={{ fontSize: 11, color: MUTED }}>Sent from
              <select value={device} onChange={(e) => setDevice(e.target.value)} style={{ ...box, width: 180 }}>
                <option value="">nothing under the name</option>
                <option value="Sent from my iPhone">Sent from my iPhone</option>
                <option value="Sent from my phone">Sent from my phone</option>
              </select>
            </label>
            <span style={{ fontSize: 11, color: MUTED, maxWidth: 300, lineHeight: 1.45 }}>
              It goes under your first name. Only pick one that is true — the whole power of these e-mails is that everything in them is checkable.
            </span>
          </div>

          <div className="flex gap-2 mt-2 flex-wrap items-center">
            <button onClick={save} disabled={!!busy} className="text-xs font-bold rounded px-3 py-2 text-white" style={{ background: busy === "save" ? "#B9BEC4" : GREEN }}>
              {busy === "save" ? "saving…" : "Save"}
            </button>
            <button onClick={improve} disabled={!!busy} className="text-xs font-bold rounded px-3 py-2" style={{ background: "#fff", border: `1px solid ${BORDER}`, color: NAVY }}>
              {busy === "improve" ? "thinking…" : "✨ Ask Genie to sharpen it"}
            </button>
            {note && <span style={{ fontSize: 11, color: GREEN, fontWeight: 700 }}>{note}</span>}
          </div>
          {err && <div className="text-xs mt-2 font-semibold" style={{ color: "#B3261E" }}>{err}</div>}

          {idea && (
            <div className="rounded border p-2 mt-2" style={{ borderColor: BORDER, background: "#fff" }}>
              <div style={{ fontSize: 11, color: MUTED, fontWeight: 700, letterSpacing: .5 }}>GENIE SUGGESTS</div>
              <div style={{ fontSize: 13, color: INK, margin: "3px 0", lineHeight: 1.55 }}>{idea.does || "(it could not find anything to say — tell it what you make)"}</div>
              {idea.why && <div style={{ fontSize: 11, color: MUTED }}>{idea.why}</div>}
              <div style={{ fontSize: 11, color: MUTED, marginTop: 2 }}>
                {idea.grounded ? `Grounded in ${idea.grounded} of your actual conversations. It may only reword what you gave it — it invents nothing.` : "Nothing to ground it in yet, so it only tidied your own words."}
              </div>
              <div className="flex gap-2 mt-2">
                <button onClick={() => { setDoes(idea.does); setIdea(null); }} disabled={!idea.does} className="text-xs font-bold rounded px-3 py-1.5" style={{ background: ORANGE, color: "#fff" }}>Use it</button>
                <button onClick={() => setIdea(null)} className="text-xs rounded px-3 py-1.5" style={{ background: "#fff", border: `1px solid ${BORDER}`, color: MUTED }}>Keep mine</button>
              </div>
              <div style={{ fontSize: 11, color: MUTED, marginTop: 4 }}>Nothing changes until you press Save.</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* One column on a phone, two on anything wider. A stand is where this gets
   used, and a two-column form on a 375px screen is unusable there. */
const MOBILE_CSS = `.met-2col{grid-template-columns:1fr}@media(min-width:560px){.met-2col{grid-template-columns:1fr 1fr}}`;

export default function PeopleIMet({ onOpen }: { onOpen: (target: string, id: string) => void }) {
  const [rows, setRows] = useState<Met[] | null>(null);
  const [queued, setQueued] = useState<Record<string, { email?: string; whatsapp?: string }>>({});
  const [reasons, setReasons] = useState<Reason[]>([]);
  const [known, setKnown] = useState<string[]>([]);
  const [channels, setChannels] = useState<Chan[]>([]);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false);
  const [open, setOpen] = useState<Met | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/crm/met", { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(String(j.error || r.status));
      setRows(j.people || []); setQueued(j.queued || {}); setReasons(j.reasons || []); setKnown(j.knownTags || []); setChannels(j.channels || []); setErr("");
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); setRows([]); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const shown = useMemo(() => {
    const k = q.trim().toLowerCase();
    if (!k || !rows) return rows || [];
    return rows.filter((m) => [m.name, m.company_name, m.event, m.context, m.job_title, ...(m.tags || [])]
      .some((v) => String(v || "").toLowerCase().includes(k)));
  }, [rows, q]);

  const byEvent = useMemo(() => {
    const g = new Map<string, Met[]>();
    for (const m of shown) { const k = m.event?.trim() || "—"; g.set(k, [...(g.get(k) || []), m]); }
    return [...g.entries()];
  }, [shown]);

  return (
    <div className="p-4">
      <style>{MOBILE_CSS}</style>
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

      <SenderLine />

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
          <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 280px), 1fr))" }}>
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
                {m.selfie && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={m.selfie} alt="" style={{ width: "100%", height: 96, objectFit: "cover", borderRadius: 4, margin: "5px 0" }} />
                )}
                <div style={{ fontSize: 12, color: m.context ? INK : "#B23B12", margin: "5px 0", lineHeight: 1.5 }}>
                  {m.context || "No context yet — without it the follow-up has nothing true to say."}
                </div>
                {!!(m.tags || []).length && (
                  <div className="flex flex-wrap gap-1 mb-1">
                    {(m.tags || []).map((t) => <span key={t} className="rounded px-1.5" style={{ background: NAVY_SOFT, color: NAVY, fontSize: 10.5, fontWeight: 700 }}>{t}</span>)}
                  </div>
                )}
                <div className="flex items-center gap-1 flex-wrap" style={{ fontSize: 11, color: MUTED }}>
                  <span>{m.met_on}</span>
                  {m.interaction_id && <span title="Counted as a meeting in Interactions" style={{ color: MUTED }}>▣ counted</span>}
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

      {adding && <AddBox reasons={reasons} known={known} onClose={() => setAdding(false)} onDone={() => { setAdding(false); load(); }} />}
      {open && <MetBox met={open} reasons={reasons} known={known} channels={channels} queued={queued[open.id] || {}} onClose={() => setOpen(null)} onChanged={load} />}
    </div>
  );
}

/* ── ADDING: three doors, one row ─────────────────────────────────────── */
function AddBox({ reasons, known, onClose, onDone }: { reasons: Reason[]; known: string[]; onClose: () => void; onDone: () => void }) {
  const [door, setDoor] = useState<"typed" | "database" | "card">("typed");
  /* Whatever was tagged last is already here — a show is one label, forty times. */
  const [tags, setTags] = useState<string[]>([]);
  useEffect(() => { setTags(lastTags()); }, []);
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
      const r = await fetch("/api/crm/met", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "add", source: door, ...f, tags }) });
      const j = await r.json();
      if (!r.ok) throw new Error(String(j.error || r.status));
      keepTags(tags);
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

          <div className="met-2col" style={{ display: "grid", gap: 6 }}>
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

          <div className="mt-2" style={{ fontSize: 11, color: MUTED }}>
            Tag
            <TagRow tags={tags} known={known} onChange={setTags} />
            <span style={{ color: MUTED }}>Carried to the next person you add, and counted with the meeting.</span>
          </div>

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
function MetBox({ met, reasons, known, channels, queued, onClose, onChanged }: {
  met: Met; reasons: Reason[]; known: string[]; channels: Chan[]; queued: { email?: string; whatsapp?: string }; onClose: () => void; onChanged: () => void;
}) {
  const [f, setF] = useState({ context: met.context || "", reason: met.reason, email: met.email || "", phone: met.phone || "", event: met.event || "" });
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [note, setNote] = useState("");
  const [copied, setCopied] = useState(false);
  const [tags, setTags] = useState<string[]>(met.tags || []);
  const [selfie, setSelfie] = useState<string | null>(met.selfie || null);
  const [shot, setShot] = useState(false);
  /* Blank is the sender's own Gmail, which is the right default for a note
     to somebody met an hour ago. */
  const [chan, setChan] = useState("");

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
      await post({ action: "save", id: met.id, ...f, tags });    // write from what is on screen now
      const j = await post({ action: "write", id: met.id, channel });
      setDraft({ channel, subject: String(j.subject || ""), body: String(j.body || "") });
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    setBusy("");
  };

  const keep = async () => {
    if (!draft) return;
    setBusy("queue"); setErr("");
    try {
      await post({ action: "queue", id: met.id, channel: draft.channel, subject: draft.subject, body: draft.body, channel_id: chan });
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

          <div className="met-2col" style={{ display: "grid", gap: 6, marginTop: 6 }}>
            <label style={{ fontSize: 11, color: MUTED }}>E-mail<input value={f.email} onChange={(e) => setF((x) => ({ ...x, email: e.target.value }))} style={box} /></label>
            <label style={{ fontSize: 11, color: MUTED }}>WhatsApp / phone<input value={f.phone} onChange={(e) => setF((x) => ({ ...x, phone: e.target.value }))} style={box} /></label>
            <label style={{ fontSize: 11, color: MUTED }}>Where you met<input value={f.event} onChange={(e) => setF((x) => ({ ...x, event: e.target.value }))} style={box} /></label>
            <label style={{ fontSize: 11, color: MUTED }}>What you want out of it
              <select value={f.reason} onChange={(e) => setF((x) => ({ ...x, reason: e.target.value }))} style={box}>
                {reasons.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
              </select></label>
          </div>

          <div className="mt-2" style={{ fontSize: 11, color: MUTED }}>
            Tag
            <TagRow tags={tags} known={known} onChange={setTags} />
          </div>

          {/* THE SELFIE. A photograph of the two of them does more than any
              sentence can — it is the proof the conversation happened, and on
              WhatsApp it arrives as a picture of a person they met an hour
              ago rather than as a message from a company. */}
          <div className="mt-2 flex items-start gap-3">
            {selfie
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={selfie} alt="" style={{ width: 110, height: 110, objectFit: "cover", borderRadius: 6, border: `1px solid ${BORDER}` }} />
              : <div style={{ width: 110, height: 110, borderRadius: 6, border: `1px dashed ${BORDER}`, display: "flex", alignItems: "center", justifyContent: "center", color: MUTED, fontSize: 11, textAlign: "center", padding: 6 }}>no photo yet</div>}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11, color: MUTED, lineHeight: 1.5 }}>
                A selfie with them. It goes out with the WhatsApp — from your phone, so it arrives as a picture of you two rather than a company message.
              </div>
              <label className="inline-block mt-1 text-xs font-bold rounded px-3 py-1.5" style={{ background: "#fff", border: `1px solid ${BORDER}`, color: NAVY, cursor: "pointer" }}>
                {shot ? "uploading…" : selfie ? "Replace the photo" : "📷 Add a selfie"}
                <input type="file" accept="image/*" capture="user" hidden onChange={async (e) => {
                  const file = e.target.files?.[0]; if (!file) return;
                  setShot(true); setErr("");
                  try {
                    const fd = new FormData(); fd.append("id", met.id); fd.append("file", file);
                    const r = await fetch("/api/crm/met", { method: "POST", body: fd });
                    const j = await r.json();
                    if (!r.ok) throw new Error(String(j.error || r.status));
                    setSelfie(j.selfie || null); onChanged();
                  } catch (e2) { setErr(e2 instanceof Error ? e2.message : String(e2)); }
                  setShot(false);
                }} />
              </label>
            </div>
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
                <>
                  <label className="block mb-1" style={{ fontSize: 11, color: MUTED }}>Subject
                    <input value={draft.subject} onChange={(e) => setDraft({ ...draft, subject: e.target.value })} style={box} /></label>
                  {/* WHICH ADDRESS IT LEAVES FROM. Your own Gmail is the
                      default and usually the right one — it arrives from a
                      person and lands in a thread they can answer. */}
                  <label className="block mb-1" style={{ fontSize: 11, color: MUTED }}>Send it from
                    <select value={chan} onChange={(e) => setChan(e.target.value)} style={box}>
                      {channels.map((c) => (
                        <option key={c.id || "own"} value={c.id}>
                          {c.own ? `${c.email} — your own Gmail` : `${c.email} — ${c.label} (${c.kind})`}
                        </option>
                      ))}
                    </select>
                    <span style={{ color: MUTED }}>
                      {chan ? "A branded address. Replies go where that channel says." : "It arrives from you, in a thread they can reply to."}
                    </span>
                  </label>
                </>
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
                {draft.channel === "whatsapp" && selfie && (
                  <a href={selfie} download={`selfie-${met.name.replace(/\W+/g, "-").toLowerCase()}.jpg`} target="_blank" rel="noreferrer"
                    className="text-xs font-bold rounded px-3 py-2" style={{ background: "#fff", border: `1px solid ${BORDER}`, color: NAVY }}>
                    ⬇ The selfie
                  </a>
                )}
                <button onClick={() => write(draft.channel)} disabled={!!busy} className="text-xs rounded px-3 py-2" style={{ background: "#fff", border: `1px solid ${BORDER}`, color: MUTED }}>Write it again</button>
              </div>
              <div className="text-xs mt-2" style={{ color: MUTED, lineHeight: 1.5 }}>
                Read it before it goes. <b>Nothing here sends itself</b> — the e-mail waits in the queue for your hand, and the WhatsApp opens on your own phone so it arrives from you.
                {draft.channel === "whatsapp" && selfie && <> Save the selfie and attach it in WhatsApp: a link to a photograph is not the same thing as the photograph.</>}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
