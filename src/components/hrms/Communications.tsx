"use client";
/**
 * Communications — everything HRMS has sent and everything that came back
 * (Dr Raghu, 4 Sep 2026: "kept in the communications tab which will be in
 * the side as well as with each employee and also with the payroll runs").
 *
 * Two tabs, both reading the same ledger:
 *
 *   ALL — one line per message across every person and every run, e-mail and
 *   WhatsApp, out and in. "In communication of course keep all in line."
 *
 *   MASS COMMUNICATION — the same messages seen as the campaigns that sent
 *   them: what is still a draft, what went, and what came back (Dr Raghu,
 *   7 Sep 2026). A campaign is only a cover sheet; every mail it sends is a
 *   line on the person's own record under Communication, which is why
 *   nothing here has to be copied anywhere to reach the HRIS record.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { fmtFull } from "@/lib/schedule";
import RichTextEditor from "@/components/RichTextEditor";
import { Pane } from "./Pane";
import { C } from "./RecordFields";

interface Row { id: string; employee_id: string; name: string; channel: string; direction: string; to_address: string | null; subject: string | null; body: string; status: string; error: string | null; sent_by: string | null; sent_at: string; run_id: string | null; run_label: string | null }

/**
 * THE CLOCK, NOT ONLY THE CALENDAR (Dr Raghu, 7 Sep 2026: "in this also show
 * the time!"). Two hundred mails go out inside a minute and a reply comes
 * back an hour later; a date alone cannot tell you which came first, which
 * is the whole question a ledger is read to answer.
 */
const stamp = (iso: string | null | undefined) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: true,
  }).replace(",", " ·");
};

const tone = (s: string) => (s === "delivered" || s === "received" ? C.green : s === "failed" ? C.red : s === "sent" ? "var(--blue)" : C.dim);

