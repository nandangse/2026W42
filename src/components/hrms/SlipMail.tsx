"use client";
/**
 * MAILING EACH PERSON THEIR OWN SLIP (Dr Raghu, 7 Sep 2026: "how will the
 * slips go").
 *
 * The answer, until now, was that they would not. The mass-mail screen
 * attaches ONE list of files to EVERYBODY — right for a circular, useless for
 * a payslip — and /api/hrms/slip-mail, which presses a different PDF for
 * every person, had no button anywhere. This is that button.
 *
 * It lives on the salary sheet and not on the mass mail because this is the
 * only place that knows WHICH MONTH. {{month}} is a payroll field; on the
 * mass-mail screen it fills from the person's HRIS record and comes out
 * blank.
 *
 * Two rules the route enforces and this screen makes visible:
 *   · the address is the PERSONAL one and nothing else, because five or six
 *     people share a work mailbox and a payslip must not land in it;
 *   · Check before Send — the count, three real samples, and by name the
 *     people who will get nothing.
 * Sending is batched eight at a time: each slip is a browser page pressed to
 * PDF, and a request that tried two hundred would time out halfway with no
 * record of where it stopped.
 */
import { useEffect, useState } from "react";
import { C } from "./RecordFields";

const DEFAULT_BODY = `Dear {{first_name}},<br><br>
Please see attached your salary slip for <b>{{month}}</b>.<br><br>
Any queries, please fill them in here and they are answered and kept on your record:<br>
<a href="https://genie.nandan.co.in/hrms/query">genie.nandan.co.in/hrms/query</a><br><br>
Thank you,<br>
<b>Vinay</b><br>
Nandan HR<br><br>
P.S. A separate mail has been sent to you about logging in to <a href="https://genie.nandan.co.in/idp">genie.nandan.co.in/idp</a>, where your slips, your IDP and your record all live.`;

interface Checked { count: number; period: string; sample: { name: string; to: string }[];
  noPersonal: { id: string; name: string; why?: string }[]; held: { id: string; name: string }[] }
interface TypeRow { type: string; n: number; hold: number }

