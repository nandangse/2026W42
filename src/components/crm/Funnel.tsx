"use client";
/**
 * THE FUNNEL — five stages, one person, one window.
 *
 * Dr Raghu, 30 Sep 2026, against a SALT screenshot: List Building = leads,
 * Account Qualified = company, Contact Verified = e-mail sent or a tick,
 * Nurturing = a reply or an interaction, Opportunity Identified = an
 * opportunity. "Show the names and the person. By default keep it Last 30
 * days."
 *
 * EVERY STAGE OPENS. A funnel of five numbers nobody can open is five
 * numbers nobody believes — and the first question anybody asks of one is
 * "which ones?". So each bar unfolds into the actual names, and each name
 * carries whose it is.
 *
 * THE WIDTH IS THE COUNT, HONESTLY. If a lower stage is wider than the one
 * above it, the bar is drawn wider and the screen says so rather than
 * quietly clamping it. A funnel that cannot widen is a picture that cannot
 * be wrong, and a picture that cannot be wrong is not evidence.
 */
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { NAVY, INK, MUTED, BORDER, ORANGE, GREEN } from "./palette";

type Row = Record<string, unknown>;
type Stage = { key: string; label: string; sub: string; n: number; rows: Row[] };
type Payload = {
  from: string; to: string; who: string; seesAll: boolean; me: string;
  people: string[]; needsMigration?: boolean; stages: Stage[];
};

const iso = (d: Date) => d.toISOString().slice(0, 10);
const daysAgo = (n: number) => iso(new Date(Date.now() - n * 86400000));
const short = (s: unknown) => String(s || "").split("@")[0];
const when = (s: unknown) => (s ? String(s).slice(8, 10) + "-" + String(s).slice(5, 7) : "");