export default function Communications({ who }: { who: string }) {
  const [tab, setTab] = useState<"all" | "mass">("all");
  const [mass, setMass] = useState<Camp | "new" | null>(null);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [msg, setMsg] = useState("");
  const [q, setQ] = useState("");
  const [channel, setChannel] = useState("");
  const [dir, setDir] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [status, setStatus] = useState("");

  const load = useCallback(async () => {
    try { const j = await api.get("/api/hrms/communication?all=1"); setRows(j.rows || []); }
    catch (e) { setMsg(e instanceof Error ? e.message : String(e)); setRows([]); }
  }, []);
  useEffect(() => { load(); }, [load]);

  /**
   * THE REPLY BELONGS WITH THE MAIL IT ANSWERS (Dr Raghu, 7 Sep 2026: "those
   * that replied should show in front of the mail").
   *
   * A reply was just another line in a list of six hundred, so the fact that
   * somebody had answered was invisible unless you happened to scroll past
   * it. Each reply is now hung on the outgoing message it answers — the last
   * one sent to that person on that channel before it came in — and the mail
   * itself carries a green "replied" badge, which is the thing worth seeing
   * at a glance.
   */
  const { replyOf, replied } = useMemo(() => {
    const all = [...(rows || [])].sort((a, b) => String(a.sent_at).localeCompare(String(b.sent_at)));
    const lastOut = new Map<string, string>();          // person+channel → the id of the last mail out
    const map = new Map<string, Row[]>();               // outgoing id → its replies
    for (const r of all) {
      const k = `${r.employee_id}|${r.channel}`;
      if (r.direction === "in") {
        const parent = lastOut.get(k);
        if (parent) map.set(parent, [...(map.get(parent) || []), r]);
      } else lastOut.set(k, r.id);
    }
    const attached = new Set<string>();
    for (const list of map.values()) for (const r of list) attached.add(r.id);
    return { replyOf: map, replied: attached };
  }, [rows]);

  const shown = (rows || []).filter((r) =>
    (!channel || r.channel === channel)
    && (!dir || r.direction === dir)
    && (!status || (r.direction === "in" ? status === "replies" : r.status === status))
    // a reply shown under its own mail is not repeated at the top level,
    // unless replies are what is being asked for
    && !(dir !== "in" && status !== "replies" && replied.has(r.id))
    && (!q || `${r.name} ${r.employee_id} ${r.subject || ""} ${r.body}`.toLowerCase().includes(q.toLowerCase())));
  const counts: Record<string, number> = {};
  for (const r of rows || []) { const k = r.direction === "in" ? "replies" : r.status; counts[k] = (counts[k] || 0) + 1; }

  const TAB = (k: "all" | "mass", label: string) => (
    <button key={k} onClick={() => setTab(k)} className="rounded-t px-3 py-1.5 text-xs font-bold"
      style={{ background: tab === k ? "#fff" : "transparent", color: tab === k ? C.ink : C.dim, border: `1px solid ${tab === k ? C.line : "transparent"}`, borderBottom: tab === k ? "1px solid #fff" : undefined, marginBottom: -1 }}>
      {label}
    </button>
  );

  return (
    <Pane title="Communications" who={who} blurb="Everything HRMS has sent, and everything that came back — by person, by run, by channel. The same lines sit on each record's Communication tab and on each payroll run.">
      {msg && <div className="text-xs font-semibold mb-2" style={{ color: C.red }}>{msg}</div>}
      <div className="flex gap-1 items-end" style={{ borderBottom: `1px solid ${C.line}` }}>
        {TAB("all", "All communication")}
        {TAB("mass", "Mass Communication")}
      </div>

      {tab === "all" && (
        <>
          <div className="flex gap-1.5 my-2 flex-wrap items-center text-xs">
            {/* THE COUNTS ARE THE FILTER (Dr Raghu, 7 Sep 2026: "show the
                ones that failed"). They read as buttons because they now are
                — click "failed 12" to see those twelve, click it again to
                come back. A count you cannot open is only a rumour. */}
            {Object.entries(counts).map(([k, v]) => (
              <button key={k} onClick={() => setStatus(status === k ? "" : k)} title={`Show only: ${k}`}
                className="rounded px-2 py-0.5 font-bold" style={{
                  background: status === k ? tone(k === "replies" ? "received" : k) : "#F4F2EC",
                  color: status === k ? "#fff" : tone(k === "replies" ? "received" : k),
                  border: `1px solid ${status === k ? "transparent" : C.line}`, cursor: "pointer" }}>
                {k} {v}
              </button>
            ))}
            {status && <button onClick={() => setStatus("")} className="rounded px-2 py-0.5" style={{ color: C.faint, cursor: "pointer" }}>clear</button>}
            <span style={{ flex: 1 }} />
            <select value={channel} onChange={(e) => setChannel(e.target.value)} className="rounded px-2 py-1 bg-white" style={{ border: `1px solid ${C.line}` }}><option value="">all channels</option><option value="whatsapp">WhatsApp</option><option value="email">E-mail</option><option value="note">Logged</option></select>
            <select value={dir} onChange={(e) => setDir(e.target.value)} className="rounded px-2 py-1 bg-white" style={{ border: `1px solid ${C.line}` }}><option value="">out and in</option><option value="out">sent</option><option value="in">replies</option></select>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="name, id, words…" className="rounded px-2 py-1" style={{ border: `1px solid ${C.line}`, width: 200 }} />
            <button onClick={load} className="rounded border px-2 py-1 bg-white" style={{ borderColor: C.line, color: C.dim }}>↻</button>
            <button onClick={() => setMass("new")} className="rounded px-2.5 py-1 font-bold text-white" style={{ background: "var(--accent)" }}
              title="One mail to many — the template, the address it goes from, the variables and an attachment">✉ Send mass email</button>
          </div>
          <div className="bg-white rounded-lg border" style={{ borderColor: C.line }}>
            {rows === null && <div className="p-3 text-xs" style={{ color: C.faint }}>loading…</div>}
            {rows && !shown.length && <div className="p-3 text-xs" style={{ color: C.faint }}>Nothing here.</div>}
            {shown.map((r, i) => (
              <div key={r.id} className="px-3 py-2" style={{ borderTop: i ? "1px solid #EEECE6" : undefined }}>
                <button onClick={() => setOpen(open === r.id ? null : r.id)} className="w-full text-left text-xs flex gap-2 items-baseline flex-wrap">
                  <span className="rounded px-1.5 py-0.5 font-bold" style={{ background: r.direction === "in" ? "#E6F4EA" : "#F4F2EC", color: tone(r.status), fontSize: 10 }}>{r.direction === "in" ? "↩ reply" : r.status}</span>
                  <span className="font-semibold">{r.name}</span>
                  <span style={{ color: C.faint }}>{r.channel === "whatsapp" ? "💬" : r.channel === "email" ? "✉" : "📝"} {r.to_address || ""}{r.subject && r.channel === "email" ? ` · ${r.subject}` : ""}</span>
                  {r.run_label && <span className="rounded px-1.5 py-0.5" style={{ background: "#DCE8F5", color: "var(--blue)", fontSize: 10 }}>run {r.run_label}</span>}
                  <span style={{ flex: 1 }} />
                  <span style={{ color: C.faint }}>{stamp(r.sent_at)} · {String(r.sent_by || "").split("·")[0].trim()}</span>
                  {r.error && <span style={{ color: C.red }} title={r.error}>!</span>}
                </button>
                {/* WHO ANSWERED, IN FRONT — the badge is the point of this;
                    the words are one click away. */}
                {(replyOf.get(r.id) || []).length > 0 && (
                  <button onClick={() => setOpen(open === r.id ? null : r.id)}
                    className="rounded px-1.5 py-0.5 font-bold mt-1" style={{ background: "#E6F4EA", color: C.green, fontSize: 10, cursor: "pointer" }}>
                    ↩ {(replyOf.get(r.id) || []).length} {(replyOf.get(r.id) || []).length === 1 ? "reply" : "replies"}
                  </button>
                )}
                {open === r.id && <div className="mt-1" style={{ fontSize: 12.5, lineHeight: 1.5, color: r.direction === "in" ? C.green : C.ink }} dangerouslySetInnerHTML={{ __html: /<[a-z][\s\S]*>/i.test(r.body) ? r.body : String(r.body).replace(/\n/g, "<br>") }} />}
                {open === r.id && (replyOf.get(r.id) || []).map((x: Row) => (
                  <div key={x.id} className="mt-1.5 rounded px-2 py-1.5" style={{ background: "#F3FAF5", borderLeft: `3px solid ${C.green}` }}>
                    <div style={{ fontSize: 10.5, color: C.green, fontWeight: 700 }}>↩ {x.name} · {stamp(x.sent_at)}</div>
                    <div style={{ fontSize: 12.5, lineHeight: 1.5 }} dangerouslySetInnerHTML={{ __html: /<[a-z][\s\S]*>/i.test(x.body) ? x.body : String(x.body).replace(/\n/g, "<br>") }} />
                  </div>
                ))}
              </div>
            ))}
          </div>
          <div className="text-xs mt-2" style={{ color: C.faint }}>WhatsApp replies are pulled on each run&apos;s Communications tab; mail replies on the campaign itself.</div>
        </>
      )}

      {tab === "mass" && <MassList key={reload} onNew={() => setMass("new")} onEdit={(c) => setMass(c)} />}

      {mass && (
        <MassEmail draft={mass === "new" ? null : mass}
          onClose={() => { setMass(null); setReload((n) => n + 1); load(); }} />
      )}
    </Pane>
  );
}