export default function SlipMail({ sheetId, status, onClose }: { sheetId: string; status: string; onClose: () => void }) {
  const [from, setFrom] = useState("hr@nandan.co.in");
  const [subject, setSubject] = useState("Your salary slip for {{month}}");
  const [body, setBody] = useState(DEFAULT_BODY);
  const [chk, setChk] = useState<Checked | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [prog, setProg] = useState<{ done: number; of: number; sent: number; failed: { name: string; why: string }[] } | null>(null);
  /**
   * WHICH CATEGORIES (Dr Raghu, 7 Sep 2026: "it could be select all, or it
   * could be choosing the categories"). Nothing ticked means everybody —
   * the same convention the mass mail uses, so the two screens read alike.
   */
  const [types, setTypes] = useState<TypeRow[] | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  useEffect(() => {
    fetch(`/api/hrms/slip-mail?sheet=${encodeURIComponent(sheetId)}`)
      .then((r) => r.json()).then((j) => setTypes(j.types || [])).catch(() => setTypes([]));
  }, [sheetId]);
  const toggle = (t: string) => { setChk(null); setPicked((p) => (p.includes(t) ? p.filter((x) => x !== t) : [...p, t])); };

  const post = async (payload: Record<string, unknown>) => {
    const r = await fetch("/api/hrms/slip-mail", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sheet: sheetId, from, subject, body, types: picked, ...payload }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j?.error || "Something went wrong.");
    return j;
  };

  const check = async () => {
    setBusy(true); setNote(""); setProg(null);
    try { setChk(await post({ action: "preview" })); }
    catch (e) { setNote(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  /** Eight at a time until the route says there are no more. */
  const send = async () => {
    if (!chk) return;
    if (!window.confirm(`Send ${chk.count} salary slips for ${chk.period}?\n\nEach person gets their own PDF at their PERSONAL address. This cannot be taken back.`)) return;
    setBusy(true); setNote("");
    let offset = 0, sent = 0; const failed: { name: string; why: string }[] = [];
    try {
      for (;;) {
        const j = await post({ offset });
        sent += Number(j.sent) || 0;
        for (const f of j.failed || []) failed.push({ name: f.name, why: f.why });
        offset = Number(j.done) || offset;
        setProg({ done: offset, of: Number(j.of) || chk.count, sent, failed });
        if (!j.more) break;
      }
      setNote(`Done — ${sent} slips sent${failed.length ? `, ${failed.length} failed` : ""}.`);
    } catch (e) { setNote(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  const box: React.CSSProperties = { border: `1px solid ${C.line}`, borderRadius: 6, padding: "6px 8px", width: "100%", fontSize: 13 };

  return (
    <div style={{ border: `1px solid ${C.line}`, borderRadius: 8, padding: 14, marginTop: 12, background: "#fff" }}>
      <div className="flex items-center justify-between mb-2">
        <div style={{ fontWeight: 800, fontSize: 14 }}>Mail each person their own slip</div>
        <button onClick={onClose} style={{ border: `1px solid ${C.line}`, borderRadius: 6, padding: "3px 9px", fontSize: 12, background: "#fff", cursor: "pointer" }}>Close</button>
      </div>

      {status !== "Frozen" && (
        <div style={{ background: "#FFF4E0", border: "1px solid #E7C98A", borderRadius: 6, padding: "6px 9px", fontSize: 12, marginBottom: 9 }}>
          This month is <b>{status}</b>, not frozen — every slip will be pressed with <b>DRAFT</b> across it.
        </div>
      )}

      {/* WHO IT GOES TO */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 11, color: C.faint, textTransform: "uppercase", letterSpacing: .3, marginBottom: 4 }}>Who it goes to</div>
        <div className="flex flex-wrap gap-1.5 items-center">
          <button onClick={() => { setPicked([]); setChk(null); }}
            className="rounded px-2.5 py-1 font-bold" style={{ fontSize: 12, cursor: "pointer",
              border: picked.length === 0 ? "1px solid #16232F" : `1px solid ${C.line}`,
              background: picked.length === 0 ? "#16232F" : "#fff", color: picked.length === 0 ? "#fff" : C.dim }}>
            Everybody
          </button>
          {(types || []).map((t) => {
            const on = picked.includes(t.type);
            return (
              <button key={t.type} onClick={() => toggle(t.type)}
                className="rounded px-2.5 py-1 font-semibold" style={{ fontSize: 12, cursor: "pointer",
                  border: on ? "1px solid var(--blue)" : `1px solid ${C.line}`,
                  background: on ? "var(--blue)" : "#fff", color: on ? "#fff" : C.dim }}>
                {t.type} · {t.n - t.hold}{t.hold ? <span style={{ opacity: .75 }}> (+{t.hold} on hold)</span> : null}
              </button>
            );
          })}
          {types === null && <span style={{ fontSize: 12, color: C.faint }}>reading the month…</span>}
        </div>
        {/* NOBODY ON HOLD IS SENT ONE. His slip says he was paid nothing, and
            sending it starts a conversation HR has not had yet. */}
        <div style={{ fontSize: 11.5, color: C.faint, marginTop: 4 }}>
          Nothing ticked means everybody. <b>Anyone on hold is never sent a slip</b>, whatever is chosen.
        </div>
      </div>

      <div className="grid gap-2" style={{ gridTemplateColumns: "1fr 2fr" }}>
        <label style={{ fontSize: 12 }}>Sent through
          <input value={from} onChange={(e) => setFrom(e.target.value)} style={box} />
          <span style={{ color: C.faint, fontSize: 11 }}>This Gmail must be connected in Genie.</span>
        </label>
        <label style={{ fontSize: 12 }}>Subject
          <input value={subject} onChange={(e) => setSubject(e.target.value)} style={box} />
        </label>
      </div>

      <label style={{ fontSize: 12, display: "block", marginTop: 8 }}>The mail
        <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={9} style={{ ...box, fontFamily: "ui-monospace, monospace", fontSize: 11.5 }} />
        <span style={{ color: C.faint, fontSize: 11 }}>
          HTML. Only <b>{"{{first_name}}"}</b>, <b>{"{{name}}"}</b> and <b>{"{{month}}"}</b> fill here — this mail is built from the month&apos;s register, not the HRIS record.
        </span>
      </label>

      <div className="flex gap-2 items-center mt-3">
        <button onClick={check} disabled={busy}
          style={{ background: "#16232F", color: "#fff", border: 0, borderRadius: 6, padding: "6px 14px", fontWeight: 700, fontSize: 13, cursor: busy ? "wait" : "pointer" }}>
          1 · Check it
        </button>
        <button onClick={send} disabled={busy || !chk || !chk.count}
          style={{ background: chk?.count ? "var(--green)" : "#E4E2DC", color: chk?.count ? "#fff" : "#9AA3AC", border: 0, borderRadius: 6, padding: "6px 14px", fontWeight: 700, fontSize: 13, cursor: chk?.count && !busy ? "pointer" : "default" }}>
          2 · Send to {chk?.count ?? 0}
        </button>
        {note && <span style={{ fontSize: 12.5, color: /Done/.test(note) ? "var(--green)" : "#B3392E", fontWeight: 600 }}>{note}</span>}
      </div>

      {prog && (
        <div style={{ marginTop: 9, fontSize: 12.5 }}>
          <b>{prog.done}</b> of {prog.of} · {prog.sent} sent
          {prog.failed.length > 0 && (
            <div style={{ color: "#B3392E", marginTop: 4 }}>
              {prog.failed.length} failed: {prog.failed.slice(0, 6).map((f) => `${f.name} (${f.why})`).join("; ")}
            </div>
          )}
        </div>
      )}

      {chk && (
        <div style={{ marginTop: 10, borderTop: `1px solid ${C.line}`, paddingTop: 9, fontSize: 12.5 }}>
          <div><b>{chk.count}</b> will get their slip for <b>{chk.period}</b>, each at their own personal address.</div>
          {chk.sample.length > 0 && (
            <div style={{ color: C.dim, marginTop: 4 }}>
              For example: {chk.sample.map((s) => `${s.name} → ${s.to}`).join(" · ")}
            </div>
          )}
          {chk.held.length > 0 && (
            <div style={{ marginTop: 6, background: "#F4F2EC", border: `1px solid ${C.line}`, borderRadius: 6, padding: "6px 9px" }}>
              <b>{chk.held.length} on hold — not sent</b>, by the rule, not by oversight:
              <div style={{ color: C.dim, marginTop: 3 }}>{chk.held.map((p) => `${p.id} ${p.name}`).join(" · ")}</div>
            </div>
          )}
          {chk.noPersonal.length > 0 && (
            <div style={{ marginTop: 6, background: "#FDEEEC", border: "1px solid #F0C4BE", borderRadius: 6, padding: "6px 9px" }}>
              {/* NAMED, NOT COUNTED. A payslip that silently goes nowhere is
                  worse than one that fails loudly, and these are people who
                  will ask why they never got theirs. */}
              <b>{chk.noPersonal.length} will get nothing</b> — no personal e-mail on the record, or an address more than one person shares. A slip is never sent to a mailbox someone else can read:
              <div style={{ color: C.dim, marginTop: 3 }}>
                {chk.noPersonal.map((p) => `${p.id} ${p.name}${p.why ? ` — ${p.why}` : ""}`).join(" · ")}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