export default function Funnel() {
  const [d, setD] = useState<Payload | null>(null);
  const [err, setErr] = useState("");
  /* Last 30 days, his default. */
  const [from, setFrom] = useState(daysAgo(30));
  const [to, setTo] = useState(iso(new Date()));
  const [who, setWho] = useState("me");
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(() => {
    api.get(`/api/crm/funnel?from=${from}&to=${to}&who=${encodeURIComponent(who)}`)
      .then((r: Payload) => { setD(r); setErr(""); })
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, [from, to, who]);
  useEffect(() => { load(); }, [load]);

  const stages = d?.stages || [];
  const top = Math.max(1, ...stages.map((s) => s.n));

  return (
    <div className="rounded-lg border bg-white p-3" style={{ borderColor: BORDER }}>
      <div className="flex items-baseline gap-2 flex-wrap mb-2">
        <div className="font-bold" style={{ fontSize: 15, color: INK }}>Funnel</div>
        <div className="text-xs" style={{ color: MUTED }}>what entered each stage in the window</div>
        <div className="flex-1" />
        {d?.seesAll && (
          <select value={who} onChange={(e) => setWho(e.target.value)} className="text-xs border rounded px-2 py-1"
            style={{ borderColor: BORDER, color: INK }}>
            <option value="me">Myself</option>
            <option value="">The team — everybody</option>
            {(d.people || []).filter((p) => p !== d.me).map((p) => (
              <option key={p} value={p}>{short(p)}</option>
            ))}
          </select>
        )}
        {[["30 days", 30], ["90 days", 90], ["This year", 270]].map(([l, n]) => (
          <button key={String(l)} onClick={() => { setFrom(daysAgo(Number(n))); setTo(iso(new Date())); }}
            className="text-xs rounded px-2 py-1"
            style={{
              border: `1px solid ${BORDER}`,
              background: from === daysAgo(Number(n)) ? NAVY : "#fff",
              color: from === daysAgo(Number(n)) ? "#fff" : MUTED,
              fontWeight: 600,
            }}>{l}</button>
        ))}
        <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)}
          className="text-xs border rounded px-1.5 py-1" style={{ borderColor: BORDER }} />
        <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)}
          className="text-xs border rounded px-1.5 py-1" style={{ borderColor: BORDER }} />
      </div>

      {err && <div className="text-xs font-bold mb-2" style={{ color: "#B3261E" }}>{err}</div>}
      {d?.needsMigration && (
        <div className="rounded p-2 mb-2 text-xs" style={{ background: "#FFF7E6", color: "#8A5A00", lineHeight: 1.5 }}>
          <b>Contact Verified is not installed yet</b> — run CRM migration <b>0080_funnel.sql</b> and the tick starts counting.
          The other four stages are live.
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        {stages.map((s, i) => {
          const wider = i > 0 && s.n > stages[i - 1].n;
          const w = Math.max(6, Math.round((s.n / top) * 100));
          return (
            <div key={s.key}>
              <button onClick={() => setOpen(open === s.key ? null : s.key)}
                className="w-full flex items-center gap-2 rounded px-2 py-1.5 text-left"
                style={{ background: "#F7F5F0" }}>
                <span style={{ fontSize: 12.5, fontWeight: 600, color: INK, minWidth: 160 }}>{s.label}</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", height: 26, borderRadius: 4, width: `${w}%`,
                    background: wider ? "#B45309" : NAVY, transition: "width .2s" }} />
                </span>
                <b className="tnum" style={{ fontSize: 17, color: wider ? "#B45309" : NAVY, minWidth: 70, textAlign: "right" }}>
                  {s.n.toLocaleString("en-IN")}
                </b>
                <span style={{ color: MUTED, fontSize: 11 }}>{open === s.key ? "▲" : "▼"}</span>
              </button>
              <div style={{ fontSize: 10.5, color: MUTED, padding: "1px 2px 0 10px" }}>
                {s.sub}
                {/* SAID, NOT HIDDEN. A stage wider than the one above it is a
                    real finding about the data, not a drawing error. */}
                {wider && <span style={{ color: "#B45309", fontWeight: 700 }}> · wider than the stage above it</span>}
              </div>

              {open === s.key && (
                <div className="rounded border mt-1" style={{ borderColor: BORDER }}>
                  {s.rows.length === 0 && <div className="text-xs p-2" style={{ color: MUTED }}>Nothing in this window.</div>}
                  {s.rows.map((r, k) => (
                    <div key={k} className="flex items-baseline gap-2 px-2 py-1"
                      style={{ borderTop: k ? `1px solid ${BORDER}` : "none", fontSize: 12 }}>
                      <span style={{ flex: 1, color: INK, minWidth: 0 }}>
                        {String(r.full_name || r.name || r.person_name || "—")}
                        {r.primary_email ? <span style={{ color: MUTED }}> · {String(r.primary_email)}</span> : null}
                        {r.remark ? <span style={{ color: MUTED }}> · {String(r.remark).slice(0, 60)}</span> : null}
                      </span>
                      {/* whose it is — his instruction, and the point of a
                          funnel somebody is answerable for */}
                      <span style={{ color: GREEN, fontWeight: 600, fontSize: 11 }}>
                        {short(r.assigned_to || r.verified_by || r.created_by_email || r.created_by)}
                      </span>
                      <span className="tnum" style={{ color: MUTED, fontSize: 11 }}>
                        {when(r.verified_at || r.happened_at || r.updated_at || r.created_at)}
                      </span>
                    </div>
                  ))}
                  {s.rows.length >= 12 && s.n > 12 && (
                    <div className="text-xs px-2 py-1" style={{ color: MUTED, borderTop: `1px solid ${BORDER}` }}>
                      the most recent 12 of {s.n.toLocaleString("en-IN")}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="text-xs mt-2" style={{ color: MUTED, lineHeight: 1.5 }}>
        Counted on what <b>entered</b> each stage between {from} and {to} — not on what exists.
        Across the whole CRM the same five stages come to 255,215 / 62,056 / 15,509 / 74,303 / 53,771,
        which is twenty years of imported history rather than a pipeline.
      </div>
    </div>
  );
}

/**
 * THE TICK, wherever a contact is shown.
 *
 * Dr Raghu, 30 Sep 2026: "make the verified contact tick available."
 *
 * It records WHO and WHEN, not a bare true. "Verified" with nobody's name
 * against it is a claim; with a name it is work somebody did and can be
 * asked about. Un-ticking clears the name too — a verification whose
 * evidence has been withdrawn must not keep somebody's name on it.
 */
export function VerifyTick({ id, at, by, how, onDone }: {
  id: string; at?: string | null; by?: string | null; how?: string | null; onDone?: () => void;
}) {
  const [on, setOn] = useState(!!at);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [who, setWho] = useState(by || "");
  return (
    <span className="inline-flex items-center gap-1" title={on ? `Verified${who ? ` by ${short(who)}` : ""}${at ? ` on ${when(at)}` : ""}${how ? ` · ${how}` : ""}` : "Nobody has confirmed this contact is real"}>
      <label className="inline-flex items-center gap-1" style={{ cursor: busy ? "default" : "pointer", fontSize: 11.5, color: on ? GREEN : MUTED }}>
        <input type="checkbox" checked={on} disabled={busy}
          onChange={async (e) => {
            const next = e.target.checked;
            setBusy(true); setErr("");
            try {
              await api.post("/api/crm/funnel", { id, on: next, how: "ticked" });
              setOn(next); setWho(next ? "you" : "");
              onDone?.();
            } catch (x) { setErr(x instanceof Error ? x.message : String(x)); }
            setBusy(false);
          }} />
        <b>{on ? "Verified" : "Verify"}</b>
        {on && who && <span style={{ color: MUTED, fontWeight: 400 }}>· {short(who)}</span>}
      </label>
      {err && <span style={{ color: "#B3261E", fontSize: 10.5 }}>{err}</span>}
    </span>
  );
}
