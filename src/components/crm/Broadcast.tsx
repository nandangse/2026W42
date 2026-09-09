"use client";
/**
 * SEND TO THE ONES YOU PICKED (Dr Raghu, 9 Sep 2026).
 *
 * "In the contacts we will apply filter etc, then after choosing make the
 *  select of the contacts, then click on the button on top which is Send
 *  Email / Send WA. Then show this template page. We should be able to show
 *  template with variables. On creation of the messages, attachment or image
 *  to be shown. Then send."
 *
 * The list already filters and already selects. This is the step that was
 * missing between "these forty" and "send": a template, its variables shown
 * rather than remembered, what is attached, and a preview of ONE REAL
 * MESSAGE as the first of them will read it.
 *
 * THE PREVIEW IS THE POINT. A bulk send is the one act nobody can take back,
 * and a {{variable}} that renders empty on a bare phone number looks
 * identical to one that renders correctly — until forty people have it. So
 * the box shows the message as it will actually go to the first selected
 * contact, braces and all, before the button is live.
 *
 * NOTHING LEAVES FROM HERE. Queue writes the document and its rows and
 * stops; releasing them is the queue's job, with its ceilings, on whichever
 * road is switched on.
 */
import { useEffect, useMemo, useState } from "react";
import { NAVY, NAVY_DARK, NAVY_SOFT, INK, MUTED, BORDER, GREEN, ORANGE } from "./palette";
import VariableHelp from "./VariableHelp";

export type Picked = { id: string; name: string; email: string | null; phone: string | null };

type MailTpl = { id: string; label: string; subject: string | null; body: string; attachments: { name: string; link: string }[] };
type WaTpl = { id: string; label: string; body: string; attachments: { name: string; link: string }[] };