/* ───────────────────────── the campaigns, drafted and sent ─────────────── */
type Camp = {
  id: string; title: string | null; status: string; from_email: string | null; from_as: string | null;
  reply_to: string | null; to_pref: string | null; subject: string | null; body: string | null;
  template_key: string | null; audience: { types?: string[]; departments?: string[]; groups?: string[]; ids?: string[] } | null;
  attachments: { name: string; size: number }[] | null; counts: { sent?: number; failed?: number; of?: number } | null;
  created_by: string | null; created_at: string; updated_at: string; sent_at: string | null;
  lines?: { sent: number; failed: number; replies: number };
};
type Line = { id: string; employee_id: string; name: string; channel: string; direction: string; to_address: string | null; subject: string | null; body: string; status: string; error?: string | null; sent_at: string };

function MassList({ onNew, onEdit }: { onNew: () => void; onEdit: (c: Camp) => void }) {
  const [rows, setRows] = useState<Camp[] | null>(null);
  const [msg, setMsg] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      const j = await api.get("/api/hrms/mass-mail?list=1");
      setRows(j.rows || []);
      if (j.needsMigration) setMsg("Migration 0151 has not been run yet — campaigns have nowhere to sit.");
    } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); setRows([]); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const drafts = (rows || []).filter((r) => r.status === "draft");
  const sent = (rows || []).filter((r) => r.status !== "draft");

  const card = (c: Camp) => (
    <div key={c.id} className="px-3 py-2" style={{ borderTop: "1px solid #EEECE6" }}>
      <div className="flex gap-2 items-baseline flex-wrap text-xs">
        <button onClick={() => setOpen(open === c.id ? null : c.id)} className="font-bold text-left" style={{ fontSize: 13 }}>{c.title || c.subject || "Untitled"}</button>
        <span className="rounded px-1.5 py-0.5 font-bold" style={{ background: c.status === "draft" ? "#F4F2EC" : "#E6F4EA", color: c.status === "draft" ? C.dim : C.green, fontSize: 10 }}>{c.status}</span>
        {c.from_email && <span style={{ color: C.faint }}>from {c.from_as || c.from_email}{c.from_as && c.from_as !== c.from_email ? ` (through ${c.from_email})` : ""}</span>}
        <span style={{ flex: 1 }} />
        {c.lines && <span style={{ color: C.faint }}>{c.lines.sent} sent{c.lines.failed ? ` · ${c.lines.failed} failed` : ""}{c.lines.replies ? ` · ${c.lines.replies} replies` : ""}</span>}
        <span style={{ color: C.faint }}>{fmtFull(String(c.sent_at || c.updated_at))}</span>
        <button onClick={() => onEdit(c)} className="rounded border px-2 py-0.5 bg-white font-bold" style={{ borderColor: C.line, color: C.dim }}>{c.status === "draft" ? "Open draft" : "Send again"}</button>
      </div>
      {open === c.id && <CampOpen id={c.id} onChanged={load} />}
    </div>
  );

  return (
    <div className="mt-2">
      {msg && <div className="text-xs font-semibold mb-2" style={{ color: C.red }}>{msg}</div>}
      <div className="flex gap-2 items-center mb-2">
        <div className="text-xs" style={{ color: C.faint }}>{drafts.length} drafted · {sent.length} sent</div>
        <span style={{ flex: 1 }} />
        <button onClick={load} className="rounded border px-2 py-1 text-xs bg-white" style={{ borderColor: C.line, color: C.dim }}>↻</button>
        <button onClick={onNew} className="rounded px-2.5 py-1 text-xs font-bold text-white" style={{ background: "var(--accent)" }}>✉ New mass email</button>
      </div>
      <div className="bg-white rounded-lg border" style={{ borderColor: C.line }}>
        {rows === null && <div className="p-3 text-xs" style={{ color: C.faint }}>loading…</div>}
        {rows && !rows.length && <div className="p-3 text-xs" style={{ color: C.faint }}>No campaigns yet. The first one starts with New mass email.</div>}
        {drafts.map(card)}
        {sent.map(card)}
      </div>
    </div>
  );
}