export default function Broadcast({
  channel, personIds, onClose, onQueued,
}: {
  channel: "email" | "whatsapp";
  personIds: string[];
  onClose: () => void;
  onQueued: (msg: string) => void;
}) {
  const mail = channel === "email";
  /**
   * WHO THEY ARE IS ASKED FOR, NOT HANDED OVER. The contact list carries
   * only the columns a person chose to see, so a view with the e-mail
   * column hidden would otherwise report that none of the forty have one.
   */
  const [people, setPeople] = useState<Picked[]>([]);
  useEffect(() => {
    if (!personIds.length) return;
    fetch(`/api/crm/broadcast?people=${encodeURIComponent(personIds.join(","))}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setPeople((j.people || []) as Picked[]))
      .catch(() => setPeople(personIds.map((id) => ({ id, name: id, email: null, phone: null }))));
  }, [personIds]);
  const [templates, setTemplates] = useState<{ id: string; label: string; subject?: string | null; body: string; attachments: { name: string; link: string }[] }[]>([]);
  const [tpl, setTpl] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [campaign, setCampaign] = useState("");
  const [params, setParams] = useState("");
  const [media, setMedia] = useState({ url: "", filename: "" });
  const [atts, setAtts] = useState<{ name: string; link: string }[]>([]);
  const [attName, setAttName] = useState("");
  const [attLink, setAttLink] = useState("");
  const [vars, setVars] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  /** Which road WhatsApp is on — it decides whether prose can be sent at all. */
  const [road, setRoad] = useState<{ aisensy: boolean; campaign: string | null } | null>(null);

  useEffect(() => {
    /* Mail templates ride on the Gmail status payload — the same place the
       single-message composer reads them, so the two lists cannot differ. */
    const url = mail ? "/api/crm/gmail/status" : "/api/crm/wa/templates";
    fetch(url, { cache: "no-store" }).then((r) => r.json())
      .then((j) => setTemplates((j.templates || []) as MailTpl[] | WaTpl[]))
      .catch(() => { /* templates are a convenience, not a gate */ });
    if (!mail) {
      fetch("/api/hrms/whatsapp", { cache: "no-store" }).then((r) => r.json())
        .then((j) => {
          const a = j?.queue?.aisensy;
          if (a) { setRoad({ aisensy: !!a.live, campaign: a.campaign || null }); if (a.live && a.campaign) setCampaign(a.campaign); }
        })
        .catch(() => { /* if we cannot tell, both boxes are offered */ });
    }
  }, [mail]);

  const apply = (id: string) => {
    setTpl(id);
    const t = templates.find((x) => x.id === id);
    if (!t) return;
    setBody(t.body || "");
    if (mail && t.subject) setSubject(t.subject);
    if (t.attachments?.length) setAtts(t.attachments);
  };

  const withEmail = useMemo(() => people.filter((p) => (p.email || "").includes("@")), [people]);
  const withPhone = useMemo(() => people.filter((p) => String(p.phone || "").replace(/\D/g, "").length >= 8), [people]);
  const reachable = mail ? withEmail : withPhone;
  const first = reachable[0] || people[0] || null;

  /** The message as the FIRST selected contact will read it. Only the
   *  variables this screen can know are filled — the server fills the rest
   *  per person, so anything still in braces here may yet resolve. */
  const preview = useMemo(() => {
    if (!body) return "";
    const nm = String(first?.name || "");
    return body
      .replace(/\{\{\s*name\s*\}\}/gi, nm)
      .replace(/\{\{\s*first_name\s*\}\}/gi, nm.split(" ")[0] || nm);
  }, [body, first]);

  const send = async () => {
    setBusy(true); setErr("");
    try {
      const r = await fetch("/api/crm/broadcast", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({
          channel, subject, body,
          template: templates.find((t) => t.id === tpl)?.label || "",
          campaign: mail ? "" : campaign,
          params: params.split(",").map((x) => x.trim()).filter(Boolean),
          media: !mail && media.url ? media : null,
          attachments: atts,
          person_ids: personIds,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(String(j.error || r.status));
      onQueued(String(j.note || `${j.queued} queued.`));
      onClose();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    setBusy(false);
  };

  const L = ({ children }: { children: React.ReactNode }) => (
    <div className="text-xs font-bold mb-1" style={{ color: MUTED, letterSpacing: .5 }}>{children}</div>
  );

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 90, background: "rgba(22,35,47,.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} className="rounded-lg bg-white"
        style={{ width: "min(860px, 100%)", maxHeight: "calc(100vh - 40px)", overflowY: "auto", boxShadow: "0 12px 40px rgba(27,45,107,.35)" }}>

        <div className="flex items-center justify-between px-4 py-2.5" style={{ background: NAVY_DARK, borderRadius: "8px 8px 0 0" }}>
          <b className="text-white text-sm">{mail ? "✉ Send Email" : "💬 Send WhatsApp"} — {personIds.length} selected</b>
          <button onClick={onClose} className="text-white font-bold px-2">✕</button>
        </div>

        <div className="p-4">
          {/* WHO IT REACHES, before anything is typed. A number that is
              smaller than the selection is the single most useful fact on
              this screen, and it must not wait until after Queue. */}
          <div className="rounded p-2 mb-3 text-xs" style={{ background: people.length > 0 && reachable.length === people.length ? "#F0FAF3" : "#FFF7E6", border: `1px solid ${people.length > 0 && reachable.length === people.length ? "#BFE3CD" : "#F5D9A8"}`, lineHeight: 1.6, color: INK }}>
            <b>{reachable.length}</b> of {personIds.length} can be reached {mail ? "by e-mail" : "on WhatsApp"}.
            {people.length > 0 && reachable.length < people.length && (
              <> The other <b>{people.length - reachable.length}</b> have no {mail ? "e-mail address" : "usable phone number"} on the record — they are listed as skipped on the broadcast rather than silently dropped.</>
            )}
          </div>

          {!mail && road?.aisensy && (
            <div className="rounded p-2 mb-3 text-xs" style={{ background: "#F0FAF3", border: "1px solid #BFE3CD", lineHeight: 1.6, color: "#1E7A45" }}>
              <b>Going out through AiSensy</b> — Meta&apos;s official API. <b>Template only:</b> what is sent is the
              CAMPAIGN below, not the words in the box. The message body is still written and kept, because it is what
              the record shows and what the queue falls back to if the road changes.
            </div>
          )}

          {templates.length > 0 && (
            <div className="mb-3">
              <L>TEMPLATE</L>
              <select value={tpl} onChange={(e) => apply(e.target.value)} className="rounded border px-2 py-1.5 w-full" style={{ borderColor: BORDER, fontSize: 13 }}>
                <option value="">— write it fresh —</option>
                {templates.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
            </div>
          )}

          {mail && (
            <div className="mb-3">
              <L>SUBJECT</L>
              <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="What it is about"
                className="rounded border px-2 py-1.5 w-full" style={{ borderColor: subject ? BORDER : "#F5D9A8", fontSize: 13 }} />
            </div>
          )}

          {!mail && (road?.aisensy || campaign) && (
            <div className="flex gap-2 mb-3 flex-wrap">
              <div style={{ flex: "1 1 45%", minWidth: 200 }}>
                <L>CAMPAIGN (a template set LIVE in AiSensy)</L>
                <input value={campaign} onChange={(e) => setCampaign(e.target.value)} placeholder="campaign name"
                  className="rounded border px-2 py-1.5 w-full" style={{ borderColor: BORDER, fontSize: 13 }} />
              </div>
              <div style={{ flex: "1 1 45%", minWidth: 200 }}>
                <L>VARIABLES, IN THE TEMPLATE&apos;S ORDER</L>
                <input value={params} onChange={(e) => setParams(e.target.value)} placeholder="comma separated — blank if the template has none"
                  className="rounded border px-2 py-1.5 w-full" style={{ borderColor: BORDER, fontSize: 13 }} />
              </div>
            </div>
          )}

          <div className="mb-1 flex items-center gap-2">
            <L>MESSAGE</L>
            <button onClick={() => setVars((v) => !v)} className="text-xs font-bold rounded px-2 py-0.5 mb-1"
              style={{ background: NAVY_SOFT, color: NAVY }}>{vars ? "hide variables" : "{{ variables }}"}</button>
          </div>
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={7}
            placeholder={"Dear {{first_name}},\n\n…\n\nRegards\n{{sales_person}}"}
            className="rounded border px-2 py-1.5 w-full" style={{ borderColor: BORDER, fontSize: 13, fontFamily: "inherit", lineHeight: 1.6 }} />
          {vars && <div className="mt-2"><VariableHelp compact /></div>}

          {/* ---- what is attached ---- */}
          <div className="mt-3">
            <L>{mail ? "ATTACHMENTS" : "IMAGE OR DOCUMENT"}</L>
            {!mail && (
              <div className="text-xs mb-1" style={{ color: MUTED, lineHeight: 1.5 }}>
                <b>Their servers fetch the link</b> — they do not receive an upload. Anything private must be a
                SIGNED link with a short life, never a permanent public one.
              </div>
            )}
            {atts.map((a, i) => (
              <div key={i} className="flex items-center gap-2 text-xs mb-1">
                <b style={{ color: INK }}>{a.name}</b>
                <span style={{ color: MUTED, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 380 }}>{a.link}</span>
                <button onClick={() => setAtts((v) => v.filter((_, j) => j !== i))} className="font-bold" style={{ color: "var(--red)" }}>✕</button>
              </div>
            ))}
            <div className="flex gap-2 flex-wrap">
              <input value={attName} onChange={(e) => setAttName(e.target.value)} placeholder="name, e.g. Catalogue.pdf"
                className="rounded border px-2 py-1.5" style={{ borderColor: BORDER, fontSize: 13, flex: "1 1 30%", minWidth: 150 }} />
              <input value={attLink} onChange={(e) => setAttLink(e.target.value)} placeholder="link (Drive, or a signed URL)"
                className="rounded border px-2 py-1.5" style={{ borderColor: BORDER, fontSize: 13, flex: "1 1 50%", minWidth: 200 }} />
              <button
                onClick={() => {
                  if (!attLink.trim()) return;
                  const a = { name: attName.trim() || attLink.trim().split("/").pop() || "file", link: attLink.trim() };
                  setAtts((v) => [...v, a]);
                  if (!mail && !media.url) setMedia({ url: a.link, filename: a.name });
                  setAttName(""); setAttLink("");
                }}
                className="rounded px-3 py-1.5 font-bold" style={{ background: NAVY_SOFT, color: NAVY, fontSize: 12.5 }}>+ Add</button>
            </div>
          </div>

          {/* ---- the preview ---- */}
          {body && (
            <div className="mt-3 rounded p-2" style={{ background: "#FAFAF8", border: `1px solid ${BORDER}` }}>
              <div className="text-xs font-bold mb-1" style={{ color: MUTED }}>
                AS {String(first?.name || "the first contact").toUpperCase()} WILL READ IT
              </div>
              {mail && subject && <div className="text-xs font-bold mb-1" style={{ color: INK }}>{subject}</div>}
              <div className="text-xs" style={{ color: INK, whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{preview}</div>
              {/\{\{/.test(preview) && (
                <div className="text-xs mt-1" style={{ color: ORANGE }}>
                  Braces still showing are filled per person by the server — company, salesperson, quotation and the rest.
                  A name that is not a real variable stays in braces all the way to the customer.
                </div>
              )}
            </div>
          )}

          {err && <div className="text-xs font-semibold mt-2" style={{ color: "var(--red)" }}>{err}</div>}

          <div className="flex items-center gap-2 mt-4 flex-wrap">
            <button onClick={send} disabled={busy || !reachable.length || (mail && !subject.trim()) || (!body.trim() && !campaign.trim())}
              className="rounded px-4 py-2 font-bold" style={{ background: GREEN, color: "#fff", fontSize: 13 }}>
              {busy ? "…" : `Queue for ${reachable.length}`}
            </button>
            <button onClick={onClose} className="rounded px-3 py-2 font-bold" style={{ background: "var(--line-soft)", color: MUTED, fontSize: 13 }}>Cancel</button>
            <span className="text-xs ml-auto" style={{ color: MUTED, lineHeight: 1.5, flexBasis: "100%" }}>
              Queue writes the broadcast and its messages and stops. <b>Nothing leaves from here</b> — releasing them is the
              queue&apos;s job, within its ceilings. Each message is filed against the contact, and against their deal when
              they have exactly one open — never guessed between two.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