/** One campaign opened — every line it sent, and everything that came back. */
function CampOpen({ id, onChanged }: { id: string; onChanged: () => void }) {
  const [d, setD] = useState<{ campaign: Camp | null; rows: Line[]; replies: Line[] } | null>(null);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");
  const load = useCallback(async () => {
    try { setD(await api.get(`/api/hrms/mass-mail?campaign=${encodeURIComponent(id)}`)); }
    catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  const pull = async () => {
    setBusy("pull"); setMsg("");
    let off = 0, found = 0;
    try {
      for (;;) {
        const r = await api.post("/api/hrms/mass-mail", { action: "pull-replies", campaign_id: id, offset: off });
        found += r.found || 0; off = r.done;
        if (!r.more) break;
      }
      setMsg(found ? `${found} new ${found === 1 ? "reply" : "replies"} filed ✓` : "Nothing new came back.");
      await load(); onChanged();
    } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
    setBusy("");
  };

  if (!d) return <div className="text-xs p-2" style={{ color: C.faint }}>{msg || "opening…"}</div>;
  const all = [...d.rows, ...d.replies].sort((a, b) => String(b.sent_at).localeCompare(String(a.sent_at)));
  return (
    <div className="mt-2 rounded border" style={{ borderColor: C.line, background: "#FBFAF7" }}>
      <div className="flex gap-2 items-center flex-wrap p-2 text-xs">
        <b>{d.rows.filter((r) => r.direction === "out").length}</b> sent
        {d.replies.length + d.rows.filter((r) => r.direction === "in").length > 0 && <span style={{ color: C.green }}><b>{d.replies.length + d.rows.filter((r) => r.direction === "in").length}</b> came back</span>}
        <span style={{ flex: 1 }} />
        {msg && <span className="font-bold" style={{ color: msg.includes("✓") ? C.green : C.red }}>{msg}</span>}
        <button onClick={pull} disabled={!!busy} className="rounded border px-2 py-1 bg-white font-bold" style={{ borderColor: C.line, color: C.dim }}>
          {busy ? "reading the mailbox…" : "↩ Pull replies"}
        </button>
      </div>
      <div className="bg-white" style={{ maxHeight: 320, overflowY: "auto", borderTop: `1px solid ${C.line}` }}>
        {all.map((r, i) => (
          <div key={r.id} className="px-3 py-1.5 text-xs flex gap-2 items-baseline flex-wrap" style={{ borderTop: i ? "1px solid #F1EFE9" : undefined }}>
            <span className="rounded px-1.5 py-0.5 font-bold" style={{ background: r.direction === "in" ? "#E6F4EA" : "#F4F2EC", color: tone(r.status), fontSize: 10 }}>{r.direction === "in" ? "↩ reply" : r.status}</span>
            <span className="font-semibold">{r.name}</span>
            <span style={{ color: C.faint }}>{r.channel === "whatsapp" ? "💬" : "✉"} {r.to_address}</span>
            <span style={{ flex: 1 }} />
            <span style={{ color: C.faint }}>{fmtFull(String(r.sent_at))}</span>
            {r.error && <span style={{ color: C.red }} title={r.error}>!</span>}
          </div>
        ))}
        {!all.length && <div className="p-3 text-xs" style={{ color: C.faint }}>Nothing sent from this one yet.</div>}
      </div>
    </div>
  );
}

/* ─────────────────────────── one mail to many ───────────────────────────
   Dr Raghu, 7 Sep 2026: "here make a button — Send mass email, template
   choice, from mail id hr@nandan.co.in / raghu@nandan.co.in, choose the
   OAuth of that for sending, variables to add on right side, attachment,
   send." Then, the same day: send as hr@ through his own mailbox with the
   answers going to HR, a choice of company or personal address, LC and
   Stratcom as audiences of their own, a rich-text body, and Save draft. */
type Boot = {
  froms: { email: string; connected: boolean }[];
  templates: { key: string; title: string; body: string }[];
  variables: { key: string; label: string }[];
  types: string[]; departments: string[]; total: number; withEmail: number;
  withCompany: number; withPersonal: number;
  /** The addresses THIS person may put on a From line — never somebody else's. */
  mayShowAs: string[];
  groups: { key: string; label: string; count: number; title: string }[];
};
type Pre = {
  count: number; noEmail: { id: string; name: string }[]; missing: string[];
  sample: { name: string; to: string; subject: string; html: string }[];
  list: { id: string; name: string; type: string; department: string | null; to: string; missing: number }[];
};

function MassEmail({ draft, onClose }: { draft: Camp | null; onClose: () => void }) {
  const [boot, setBoot] = useState<Boot | null>(null);
  const [campId, setCampId] = useState<string | null>(draft && draft.status === "draft" ? draft.id : null);
  const [title, setTitle] = useState(draft?.title || "");
  const [from, setFrom] = useState(draft?.from_email || "");
  const [fromAs, setFromAs] = useState(draft?.from_as || "");
  const [replyTo, setReplyTo] = useState(draft?.reply_to || "");
  const [toPref, setToPref] = useState(draft?.to_pref || "either");
  const [tpl, setTpl] = useState(draft?.template_key || "");
  const [subject, setSubject] = useState(draft?.subject || "");
  const [body, setBody] = useState(draft?.body || "");
  const [seed, setSeed] = useState(0);           // remounts the rich editor
  const [types, setTypes] = useState<string[]>(draft?.audience?.types || []);
  const [depts, setDepts] = useState<string[]>(draft?.audience?.departments || []);
  const [groups, setGroups] = useState<string[]>(draft?.audience?.groups || []);
  const [atts, setAtts] = useState<{ name: string; mime: string; path: string; size: number }[]>([]);
  // EACH PERSON'S OWN SLIP (Dr Raghu, 7 Oct 2026): on when the salary-slip template is chosen; can be ticked for any mail
  const [attachSlip, setAttachSlip] = useState(false);
  const [upload, setUpload] = useState("");
  const [pre, setPre] = useState<Pre | null>(null);
  const [showList, setShowList] = useState(false);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");
  const [progress, setProgress] = useState<{ done: number; of: number; sent: number; failed: number } | null>(null);
  const subjRef = useRef<HTMLInputElement | null>(null);
  const lastBox = useRef<"subject" | "body">("body");

  useEffect(() => {
    api.get("/api/hrms/mass-mail").then((j: Boot) => {
      setBoot(j);
      if (!from) { const okBox = j.froms.find((f) => f.connected); if (okBox) setFrom(okBox.email); }
    }).catch((e) => setMsg(e instanceof Error ? e.message : String(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Click a variable and it drops where the cursor was — in the subject box
   * by its selection, in the rich body at the caret. The button refuses the
   * mousedown so the caret never leaves the editor.
   */
  const insert = (k: string) => {
    const token = `{{${k}}}`;
    if (lastBox.current === "subject") {
      const el = subjRef.current; if (!el) return;
      const a = el.selectionStart ?? el.value.length, b2 = el.selectionEnd ?? a;
      setSubject(el.value.slice(0, a) + token + el.value.slice(b2));
      requestAnimationFrame(() => { el.focus(); el.setSelectionRange(a + token.length, a + token.length); });
      return;
    }
    document.execCommand("insertText", false, token);
  };
  /**
   * The file goes STRAIGHT INTO STORAGE, not through the API (Dr Raghu,
   * 7 Sep 2026, on a 12 MB deck: "Request Entity Too Large"). Vercel refuses
   * a request body over 4.5 MB, so a big attachment could never reach the
   * send at all. Genie asks for a signed URL, the browser pushes the file to
   * storage itself, and only the name travels with the mail.
   */
  const addFiles = async (list: FileList | null) => {
    if (!list) return;
    const out = [...atts];
    setMsg("");
    for (const f of Array.from(list)) {
      setUpload(`sending ${f.name} up…`);
      try {
        const t = await api.post("/api/hrms/mass-mail", { action: "attach-url", name: f.name, size: f.size });
        const { error } = await supabaseBrowser().storage.from(t.bucket).uploadToSignedUrl(t.path, t.token, f);
        if (error) throw new Error(`${f.name} did not upload: ${error.message}`);
        out.push({ name: f.name, mime: f.type || "application/octet-stream", path: t.path, size: f.size });
      } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
    }
    setUpload("");
    setAtts(out);
  };

  const audience = { types: types.length ? types : undefined, departments: depts.length ? depts : undefined, groups: groups.length ? groups : undefined };
  const settings = { from, from_as: fromAs || undefined, reply_to: replyTo || undefined, to_pref: toPref, template_key: tpl || undefined, title: title || subject };

  const check = async () => {
    setBusy("check"); setMsg(""); setPre(null);
    try { setPre(await api.post("/api/hrms/mass-mail", { action: "preview", subject, body, ...settings, ...audience })); }
    catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
    setBusy("");
  };
  const saveDraft = async () => {
    setBusy("draft"); setMsg("");
    try {
      const r = await api.post("/api/hrms/mass-mail", { action: "save-draft", campaign_id: campId || undefined, subject, body, ...settings, ...audience, attachments: atts.map(({ name, mime, path }) => ({ name, mime, path })) });
      setCampId(r.campaign_id); setMsg("Draft saved ✓");
    } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
    setBusy("");
  };
  const send = async () => {
    if (!pre?.count) return;
    const shownFrom = fromAs || from;
    if (!window.confirm(`Send this to ${pre.count} ${pre.count === 1 ? "person" : "people"}?\n\nThey will see it from ${shownFrom}${fromAs && fromAs !== from ? `, carried by ${from}` : ""}${replyTo ? `, answers to ${replyTo}` : ""}.\nEvery one is written onto the person's record.`)) return;
    setBusy("send"); setMsg(""); setProgress({ done: 0, of: pre.count, sent: 0, failed: 0 });
    let off = 0, sent = 0, failed = 0, cid = campId;
    try {
      for (;;) {
        const r = await api.post("/api/hrms/mass-mail", { action: "send", subject, body, ...settings, ...audience, campaign_id: cid || undefined, attachments: atts.map(({ name, mime, path }) => ({ name, mime, path })), attach_slip: attachSlip, offset: off });
        cid = r.campaign_id || cid; setCampId(cid);
        sent += r.sent || 0; failed += (r.failed || []).length; off = r.done;
        setProgress({ done: r.done, of: r.of, sent, failed });
        if (!r.more) break;
      }
      setMsg(`${sent} sent${failed ? `, ${failed} failed` : ""} ✓`);
    } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
    setBusy("");
  };

  const inp: React.CSSProperties = { border: `1px solid ${C.line}`, borderRadius: 6, padding: "7px 9px", fontSize: 13, width: "100%", background: "#fff", color: C.ink };
  const chip = (on: boolean) => ({ border: `1px solid ${on ? C.ink : C.line}`, background: on ? C.ink : "#fff", color: on ? "#fff" : C.dim, borderRadius: 999, padding: "2px 9px", fontSize: 11, fontWeight: 700, cursor: "pointer" });
  const roomChip = (on: boolean) => ({ ...chip(on), border: `1px solid ${on ? "var(--accent)" : C.line}`, background: on ? "var(--accent)" : "#fff" });

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(22,35,47,.55)", zIndex: 70, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "24px 12px", overflowY: "auto" }}>
      <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-lg genie-modal" style={{ width: "min(1100px, 100%)", maxHeight: "92vh", overflowY: "auto" }}>
        <div className="px-4 py-3 flex items-center gap-3" style={{ background: C.ink, color: "#fff", position: "sticky", top: 0, zIndex: 2 }}>
          <div className="font-bold flex-1" style={{ fontSize: 16 }}>{campId ? "Mass email — draft" : "Send mass email"}</div>
          <button onClick={onClose} style={{ color: "#8FA1B3", fontSize: 20, lineHeight: 1 }}>✕</button>
        </div>
        <div className="p-4">
          {!boot && <div className="text-sm" style={{ color: C.faint }}>{msg || "opening…"}</div>}
          {boot && (
            <div className="grid gap-4" style={{ gridTemplateColumns: "minmax(0,1fr) 250px" }}>
              <div className="min-w-0">
                <div className="grid gap-2 mb-2" style={{ gridTemplateColumns: "1fr 1fr" }}>
                  <label className="text-xs font-bold" style={{ color: C.dim }}>SENT THROUGH — this Gmail carries it
                    <select value={from} onChange={(e) => setFrom(e.target.value)} style={{ ...inp, marginTop: 3 }}>
                      {boot.froms.map((f) => <option key={f.email} value={f.email} disabled={!f.connected}>{f.email}{f.connected ? "" : " — Gmail not connected"}</option>)}
                    </select>
                  </label>
                  <label className="text-xs font-bold" style={{ color: C.dim }}>TEMPLATE
                    <select value={tpl} onChange={(e) => { setTpl(e.target.value); const t = boot.templates.find((x) => x.key === e.target.value); if (t) { setBody(t.body || ""); setSeed((n) => n + 1); if (!subject.trim()) setSubject(t.title || ""); setAttachSlip(/slip/i.test(`${t.key} ${t.title}`)); } }} style={{ ...inp, marginTop: 3 }}>
                      <option value="">— none, write it here —</option>
                      {boot.templates.map((t) => <option key={t.key} value={t.key}>{t.title}</option>)}
                    </select>
                  </label>
                </div>

                {/* Dr Raghu, 7 Sep 2026: "an option to also still send the mail
                    as From: hr@nandan.co.in even though its from my mail id.
                    Reply to should be to hr@nandan.co.in." */}
                <div className="grid gap-2 mb-2" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
                  {/* Dr Raghu, 7 Sep 2026: "vinay cant send as me!" — only
                      your own address, or the mailbox actually carrying it. */}
                  <label className="text-xs font-bold" style={{ color: C.dim }}>SHOWN AS — what the reader sees
                    <select value={fromAs} onChange={(e) => setFromAs(e.target.value)} style={{ ...inp, marginTop: 3 }}>
                      <option value="">the same address it goes through</option>
                      {(boot.mayShowAs || []).filter((a) => a !== from).map((a) => <option key={a} value={a}>{a}</option>)}
                    </select>
                  </label>
                  <label className="text-xs font-bold" style={{ color: C.dim }}>ANSWERS GO TO
                    <select value={replyTo} onChange={(e) => setReplyTo(e.target.value)} style={{ ...inp, marginTop: 3 }}>
                      <option value="">wherever it was sent from</option>
                      {boot.froms.map((f) => <option key={f.email} value={f.email}>{f.email}</option>)}
                    </select>
                  </label>
                  <label className="text-xs font-bold" style={{ color: C.dim }}>WHICH ADDRESS
                    <select value={toPref} onChange={(e) => setToPref(e.target.value)} style={{ ...inp, marginTop: 3 }}>
                      <option value="either">company, else personal ({boot.withEmail})</option>
                      <option value="company">company only ({boot.withCompany})</option>
                      <option value="personal">personal only ({boot.withPersonal})</option>
                      <option value="personal_first">personal, else company</option>
                    </select>
                  </label>
                </div>
                {fromAs && fromAs !== from && (
                  <div className="text-xs mb-2 rounded px-2 py-1.5" style={{ background: "#FFF6E5", color: "#8A5B00" }}>
                    Gmail only lets {from} write {fromAs} on a mail when {fromAs} is a verified <b>Send mail as</b> address in that account&apos;s settings. If it is not, Gmail refuses the send and the check will say so. The answers-to line always works.
                  </div>
                )}
                {!(boot.mayShowAs || []).filter((a) => a !== from).length && (
                  <div className="text-xs mb-2" style={{ color: C.faint }}>
                    The mail will read as {from}. Nobody may put another person&apos;s address on the From line — only the mailbox carrying it, or your own.
                  </div>
                )}

                <div className="text-xs font-bold mb-1" style={{ color: C.dim }}>WHO IT GOES TO</div>
                <div className="flex gap-1.5 flex-wrap mb-1 items-center">
                  {boot.groups?.map((g) => (
                    <span key={g.key} title={g.title} onClick={() => setGroups((x) => x.includes(g.key) ? x.filter((y) => y !== g.key) : [...x, g.key])} style={roomChip(groups.includes(g.key))}>
                      {g.label} · {g.count}
                    </span>
                  ))}
                  <span style={{ width: 10 }} />
                  {boot.types.map((t) => <span key={t} onClick={() => setTypes((x) => x.includes(t) ? x.filter((y) => y !== t) : [...x, t])} style={chip(types.includes(t))}>{t}</span>)}
                </div>
                <div className="flex gap-1.5 flex-wrap mb-2">
                  {boot.departments.map((d) => <span key={d} onClick={() => setDepts((x) => x.includes(d) ? x.filter((y) => y !== d) : [...x, d])} style={chip(depts.includes(d))}>{d}</span>)}
                </div>
                <div className="text-xs mb-3" style={{ color: C.faint }}>
                  {groups.length ? "The room itself — the types and departments below are ignored while a room is ticked."
                    : types.length || depts.length ? "Only the ticked ones."
                    : `Everybody on the roll — ${boot.total}, of whom ${boot.withEmail} have an e-mail on the record.`}
                </div>

                <label className="text-xs font-bold" style={{ color: C.dim }}>SUBJECT
                  <input ref={subjRef} value={subject} onFocus={() => { lastBox.current = "subject"; }} onChange={(e) => setSubject(e.target.value)} style={{ ...inp, marginTop: 3 }} />
                </label>

                {/* Dr Raghu, 7 Sep 2026: "make the mail rick text" */}
                <div className="text-xs font-bold block mt-2" style={{ color: C.dim }}>THE MAIL</div>
                <div onFocus={() => { lastBox.current = "body"; }} className="mt-1">
                  <RichTextEditor key={seed} initial={body} live onChangeHtml={setBody} minHeight={240}
                    placeholder="Write it as it should read. Bold, lists and links all travel." />
                </div>

                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  <label className="text-xs font-bold rounded px-2.5 py-1.5" style={{ border: `1px solid ${C.line}`, cursor: "pointer", color: C.dim }}>
                    📎 Attach files<input type="file" multiple className="hidden" onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
                  </label>
                  {upload && <span className="text-xs font-bold" style={{ color: "var(--blue)" }}>{upload}</span>}
                  <label className="text-xs flex items-center gap-1" style={{ color: attachSlip ? "var(--navy)" : C.dim, fontWeight: attachSlip ? 700 : 400, border: `1px solid ${attachSlip ? "var(--navy)" : C.line}`, borderRadius: 4, padding: "2px 8px", cursor: "pointer" }} title="Every mail carries that person's own A5 salary slip for the latest payroll month, pressed to PDF as it goes — five mails a batch">
                    <input type="checkbox" checked={attachSlip} onChange={(e) => setAttachSlip(e.target.checked)} /> 📄 Attach each person&apos;s own salary slip
                  </label>
                  {atts.map((a, i) => (
                    <span key={i} className="text-xs rounded px-2 py-1" style={{ background: "#F4F2EC" }}>
                      {a.name} <span style={{ color: C.faint }}>{(a.size / 1024).toFixed(0)} KB</span>
                      <button onClick={() => setAtts(atts.filter((_, j) => j !== i))} className="ml-1" style={{ color: C.red }}>✕</button>
                    </span>
                  ))}
                </div>

                <div className="flex gap-2 mt-3 items-center flex-wrap">
                  <button onClick={saveDraft} disabled={!!busy || !subject.trim()} className="rounded px-3 py-1.5 text-xs font-bold" style={{ border: `1px solid ${C.line}`, background: "#fff", color: C.dim }}>
                    {busy === "draft" ? "saving…" : "Save draft"}
                  </button>
                  <button onClick={check} disabled={!!busy || !subject.trim() || !body.trim()} className="rounded px-3 py-1.5 text-xs font-bold text-white" style={{ background: busy || !subject.trim() || !body.trim() ? "#B9BEC4" : C.ink }}>
                    {busy === "check" ? "checking…" : "1 · Check it"}
                  </button>
                  <button onClick={send} disabled={!pre?.count || !!busy || !from} className="rounded px-3 py-1.5 text-xs font-bold text-white" style={{ background: pre?.count && !busy && from ? "var(--accent)" : "#B9BEC4" }}>
                    {busy === "send" ? "sending…" : `2 · Send to ${pre?.count ?? 0}`}
                  </button>
                  {progress && <span className="text-xs font-bold" style={{ color: C.green }}>{progress.done} of {progress.of} · {progress.sent} sent{progress.failed ? ` · ${progress.failed} failed` : ""}</span>}
                  {msg && <span className="text-xs font-bold" style={{ color: msg.includes("✓") ? C.green : C.red }}>{msg}</span>}
                </div>

                {pre && (
                  <div className="mt-3 rounded border p-3" style={{ borderColor: C.line, background: "#FBFAF7" }}>
                    <div className="text-xs flex gap-2 items-baseline flex-wrap">
                      <span><b>{pre.count}</b> will receive it{pre.noEmail.length ? <> · <b style={{ color: C.red }}>{pre.noEmail.length}</b> have no e-mail on the record</> : null}</span>
                      <span style={{ flex: 1 }} />
                      <button onClick={() => setShowList(!showList)} className="rounded border px-2 py-0.5 bg-white font-bold" style={{ borderColor: C.line, color: C.dim }}>
                        {showList ? "hide the list" : "show who it goes to"}
                      </button>
                    </div>
                    {pre.missing.length > 0 && <div className="text-xs mt-1" style={{ color: "#8A5B00" }}>These variables come out blank for somebody: {pre.missing.join(", ")}</div>}

                    {/* Dr Raghu, 7 Sep 2026: "on checking show the samples 3
                        random, and also the record to whom it will go." */}
                    {showList && (
                      <div className="mt-2 rounded bg-white" style={{ border: `1px solid ${C.line}`, maxHeight: 260, overflowY: "auto" }}>
                        {pre.list.map((r, i) => (
                          <div key={r.id} className="px-2 py-1 text-xs flex gap-2 items-baseline" style={{ borderTop: i ? "1px solid #F1EFE9" : undefined }}>
                            <span className="tnum" style={{ color: C.faint, width: 52 }}>{r.id}</span>
                            <span className="font-semibold" style={{ minWidth: 160 }}>{r.name}</span>
                            <span style={{ color: C.faint }}>{r.type}{r.department ? ` · ${r.department}` : ""}</span>
                            <span style={{ flex: 1 }} />
                            <span style={{ color: C.dim }}>{r.to}</span>
                            {r.missing > 0 && <span style={{ color: "#8A5B00" }} title="a variable comes out blank for this one">◦</span>}
                          </div>
                        ))}
                        {pre.noEmail.map((r) => (
                          <div key={`x${r.id}`} className="px-2 py-1 text-xs flex gap-2 items-baseline" style={{ borderTop: "1px solid #F1EFE9", color: C.red }}>
                            <span className="tnum" style={{ width: 52 }}>{r.id}</span><span className="font-semibold">{r.name}</span>
                            <span style={{ flex: 1 }} /><span>no address on the record — will not go</span>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="grid gap-2 mt-2" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
                      {pre.sample.map((s, i) => (
                        <div key={i} className="rounded bg-white p-2" style={{ border: `1px solid ${C.line}` }}>
                          <div className="text-xs" style={{ color: C.faint }}>as {s.name} will see it — {s.to}</div>
                          <div className="text-sm font-bold mt-1">{s.subject}</div>
                          <div className="text-sm" style={{ maxHeight: 220, overflow: "auto" }} dangerouslySetInnerHTML={{ __html: s.html }} />
                        </div>
                      ))}
                    </div>
                    <div className="text-xs mt-2" style={{ color: C.faint }}>Three picked at random, so the check catches a template that breaks on somebody in the middle of the roll.</div>
                  </div>
                )}
              </div>

              <div className="rounded border p-2" style={{ borderColor: C.line, background: "#FBFAF7", alignSelf: "start", position: "sticky", top: 60 }}>
                <label className="text-xs font-bold block mb-2" style={{ color: C.faint }}>NAME THIS ONE
                  <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={subject || "for the list"} style={{ ...inp, marginTop: 3, fontSize: 12 }} />
                </label>
                <div className="text-xs font-bold mb-1" style={{ color: C.faint }}>VARIABLES — click to drop in</div>
                <div style={{ maxHeight: 380, overflowY: "auto" }}>
                  {boot.variables.map((v) => (
                    <button key={v.key} onMouseDown={(e) => e.preventDefault()} onClick={() => insert(v.key)}
                      className="block w-full text-left rounded px-1.5 py-0.5 mb-0.5" style={{ background: "#fff", border: `1px solid ${C.line}`, fontSize: 11 }} title={v.label}>
                      <span style={{ fontFamily: "ui-monospace, monospace" }}>{`{{${v.key}}}`}</span>
                    </button>
                  ))}
                </div>
                <div className="text-xs mt-2" style={{ color: C.faint, lineHeight: 1.5 }}>Filled per person from their record. A variable with nothing behind it is left blank, and the check names it.</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
