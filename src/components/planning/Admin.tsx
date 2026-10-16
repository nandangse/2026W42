"use client";
// split out of PlanningSuite.tsx (Genie 5.0.1.1) — one file per tab, loaded when opened
import React, { useCallback, useEffect, useMemo, useState } from "react";

import { api } from "@/lib/api";

import { LOGO } from "@/lib/logo";
import { GenieUsagePanel, ConsultRaghuPanel } from "../ConsultRaghu";
import { APP_VERSION } from "@/lib/version";
import type { UpdateEntry, Effort } from "@/lib/changelog";
import SoftwareDescription from "../SoftwareDescription";

import UsersApp from "../UsersApp";
import { TRADES, zeroCrew, type Crew } from "@/lib/templates";
import { fmtFull, initials } from "@/lib/schedule";

import { AdminUser, Board, ErpLogEntry, OWNER_EMAIL, TODAY, asHuman, templateMilestones } from "./shared";
import { CrewCell } from "./MyWeek";
import AgentRules from "./AgentRules";

// ============================ Update to ERP ============================
/**
 * ERP Update — the corrections still to be put back into the ERP.
 *
 * Genie is downstream: tomorrow's Jobmaster redraws the board, so a value
 * corrected here undoes itself overnight unless somebody applies it upstream
 * too. This is that list, and it survives the browser tab — which the old
 * session-only change log did not, so a day's corrections died with it.
 *
 * The JOB ID leads every line, because the job of this page is to be pasted
 * over a spreadsheet and uploaded, not read.
 */
/** The monthly delivered targets — Cr value and Cr throughput a month —
 *  read by the Delivered Jobs run-rate box. Stored in settings (0102). */
export function MonthlyTargetsCard() {
  const [f, setF] = useState({ value_cr: "", tp_cr: "", nos: "" });
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api.get("/api/app-settings").then((r) => {
      const t = (r.delivered_targets || {}) as { value_cr?: number; tp_cr?: number; nos?: number };
      setF({ value_cr: String(t.value_cr ?? 10), tp_cr: String(t.tp_cr ?? 4), nos: t.nos ? String(t.nos) : "" });
    }).catch(() => setF({ value_cr: "10", tp_cr: "4", nos: "" }));
  }, []);
  const save = async () => {
    setBusy(true); setMsg("");
    try {
      await api.post("/api/app-settings", { delivered_targets: { value_cr: Number(f.value_cr), tp_cr: Number(f.tp_cr), ...(Number(f.nos) ? { nos: Number(f.nos) } : {}) } });
      setMsg("Saved ✓ — the run-rate box follows");
    } catch (e) {
      const t = e instanceof Error ? e.message : String(e);
      setMsg(/delivered_targets|does not exist|schema cache/i.test(t) ? "Run migration 0102 first — the column has nowhere to live yet." : t);
    }
    setBusy(false);
  };
  return (
    <div className="bg-white rounded-lg border p-3 mt-3" style={{ borderColor: "var(--line)" }}>
      <div className="text-xs font-bold mb-1" style={{ color: "var(--muted)", letterSpacing: 1.1 }}>MONTHLY DELIVERED TARGETS</div>
      <div className="text-xs mb-2" style={{ color: "var(--muted)" }}>What Delivered Jobs&apos; RUN RATE · TARGET · REQUIRED box measures against — crores per month.</div>
      <div className="flex items-end gap-3 flex-wrap">
        <label className="text-xs font-semibold" style={{ color: "var(--muted)" }}>Value (₹ Cr / month)
          <input value={f.value_cr} inputMode="decimal" onChange={(e) => setF({ ...f, value_cr: e.target.value.replace(/[^0-9.]/g, "") })}
            className="block mt-1 text-sm border rounded px-2 py-1.5 tnum" style={{ borderColor: "var(--line)", width: 120 }} />
        </label>
        <label className="text-xs font-semibold" style={{ color: "var(--muted)" }}>Throughput (₹ Cr / month)
          <input value={f.tp_cr} inputMode="decimal" onChange={(e) => setF({ ...f, tp_cr: e.target.value.replace(/[^0-9.]/g, "") })}
            className="block mt-1 text-sm border rounded px-2 py-1.5 tnum" style={{ borderColor: "var(--line)", width: 120 }} />
        </label>
        <label className="text-xs font-semibold" style={{ color: "var(--muted)" }}>Jobs (nos / month · optional)
          <input value={f.nos} inputMode="numeric" onChange={(e) => setF({ ...f, nos: e.target.value.replace(/[^0-9]/g, "") })}
            className="block mt-1 text-sm border rounded px-2 py-1.5 tnum" style={{ borderColor: "var(--line)", width: 120 }} placeholder="—" />
        </label>
        <button onClick={save} disabled={busy || !Number(f.value_cr) || !Number(f.tp_cr)}
          className="text-xs font-bold rounded px-3 py-1.5 text-white" style={{ background: "var(--accent)", opacity: busy ? 0.5 : 1 }}>
          {busy ? "Saving…" : "Save"}
        </button>
        {msg && <span className="text-xs font-semibold" style={{ color: msg.includes("✓") ? "var(--green)" : "var(--red)" }}>{msg}</span>}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   WHAT COMES DOWN FROM THE ERP EVERY HOUR

   Dr Raghu, 16 Sep 2026: "i want hourly refresh with nandanerp" — then
   twelve documents named one after another — "also in all these decisions
   the later one wins!!!" and "tick the documents which will refresh here".

   Until now the answer lived in three crons across two databases and could
   only be had by reading the source. It is a list now, on the screen, and
   what is on is on.

   THE FOUR THAT CANNOT BE TICKED SAY SO RATHER THAN PRETENDING. Items, BOMs,
   purchase orders and GRNs are still brought in by hand from Saamaan; a tick
   that did nothing would be worse than no tick at all, which is the same
   lesson as Delivered and Replied on the campaign screen.
   ══════════════════════════════════════════════════════════════════════ */
type HourlyDoc = { key: string; label: string; doctype: string; carrier: string; where: string; hourly: boolean; on: boolean; group?: string };
type WatchLine = { doctype: string; checked: number; missing: number; thin: number; missingNames: string[]; thinNames: string[]; error?: string };
type Watch = { syncAt: string | null; pullAt: string | null; watch: { at: string; window: string; ok: boolean; lines: WatchLine[]; error?: string } | null; incomplete: Record<string, { count: number; names: string[] }> | null; pullFailed: number; pullHealed: number; pullError: string | null };

/** DID IT ALL ARRIVE? — the sync watch, from the ERP's side (7 Oct 2026). */
function SyncWatch({ w }: { w: Watch | null }) {
  if (!w) return null;
  const lines = w.watch?.lines ?? [];
  const bad = lines.some((l) => l.missing || l.thin || l.error) || !!w.pullFailed || !!(w.incomplete && Object.keys(w.incomplete).length) || !!w.watch?.error;
  const at = (s: string | null) => (s ? new Date(s).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "·");
  return (
    <div className="px-3 py-2" style={{ borderTop: "1px solid var(--line)", background: bad ? "#FDECEC" : "#EEF7F0" }}>
      <div className="flex items-baseline gap-2 flex-wrap">
        <span className="text-xs font-bold" style={{ color: bad ? "var(--red)" : "#1E6B3E", letterSpacing: 1.2 }}>{bad ? "SOMETHING DID NOT ARRIVE" : "EVERYTHING ARRIVED, WHOLE"}</span>
        <span className="text-xs" style={{ color: "var(--muted)" }}>checked at {at(w.syncAt)} · what the ERP changed in the last two days, made more than two hours ago · opportunities, customers, contacts, quotations</span>
      </div>
      <div className="flex gap-3 flex-wrap mt-1">
        {lines.map((l) => (
          <span key={l.doctype} className="text-xs" style={{ color: l.missing || l.thin || l.error ? "var(--red)" : "var(--ink)" }}>
            <b>{l.doctype}</b> {l.error ? `— ${l.error}` : <>{l.checked} checked{l.missing ? ` · ${l.missing} missing (${l.missingNames.slice(0, 3).join(", ")}${l.missing > 3 ? "…" : ""})` : ""}{l.thin ? ` · ${l.thin} thin (${l.thinNames.slice(0, 3).join(", ")}${l.thin > 3 ? "…" : ""})` : ""}{!l.missing && !l.thin ? " · all here" : ""}</>}
          </span>
        ))}
        {w.watch?.error && <span className="text-xs" style={{ color: "var(--red)" }}>the watch itself failed: {w.watch.error}</span>}
        {w.incomplete && Object.entries(w.incomplete).map(([d, x]) => <span key={d} className="text-xs" style={{ color: "var(--red)" }}><b>{d}</b> · {x.count} refused as incomplete ({x.names.join(", ")})</span>)}
        {(w.pullFailed || w.pullHealed) ? <span className="text-xs" style={{ color: w.pullFailed ? "var(--red)" : "var(--ink)" }}><b>Opportunity pull</b> at {at(w.pullAt)}{w.pullHealed ? ` · ${w.pullHealed} healed` : ""}{w.pullFailed ? ` · ${w.pullFailed} refused — ${w.pullError || ""}` : ""}</span> : null}
      </div>
    </div>
  );
}

function HourlyFromErp() {
  const [docs, setDocs] = useState<HourlyDoc[] | null>(null);
  const [winner, setWinner] = useState("latest");
  const [note, setNote] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState("");
  const [pullMsg, setPullMsg] = useState("");
  /** The hourly pass, run by hand. Same route, same order, same rules. */
  const pullNow = async () => {
    if (!window.confirm("Run the ERP pass now?\n\nIt pushes what is waiting, then brings down everything ticked above. It can take a minute or two.")) return;
    setBusy("pull"); setPullMsg("Running — push first, then the pull…");
    try {
      const r = await api.get("/api/cron/erp-sync") as {
        ok?: boolean; note?: string; notes?: string[];
        push?: { pushed?: number; rejected?: number; notInErp?: number };
        pull?: {
          jobs?: { read?: number; changed?: number }; projects?: { read?: number; changed?: number };
          delivered?: { read?: number; changed?: number }; seconds?: number;
        };
        pushFailed?: unknown;
      };
      /* READ WHERE THE ANSWER ACTUALLY IS. The counts come back nested under
         push and pull; reading them off the top level produced a bare
         "Done." that said nothing at all — which is how a button that half
         works looks exactly like one that works. */
      /* Each count is an object — read, written, changed — not a number.
         Printing it whole gave "[object Object] job(s)", which is the same
         silence as "Done." wearing a different coat. What a reader wants is
         how many were LOOKED at and how many actually MOVED. */
      const say = (o: { read?: number; changed?: number } | undefined, what: string) =>
        o?.read == null ? "" : `${o.read} ${what}${o.changed ? ` (${o.changed} changed)` : ""}`;
      const bits = [
        say(r.pull?.jobs, "job(s)"),
        say(r.pull?.projects, "project(s)"),
        say(r.pull?.delivered, "delivered"),
        r.push?.pushed != null ? `pushed ${r.push.pushed}` : "",
        r.push?.rejected ? `rejected ${r.push.rejected}` : "",
        r.pull?.seconds != null ? `in ${r.pull.seconds}s` : "",
      ].filter(Boolean).join(" · ");
      /* Every note the pass returns is shown — including the one that says a
         field name could not be found, which is the whole reason somebody
         presses this button today. */
      const notes = [r.note, ...(r.notes || [])].filter(Boolean).join(" · ");
      setPullMsg(`${r.ok === false || r.pushFailed ? "!" : ""}${bits || "The pass ran and reported no counts."}${notes ? ` — ${notes}` : ""}`);
      load();
    } catch (e) {
      /**
       * A DEAD CONNECTION IS NOT A FAILED PASS.
       *
       * The pull takes half a minute or more, and a request that long dies
       * for reasons that have nothing to do with the ERP — a deploy swapping
       * the function underneath it, a phone changing network, a proxy giving
       * up. The browser reports "Failed to fetch", and on 30 September it
       * said exactly that twice while the server had in fact finished both
       * passes and moved a job from Painting to Final Inspection.
       *
       * Telling somebody the opposite of what happened is worse than telling
       * them nothing: he presses it again, and again, against work that is
       * already done. So when the fetch itself dies rather than the route
       * answering, the ledger is asked what actually ran.
       */
      const said = e instanceof Error ? e.message : String(e);
      const dropped = /failed to fetch|networkerror|load failed|network request failed|aborted/i.test(said);
      if (dropped) {
        setPullMsg("The connection dropped — asking Genie what actually ran…");
        try {
          const j = await api.get("/api/erp-hourly") as { lastRun?: { at: string; ok: boolean; error: string; summary: string } };
          const r = j.lastRun;
          if (r && Date.now() - Date.parse(r.at) < 15 * 60 * 1000) {
            setPullMsg(r.ok
              ? `The connection dropped, but the pass DID run — ${r.summary}. Nothing is stuck; there is no need to press it again.`
              : `!The pass ran and failed: ${r.error || "no reason recorded"}.`);
            load();
            setBusy("");
            return;
          }
          setPullMsg(`!${said} — and no pass is recorded in the last fifteen minutes, so it did not start. Try again.`);
        } catch {
          setPullMsg(`!${said} — and Genie could not be reached either, so the network is the problem, not the ERP.`);
        }
      } else {
        setPullMsg("!" + said);
      }
    }
    setBusy("");
  };


  const [watch, setWatch] = useState<Watch | null>(null);
  const load = useCallback(() => api.get("/api/erp-hourly")
    .then((r) => { const j = r as { docs?: HourlyDoc[]; winner?: string; note?: string; watch?: Watch | null };
      setDocs(j.docs || []); setWinner(j.winner || "latest"); setNote(j.note || ""); setWatch(j.watch ?? null); setErr(""); })
    .catch((e) => setErr(e instanceof Error ? e.message : String(e))), []);
  useEffect(() => { load(); }, [load]);

  const flip = async (d: HourlyDoc) => {
    setBusy(d.key); setErr("");
    try { await api.post("/api/erp-hourly", { key: d.key, on: !d.on }); await load(); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    setBusy("");
  };
  const setWin = async (w: string) => {
    setBusy("winner"); setErr("");
    try { await api.post("/api/erp-hourly", { action: "winner", winner: w }); setWinner(w); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    setBusy("");
  };

  const byCarrier: Record<string, string> = { "erp-sync": "on the hour, :05", "crm-sync": "on the hour, :30", saamaan: "by hand" };

  return (
    <div className="rounded border mb-4" style={{ borderColor: "var(--line)", background: "#FBFAF7" }}>
      <div className="px-3 py-2" style={{ borderBottom: "1px solid var(--line)" }}>
        <div className="text-xs font-bold" style={{ color: "var(--muted)", letterSpacing: 1.4 }}>FROM NANDANERP, EVERY HOUR</div>
        <div className="text-sm" style={{ color: "var(--muted)", marginTop: 2 }}>
          Tick what should come down. Untick and the next pass leaves it alone.
        </div>
      </div>

      {err && <div className="px-3 py-2 text-xs font-semibold" style={{ color: "var(--red)" }}>{err}</div>}
      {note && <div className="px-3 py-2 text-xs" style={{ background: "#FDF8EC", color: "#7A5B00" }}>{note}</div>}

      <div className="p-2" style={{ display: "grid", gap: 6, gridTemplateColumns: "repeat(auto-fill, minmax(232px, 1fr))" }}>
        {(docs || []).map((d) => (
          <label key={d.key} title={d.hourly ? `${d.doctype} → ${d.where}` : `${d.doctype} — pulled by hand from Saamaan; nothing brings it down on the hour yet`}
            className="flex items-start gap-2 rounded border px-2 py-1.5"
            style={{ borderColor: "var(--line)", background: d.hourly ? "#fff" : "#F6F5F2", cursor: d.hourly ? "pointer" : "not-allowed", opacity: d.hourly ? 1 : .72 }}>
            <input type="checkbox" checked={d.on} disabled={!d.hourly || busy === d.key} onChange={() => flip(d)} style={{ marginTop: 3 }} />
            <span style={{ minWidth: 0 }}>
              <span className="text-sm font-semibold" style={{ color: "var(--navy)" }}>{d.label}</span>
              <div style={{ fontSize: 11, color: "var(--muted)", lineHeight: 1.45 }}>
                {d.doctype} → {d.where}
                <br />{d.hourly ? byCarrier[d.carrier] : <span style={{ color: "#8A5B00" }}>by hand, in Saamaan — not on the hour yet</span>}
                {d.group === "planning" && <><br /><span style={{ color: "var(--muted)" }}>one pull with jobs &amp; projects</span></>}
              </div>
            </span>
          </label>
        ))}
        {!docs && <div className="text-xs" style={{ color: "var(--muted)" }}>reading…</div>}
      </div>

      <SyncWatch w={watch} />

      {/* THE RULE UNDER ALL OF IT. It is what makes a pull safe over an
          unpushed Genie edit — and therefore what lets the pull carry on
          when the push is broken. */}
      <div className="px-3 py-2 flex items-center gap-2 flex-wrap" style={{ borderTop: "1px solid var(--line)" }}>
        <span className="text-xs font-bold" style={{ color: "var(--muted)" }}>WHEN THEY DISAGREE</span>
        {[["latest", "the later edit wins"], ["erp", "the ERP always wins"], ["genie", "Genie always wins"]].map(([k, label]) => (
          <button key={k} onClick={() => setWin(k)} disabled={busy === "winner"}
            className="text-xs font-bold rounded px-2 py-1"
            style={{ background: winner === k ? "var(--navy)" : "#fff", color: winner === k ? "#fff" : "var(--navy)", border: "1px solid var(--line)" }}>
            {label}
          </button>
        ))}
        <span className="text-xs" style={{ color: "var(--muted)" }}>
          Later-wins is why a pull can never trample a change made here after the ERP&rsquo;s own.
        </span>
      </div>

      {/**
        * PULL IT NOW (Dr Raghu, 29 Sep 2026: "i want to do it now").
        *
        * This screen could push corrections up and could say what the hourly
        * pull WOULD bring down — and had no way to bring it down. Waiting
        * until :05 to see whether a field maps is a slow way to find out it
        * does not.
        *
        * It runs the same route the cron runs, in the same order: push
        * first, then pull. It is not a second code path that might behave
        * differently from the nightly one — that is the only way a "run it
        * now" button stays trustworthy.
        */}
      <div className="px-3 py-2 flex items-center gap-2 flex-wrap" style={{ borderTop: "1px solid var(--line)" }}>
        <button onClick={pullNow} disabled={busy === "pull"} className="text-xs font-bold rounded px-3 py-1.5 text-white"
          style={{ background: busy === "pull" ? "var(--muted)" : "var(--accent)" }}>
          {busy === "pull" ? "Running…" : "⇣ Pull from the ERP now"}
        </button>
        <span className="text-xs" style={{ color: "var(--muted)" }}>
          The same pass the hour runs — pushes what is waiting, then brings down what is ticked.
        </span>
        {pullMsg && (
          <div className="text-xs w-full" style={{ color: pullMsg.startsWith("!") ? "var(--red)" : "var(--ink)", lineHeight: 1.5, marginTop: 2 }}>
            {pullMsg.replace(/^!/, "")}
          </div>
        )}
      </div>
    </div>
  );
}

export function UpdateToErp({ erpLog, canPush }: { erpLog: ErpLogEntry[]; canPush?: boolean }) {
  const [rows, setRows] = useState<{ id: string; job_id: string; field: string; label: string; old_value: string | null; new_value: string | null; changed_by: string | null; changed_at: string; push_status?: string | null; push_error?: string | null; pushed_by?: string | null; pushed_at?: string | null }[] | null>(null);
  const [installed, setInstalled] = useState(true);
  const [busy, setBusy] = useState(false);
  // the fate filter (Dr Raghu, 29 Aug 2026): waiting · pushed · rejected · all
  const [scope, setScope] = useState<"waiting" | "pushed" | "rejected" | "cancelled" | "all">("waiting");
  const [pushMsg, setPushMsg] = useState("");
  // ticked lines can leave the queue as CANCELLED (Dr Raghu, 30 Aug 2026)
  const [sel, setSel] = useState<Set<string>>(new Set());
  useEffect(() => setSel(new Set()), [scope]);
  const cancelSel = async () => {
    if (!sel.size || !window.confirm(`Cancel ${sel.size} correction${sel.size === 1 ? "" : "s"}? They will not be pushed — the record stays, marked cancelled.`)) return;
    setBusy(true);
    try { await api.post("/api/erp-update", { action: "cancel", ids: [...sel] }); setSel(new Set()); load(); }
    catch (e) { setPushMsg(e instanceof Error ? e.message : String(e)); }
    setBusy(false);
  };

  const load = useCallback(() => {
    api.get(`/api/erp-update?scope=${scope}`)
      .then((r) => { setInstalled(r.installed !== false); setRows(r.rows || []); })
      .catch(() => setRows([]));
  }, [scope]);
  useEffect(() => { load(); }, [load]);

  const pushNow = async () => {
    if (!window.confirm(`Push all waiting corrections to the ERP now?\n\nOne write per job; each line records its fate.`)) return;
    setBusy(true); setPushMsg("Pushing to the ERP…");
    try {
      const r = await api.post("/api/erp-update", { action: "push" });
      setPushMsg(`Pushed ${r.pushed ?? 0} · rejected ${r.rejected ?? 0} · not in ERP ${r.notInErp ?? 0}${r.note ? ` — ${r.note}` : ""}`);
      load();
    } catch (e) { setPushMsg(e instanceof Error ? e.message : String(e)); }
    setBusy(false);
  };

  /** One line per correction, job id first. Excel opens it, the ERP takes it. */
  const download = () => {
    if (!rows?.length) return;
    const esc = (v: unknown) => {
      const t = String(v ?? "");
      return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
    };
    const csv = [
      ["Job ID", "Field", "New value", "Was", "Changed by", "Changed at"].join(","),
      ...rows.map((r) => [r.job_id, r.label, r.new_value, r.old_value, r.changed_by, new Date(String(r.changed_at)).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) + " IST"].map(esc).join(",")),
    ].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `erp-update-${TODAY}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const markDone = async () => {
    if (!window.confirm(`Mark all ${rows?.length} lines as applied in the ERP?\n\nThey leave this list. Nothing is deleted — the record of what was corrected stays.`)) return;
    setBusy(true);
    try { await api.post("/api/erp-update", { action: "exported" }); load(); }
    finally { setBusy(false); }
  };

  return (
    <div className="p-4">
      <HourlyFromErp />
      <div className="flex items-center gap-2 flex-wrap mb-3">
        <div>
          <div className="text-xs font-bold" style={{ color: "var(--muted)", letterSpacing: 1.4 }}>UPDATE TO ERP</div>
          <div className="text-lg font-bold" style={{ color: "var(--navy)", lineHeight: 1.2 }}>
            Corrections waiting to go back
          </div>
        </div>
        <div className="flex-1" style={{ minWidth: 10 }} />
        {canPush && scope === "waiting" && sel.size > 0 && (
          <button onClick={cancelSel} disabled={busy} className="text-xs font-bold rounded px-3 py-1.5"
            style={{ background: "#fff", border: "1px solid #B3261E", color: "var(--red)", opacity: busy ? 0.5 : 1 }}
            title="The ticked lines leave the queue as cancelled — never pushed, never deleted">
            🗑 Cancel selected · {sel.size}
          </button>
        )}
        {canPush && scope === "waiting" && !!rows?.length && (
          <button onClick={pushNow} disabled={busy} className="text-xs font-bold rounded px-3 py-1.5 text-white"
            style={{ background: busy ? "#B9BEC4" : "#7C3AED" }}
            title="Writes every waiting correction into the ERP through the API — one write per job, each line records its fate">
            ⬆ Push to ERP · {rows.length}
          </button>
        )}
        {!!rows?.length && scope === "waiting" && (
          <>
            <button onClick={download} className="text-xs font-bold rounded px-3 py-1.5" style={{ background: "var(--accent)", color: "#fff" }}>
              ⬇ Download CSV · {rows.length}
            </button>
            <button onClick={markDone} disabled={busy} className="text-xs font-bold rounded px-3 py-1.5"
              style={{ background: "#fff", border: "1px solid #0D7A3F", color: "var(--green)", opacity: busy ? 0.5 : 1 }}>
              ✓ Mark all applied
            </button>
          </>
        )}
      </div>

      {pushMsg && <div className="text-xs font-bold mb-2" style={{ color: /reject|not in ERP [1-9]|refused|failed/i.test(pushMsg) ? "var(--red)" : "var(--green)" }}>{pushMsg}</div>}

      <div className="flex gap-1 mb-2">
        {(["waiting", "pushed", "rejected", "cancelled", "all"] as const).map((k) => (
          <button key={k} onClick={() => setScope(k)} className="rounded-full border px-3 py-1 text-xs font-bold"
            style={scope === k ? { background: "var(--ink)", color: "#fff", borderColor: "var(--ink)" } : { color: "var(--muted)", borderColor: "var(--line)", background: "#fff" }}>
            {k === "waiting" ? "Waiting" : k === "pushed" ? "Pushed" : k === "rejected" ? "Rejected" : k === "cancelled" ? "Cancelled" : "All"}
          </button>
        ))}
      </div>

      {!installed && (
        <div className="rounded p-3 mb-3 text-sm" style={{ background: "#FFF7E6", border: "1px solid #F0D9A8", color: "#8A5A00" }}>
          Run <code>supabase/migrations/0031_erp_update_queue.sql</code> and corrections will start collecting here.
        </div>
      )}

      <div className="text-xs mb-2" style={{ color: "var(--muted)", lineHeight: 1.5 }}>
        Everything corrected in Genie that the ERP does not know about yet. The job id leads each line so a row can be
        found and overwritten. One line per job and field — editing the same field twice before an export leaves the
        latest value, not two changes to apply in order.
      </div>

      {rows && rows.length === 0 ? (
        <div className="bg-white rounded-lg border p-8 text-center text-sm" style={{ borderColor: "var(--line)", color: "var(--muted)" }}>
          {scope === "waiting" ? "Nothing waiting. Everything corrected in Genie has been put back into the ERP." : `Nothing ${scope === "all" ? "recorded yet" : scope}.`}
        </div>
      ) : (
        <div className="bg-white rounded-lg border overflow-x-auto" style={{ borderColor: "var(--line)" }}>
          <table className="text-xs w-full genie-table" style={{ borderCollapse: "collapse", minWidth: 720 }}>
            <thead>
              <tr style={{ background: "var(--ink)", color: "#fff" }}>
                {canPush && scope === "waiting" && (
                  <th className="px-2 py-1.5">
                    <input type="checkbox" title="Tick all"
                      checked={!!rows?.length && sel.size === rows.length}
                      onChange={(e) => setSel(e.target.checked ? new Set((rows || []).map((r) => r.id)) : new Set())} />
                  </th>
                )}
                <th className="px-2 py-1.5 text-left">Job ID</th>
                <th className="px-2 py-1.5 text-left">Field</th>
                <th className="px-2 py-1.5 text-left">New value</th>
                <th className="px-2 py-1.5 text-left">Was</th>
                <th className="px-2 py-1.5 text-left">By</th>
                <th className="px-2 py-1.5 text-left">When</th>
                <th className="px-2 py-1.5 text-left">Fate</th>
              </tr>
            </thead>
            <tbody>
              {(rows || []).map((r) => (
                <tr key={r.id} style={{ borderTop: "1px solid #EEECE6" }}>
                  {canPush && scope === "waiting" && (
                    <td className="px-2 py-1 text-center">
                      <input type="checkbox" checked={sel.has(r.id)}
                        onChange={(e) => setSel((s) => { const n = new Set(s); if (e.target.checked) n.add(r.id); else n.delete(r.id); return n; })} />
                    </td>
                  )}
                  <td className="px-2 py-1 font-bold tnum" style={{ color: "var(--blue)" }}>{r.job_id}</td>
                  <td className="px-2 py-1" style={{ color: "var(--dim)" }}>{r.label}</td>
                  {/* DATES READ THE INDIAN WAY HERE TOO (Dr Raghu, 2 Sep
                      2026: "check the date formats"). The queue stores ISO,
                      which is right for the ERP and wrong for a person: every
                      other date in Genie is dd-mm-yyyy, and one screen
                      speaking differently is where 09-05 gets read as May.
                      Only values that ARE dates are turned around — a
                      percentage or a sentence passes through untouched. */}
                  <td className="px-2 py-1 font-semibold tnum" style={{ color: "var(--navy)", maxWidth: 280 }}>{r.new_value ? asHuman(r.new_value) : <i style={{ color: "#B8B5AC" }}>(cleared)</i>}</td>
                  <td className="px-2 py-1 tnum" style={{ color: "#B8B5AC", maxWidth: 220 }}>{r.old_value ? asHuman(r.old_value) : "—"}</td>
                  <td className="px-2 py-1" style={{ color: "var(--muted)" }}>{r.changed_by}</td>
                  <td className="px-2 py-1 tnum" style={{ color: "var(--muted)" }} title="IST">{new Date(String(r.changed_at)).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: true })}</td>
                  <td className="px-2 py-1">
                    {r.push_status === "pushed" ? (
                      <span className="rounded px-1.5 font-bold" style={{ background: "#E6F4EB", color: "var(--green)", fontSize: 10.5 }} title={`by ${r.pushed_by ?? ""} · ${r.pushed_at ? new Date(String(r.pushed_at)).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : ""}`}>pushed</span>
                    ) : r.push_status === "cancelled" ? (
                      <span className="rounded px-1.5 font-bold" style={{ background: "var(--line-soft)", color: "var(--dim)", fontSize: 10.5 }} title={r.push_error ?? ""}>cancelled</span>
                    ) : r.push_status ? (
                      <span className="rounded px-1.5 font-bold" style={{ background: "#FBEAE8", color: "var(--red)", fontSize: 10.5 }} title={r.push_error ?? ""}>{r.push_status === "not_in_erp" ? "not in ERP" : "rejected"}</span>
                    ) : (
                      <span style={{ color: "#B8B5AC", fontSize: 10.5 }}>waiting</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {erpLog.length > 0 && (
        <div className="text-xs mt-3" style={{ color: "#B8B5AC" }}>
          {erpLog.length} change{erpLog.length === 1 ? "" : "s"} made in this browser session are included above.
        </div>
      )}
    </div>
  );
}

// ============================ Admin ============================
export type AdminTab = "users" | "org" | "milestones" | "setup" | "report" | "updates" | "software" | "agent" | "genie" | "consult";

/**
 * The Name column stays put while the rest scrolls. With department,
 * designation, last login and the access columns the table is now wider than
 * any screen, and a row of settings with no name attached is unreadable.
 */
export const STICKY_NAME = {
  position: "sticky" as const,
  left: 0,
  background: "#fff",
  zIndex: 2,
  boxShadow: "1px 0 0 #EEECE6",
};

/**
 * The org chart, drawn from `reports_to` — nobody maintains it.
 *
 * That is the whole point: an org chart kept as a separate document is wrong
 * within a month, because the day somebody changes who they report to, nobody
 * remembers to redraw it. This one IS the reporting column, so it cannot
 * disagree with the thing the boards, Tasking and Team Goals already use.
 *
 * Two failures it shows rather than hides:
 *
 *   ORPHANS. Anybody with no manager set is listed at the top as a root. If
 *   that list is long, the chart is not a chart yet, and the page says so
 *   instead of drawing fifteen separate trees and looking finished.
 *
 *   CYCLES. A reports to B, B reports to A — a mis-click in the row above.
 *   Every person is drawn once, so a cycle stops rather than spinning, and the
 *   people caught in it are named.
 */
export function OrgChart({ users, departments }: { users: AdminUser[] | null; departments: { id: string; name: string }[] }) {
  const [deptFilter, setDeptFilter] = useState("");
  if (!users) return <div className="p-4 text-sm" style={{ color: "var(--muted)" }}>Loading people…</div>;

  const live = users.filter((u) => !u.disabled);
  const byId = new Map(live.map((u) => [u.id, u]));
  const deptName = (id: string | null) => (id ? departments.find((d) => d.id === id)?.name ?? null : null);

  const kids = new Map<string, AdminUser[]>();
  const roots: AdminUser[] = [];
  for (const u of live) {
    const mgr = u.reports_to && byId.has(u.reports_to) && u.reports_to !== u.id ? u.reports_to : null;
    if (mgr) (kids.get(mgr) ?? kids.set(mgr, []).get(mgr)!).push(u);
    else roots.push(u);
  }
  for (const list of kids.values()) list.sort((a, b) => (a.display_name || a.email).localeCompare(b.display_name || b.email));
  roots.sort((a, b) => (a.display_name || a.email).localeCompare(b.display_name || b.email));

  // every person drawn once — a cycle terminates instead of recursing forever
  const drawn = new Set<string>();
  const countBelow = (id: string, seen = new Set<string>()): number => {
    if (seen.has(id)) return 0;
    seen.add(id);
    return (kids.get(id) || []).reduce((s, k) => s + 1 + countBelow(k.id, seen), 0);
  };

  const match = (u: AdminUser) => !deptFilter || u.department_id === deptFilter;

  const Node = ({ u, depth }: { u: AdminUser; depth: number }) => {
    if (drawn.has(u.id)) return null;
    drawn.add(u.id);
    const below = kids.get(u.id) || [];
    const dept = deptName(u.department_id);
    const dim = deptFilter && !match(u);
    return (
      <div style={{ marginLeft: depth ? 18 : 0, borderLeft: depth ? "1px solid #E2E0DA" : undefined, paddingLeft: depth ? 10 : 0 }}>
        <div className="flex items-center gap-2 flex-wrap py-1" style={{ opacity: dim ? 0.35 : 1 }}>
          <span className="font-bold rounded px-1.5 text-xs" style={{ background: "#DCE8F5", color: "var(--blue)" }}>
            {u.initials || (u.display_name || u.email).slice(0, 2).toUpperCase()}
          </span>
          <span className="font-semibold text-sm" style={{ color: "var(--navy)" }}>{u.display_name || u.email.split("@")[0]}</span>
          {u.designation && <span className="text-xs" style={{ color: "var(--dim)" }}>{u.designation}</span>}
          {dept && <span className="text-xs rounded px-1.5" style={{ background: "#F4F2EC", color: "var(--dim)" }}>{dept}</span>}
          <span className="text-xs" style={{ color: "#B8B5AC" }}>{u.role}</span>
          {below.length > 0 && (
            <span className="text-xs tnum" style={{ color: "var(--muted)" }} title="Everyone below them, all the way down">
              {below.length} direct · {countBelow(u.id)} in all
            </span>
          )}
        </div>
        {below.map((k) => <Node key={k.id} u={k} depth={depth + 1} />)}
      </div>
    );
  };

  const realRoots = roots.filter((r) => (kids.get(r.id) || []).length > 0);
  const loose = roots.filter((r) => (kids.get(r.id) || []).length === 0);

  return (
    <div className="bg-white rounded-lg border p-3" style={{ borderColor: "var(--line)" }}>
      <div className="flex items-center gap-2 flex-wrap mb-2">
        <div className="font-bold text-sm">
          Org chart{" "}
          <span className="font-normal text-xs" style={{ color: "var(--muted)" }}>
            — drawn from “Reports to” on the Users tab. Change it there and this redraws itself.
          </span>
        </div>
        <div className="flex-1" style={{ minWidth: 10 }} />
        <select value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)}
          className="text-xs border rounded px-2 py-1 bg-white font-semibold" style={{ borderColor: "var(--line)" }}>
          <option value="">Highlight: all departments</option>
          {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
      </div>

      {live.length === 0 && <div className="text-sm" style={{ color: "var(--muted)" }}>No active accounts.</div>}

      {realRoots.map((r) => (
        <div key={r.id} className="mb-2 pb-2" style={{ borderBottom: "1px solid #EFEDE7" }}>
          <Node u={r} depth={0} />
        </div>
      ))}

      {loose.length > 0 && (
        <div className="rounded p-2.5 mt-2" style={{ background: "#FFF7E6", border: "1px solid #F0D9A8" }}>
          <div className="text-xs font-bold mb-1" style={{ color: "#8A5A00" }}>
            {loose.length} account{loose.length === 1 ? "" : "s"} with nobody above and nobody below
          </div>
          <div className="text-xs" style={{ color: "var(--dim)", lineHeight: 1.5 }}>
            {loose.map((u) => u.display_name || u.email.split("@")[0]).join(", ")}.
            {" "}Set <b>Reports to</b> on the Users tab and they join the chart. Until then the chart is a partial
            picture, which is worth knowing before anybody reads it as the whole one.
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * The image quotes, read straight out of a Drive folder.
 *
 * Sync is a button rather than a schedule: the folder changes when somebody
 * adds a picture to it, which is not often, and a nightly job that silently
 * fails is worse than a button that says what it found.
 */
export function ImageQuotesPanel() {
  const [d, setD] = useState<{ installed: boolean; folder: string | null; images: { id: string; url: string; src: string | null; active: boolean }[] } | null>(null);
  const [folder, setFolder] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const load = useCallback(() => {
    api.get("/api/image-quote").then((r) => { setD(r); setFolder(r.folder || ""); }).catch(() => setD(null));
  }, []);
  useEffect(() => { load(); }, [load]);

  const sync = async () => {
    setBusy(true); setMsg("");
    try {
      const r = await api.post("/api/image-quote", { action: "sync", folder: folder || undefined });
      setMsg(r.ok
        ? `Read ${r.found} file${r.found === 1 ? "" : "s"} · ${r.added} new · ${r.retired} no longer in the folder`
        : r.error || "Nothing came back");
      load();
    } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  if (!d) return null;
  const live = d.images.filter((i) => i.active);

  return (
    <div className="bg-white rounded-lg border p-3" style={{ borderColor: "var(--line)" }}>
      <div className="font-bold text-sm mb-2">
        Image quotes{" "}
        <span className="font-normal text-xs" style={{ color: "var(--muted)" }}>
          — one shown on My Week each day, the same one for everybody
        </span>
      </div>
      {!d.installed ? (
        <div className="text-xs" style={{ color: "var(--warn)" }}>Run migration 0029 first.</div>
      ) : (
        <>
          <div className="flex gap-2 flex-wrap items-end">
            <div style={{ flex: "1 1 320px" }}>
              <div className="text-xs font-semibold mb-1" style={{ color: "var(--muted)" }}>Google Drive folder (link or id)</div>
              <input value={folder} onChange={(e) => setFolder(e.target.value)}
                className="w-full text-xs border rounded px-2 py-1.5" style={{ borderColor: "var(--line)" }}
                placeholder="https://drive.google.com/drive/folders/…" />
            </div>
            <button onClick={sync} disabled={busy} className="text-xs font-bold rounded px-3 py-1.5"
              style={{ background: "var(--accent)", color: "#fff", opacity: busy ? 0.5 : 1 }}>
              {busy ? "Reading Drive…" : "↻ Sync from Drive"}
            </button>
            <span className="text-xs" style={{ color: "var(--muted)" }}>{live.length} live of {d.images.length}</span>
          </div>
          {msg && <div className="text-xs mt-1.5 font-semibold" style={{ color: msg.includes("Read") ? "var(--green)" : "var(--red)" }}>{msg}</div>}
          <div className="text-xs mt-1" style={{ color: "#B8B5AC", lineHeight: 1.5 }}>
            The folder must be shared <b>anyone with the link</b>. Genie caches what it finds, so a bad day at Google
            leaves yesterday&apos;s pictures working rather than an empty panel.
          </div>
          {live.length > 0 && (
            <div className="flex gap-1 flex-wrap mt-2" style={{ maxHeight: 150, overflowY: "auto" }}>
              {live.slice(0, 60).map((i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={i.id} src={i.src || ""} alt="" style={{ width: 54, height: 40, objectFit: "cover", borderRadius: 3, border: "1px solid #E2E0DA" }} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/**
 * The review deck — eight pages, built from the boards at the moment it is
 * asked for.
 *
 * There is no stored copy and no "last generated" date on purpose. A deck kept
 * on a shelf goes stale silently, and a stale deck presented as current is
 * worse than none; this one is rebuilt on every press and carries the date it
 * was run on its first page.
 *
 * The PDF comes from the browser's own Save as PDF rather than a renderer on
 * the server. That is not a shortcut around a missing library — it is the only
 * way the page that is checked on screen and the page that comes out of the
 * printer are the same page.
 */
export function ReportPanel() {
  const open = (print: boolean) =>
    window.open(`/api/deck${print ? "?print=1" : ""}`, "_blank", "noopener");

  const ON_IT = [
    ["The year", "anticipated sales and throughput against the FY target"],
    ["Since 1 April", "delivered month by month, under the run rate now required"],
    ["The order book", "every job by delivery month, and where the book stops"],
    ["By product", "the families, ordered by what they actually earn"],
    ["Kitting vs production", "what is nearly out, and what is bought and not moving"],
    ["Closest to going out", "the jobs at the line, and the tasks still open on them"],
    ["A closer look", "one family — Hi Lifts — job by job, with who is waiting"],
    ["Escalations", "how many, at what level, and what the jobs themselves say"],
  ];

  return (
    <div className="space-y-3">
      <div className="bg-white rounded-lg border p-4" style={{ borderColor: "var(--line)" }}>
        <div className="font-bold text-sm">
          Review deck{" "}
          <span className="font-normal text-xs" style={{ color: "var(--muted)" }}>
            — eight pages, 16:9, built live from the boards
          </span>
        </div>
        <p className="text-xs mt-1 mb-3" style={{ color: "var(--dim)", maxWidth: "44rem", lineHeight: 1.6 }}>
          Every figure on it is queried when you press the button — nothing is typed in and nothing is
          cached, so the deck cannot drift from the boards. It carries the date it was run on the first
          page. <b>Download PDF</b> opens the deck and goes straight to your browser&apos;s print dialog;
          choose <b>Save as PDF</b> and <b>Paper size: 13.33 × 7.5in</b> if it is offered, or leave the
          default — the page already sets it.
        </p>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => open(true)}
            className="px-4 py-2 rounded text-sm font-bold text-white"
            style={{ background: "var(--accent)" }}
          >
            ⬇ Download PDF
          </button>
          <button
            onClick={() => open(false)}
            className="px-4 py-2 rounded text-sm font-semibold border"
            style={{ borderColor: "var(--line)", color: "var(--ink)" }}
          >
            👁 Open on screen
          </button>
          <a
            href="/api/deck?format=json"
            target="_blank"
            rel="noreferrer"
            className="px-4 py-2 rounded text-sm font-semibold border"
            style={{ borderColor: "var(--line)", color: "var(--dim)" }}
          >
            {"{ }"} The figures behind it
          </a>
        </div>
      </div>

      <div className="bg-white rounded-lg border p-4" style={{ borderColor: "var(--line)" }}>
        <div className="font-bold text-sm mb-2">What is on it</div>
        <div className="space-y-1">
          {ON_IT.map(([t, d]) => (
            <div key={t} className="text-xs flex gap-2" style={{ color: "var(--dim)", lineHeight: 1.7 }}>
              <b style={{ color: "var(--ink)", width: "11rem", flexShrink: 0 }}>{t}</b>
              <span>{d}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * LC / Stratcom / Management, as three boxes in one cell.
 *
 * Read-only for everyone but the owner, and shown rather than hidden to the
 * rest: who is in the room is not a secret, and a column that appears only for
 * one person is a column nobody else can ask about.
 */
export function AdminTabs({ tab, setTab, owner }: { tab: AdminTab; setTab: (t: AdminTab) => void; owner?: boolean }) {
  return (
    <div className="flex gap-1 rounded p-1 bg-white border flex-wrap" style={{ borderColor: "var(--line)", width: "fit-content" }}>
      {([["updates", "🗒 Updates"], ["users", "👥 Users"], ["org", "🧬 Org Chart"], ["milestones", "🏁 Milestones"], ["setup", "⚙ Settings"], ["report", "📊 Report"], ["software", "📘 Software description"], ["agent", "🔌 Agent rules"],
        // the owner's two rooms (Dr Raghu, 30 Aug 2026): usage + the knowledgebase
        ...(owner ? [["genie", "🧞 Genie"], ["consult", "🎓 Consult Dr Raghu"]] as const : [])] as readonly (readonly [AdminTab, string])[]).map(([k, l]) => (
        <button
          key={k}
          onClick={() => setTab(k)}
          className="px-3 py-1 rounded text-sm font-semibold"
          style={tab === k ? { background: "var(--ink)", color: "#fff" } : { color: "var(--dim)" }}
        >
          {l}
        </button>
      ))}
    </div>
  );
}

/**
 * THE LOG IS WRITTEN WITH EMPHASIS, SO IT HAS TO BE READ WITH EMPHASIS.
 *
 * Every entry since the log began carries <b>, <i> and <code> around the
 * part that matters — and React renders a string as a string, so the page
 * printed the tags: "<b>One colour per month</b>". Nine hundred lines of
 * release notes reading like view-source.
 *
 * The fix is a reader, not dangerouslySetInnerHTML. The log is ours, but it
 * is also the one place in Genie where prose is stored and re-displayed, and
 * a whitelist of three tags costs fifteen lines and cannot ever render
 * anything but bold, italic and monospace.
 */
const RICH = /<(b|i|code)>([\s\S]*?)<\/\1>/g;
function Rich({ text }: { text: string }) {
  const out: React.ReactNode[] = [];
  let at = 0;
  for (const m of text.matchAll(RICH)) {
    if (m.index! > at) out.push(text.slice(at, m.index));
    const inner = <Rich text={m[2]} />;
    out.push(
      m[1] === "b" ? <b key={m.index} style={{ color: "var(--ink)" }}>{inner}</b>
      : m[1] === "i" ? <i key={m.index}>{inner}</i>
      : <code key={m.index} className="tnum" style={{ background: "#F1EFE9", borderRadius: 3, padding: "0 3px", fontSize: "92%" }}>{inner}</code>,
    );
    at = m.index! + m[0].length;
  }
  if (at < text.length) out.push(text.slice(at));
  return <>{out}</>;
}

/**
 * The release log. Reads src/lib/changelog.ts, so the version badge in the
 * header and this page can never disagree — they are the same list.
 */
export function Updates() {
  // The log is fetched, not bundled: it is read on this one screen and
  // weighed 536 KB on every other (Genie 5.0.0.1).
  const [log, setLog] = useState<{ updates: UpdateEntry[]; effort: Effort } | null>(null);
  useEffect(() => {
    api.get("/api/updates").then(setLog).catch(() => setLog({ updates: [], effort: { measuredTo: "", commits: 0, days: 0, windowHours: 0, raghuLow: 0, raghuHigh: 0 } }));
  }, []);
  if (!log) return <div className="text-sm p-3" style={{ color: "var(--muted)" }}>Loading the release log…</div>;
  const { updates: UPDATES, effort: EFFORT } = log;
  return (
    <div className="bg-white rounded-lg border p-3" style={{ borderColor: "var(--line)" }}>
      <div className="flex items-baseline justify-between flex-wrap gap-2 mb-1">
        <div className="font-bold text-sm">What&apos;s changed in Genie</div>
        {/* THE BADGE AND THE LOG CAN DISAGREE, AND THE PAGE SHOULD SAY SO.
            The version is compiled into the browser's bundle; the log is
            fetched. A tab left open across a deploy therefore shows an old
            number beside a newer top entry, which reads like a bug in the
            numbering rather than a page that wants reloading. */}
        <div className="text-xs" style={{ color: "var(--muted)" }}>
          Running version <b style={{ color: "var(--accent)" }}>{APP_VERSION}</b> · {UPDATES.length} release{UPDATES.length === 1 ? "" : "s"} logged
          {UPDATES[0] && UPDATES[0].v !== APP_VERSION && (
            <> · <b style={{ color: "var(--accent)" }}>{UPDATES[0].v} has shipped</b> — reload this page</>
          )}
        </div>
      </div>
      {/* What it has cost, in time. Measured from the commit history rather
          than remembered — and shown with its working, because a number like
          this gets repeated without it. */}
      <div className="rounded px-3 py-2.5 mb-2" style={{ background: "var(--navy)", color: "#fff" }}>
        <div className="text-xs font-bold" style={{ letterSpacing: 1.2, color: "#8FA1B3" }}>TIME INVESTED · TO {fmtFull(EFFORT.measuredTo).toUpperCase()}</div>
        <div className="flex gap-6 flex-wrap items-baseline mt-1">
          <div>
            <div className="tnum font-bold" style={{ fontSize: 26, color: "var(--amber)", lineHeight: 1.1 }}>{EFFORT.raghuLow}–{EFFORT.raghuHigh} h</div>
            <div className="text-xs" style={{ color: "#9FB0C0" }}>Dr Raghu — specifying and reviewing</div>
          </div>
          <div>
            <div className="tnum font-bold" style={{ fontSize: 20, color: "#fff", lineHeight: 1.2 }}>{EFFORT.windowHours} h</div>
            <div className="text-xs" style={{ color: "#9FB0C0" }}>build window across {EFFORT.days} days</div>
          </div>
          <div>
            <div className="tnum font-bold" style={{ fontSize: 20, color: "#fff", lineHeight: 1.2 }}>{EFFORT.commits}</div>
            <div className="text-xs" style={{ color: "#9FB0C0" }}>commits · {UPDATES.length} releases</div>
          </div>
        </div>
        <div className="text-xs mt-2" style={{ color: "#6B7C8C", lineHeight: 1.5, maxWidth: "72ch" }}>
          The window is the sum, over every day worked, of the span between that day&apos;s first and last commit.
          It over-counts where the middle of a day went elsewhere, and under-counts the thinking that happens
          before the first commit — so Dr Raghu&apos;s own time is given as a range rather than a figure that
          would look measured and would not be.
        </div>
      </div>

      <div className="rounded px-2 py-1.5 mb-3 text-xs" style={{ background: "#F4F2EC", color: "var(--dim)" }}>
        <b>How the number works</b> — <span className="tnum">MAJOR.MINOR.BATCH.PATCH</span>. The last digit moves for
        every change inside one module; the third moves when several modules change together or on the first release of
        a new day; the second (2.6 → 2.7) marks a major change or a new week.
      </div>
      {UPDATES.map((u) => (
        <div key={u.v} className="py-2.5" style={{ borderTop: "1px solid #EFEDE7" }}>
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-xs font-bold rounded px-1.5 py-0.5 tnum" style={{ background: "var(--accent)", color: "#fff" }}>V {u.v}</span>
            <span className="text-sm font-bold" style={{ color: "var(--navy)" }}>{u.module}</span>
            <span className="text-xs tnum" style={{ color: "var(--muted)" }}>{fmtFull(u.date)}</span>
          </div>
          <ul className="mt-1" style={{ listStyle: "disc", paddingLeft: 20 }}>
            {u.items.map((it, i) => (
              <li key={i} className="text-sm" style={{ color: "var(--dim)", lineHeight: 1.5 }}><Rich text={it} /></li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

export function Admin({
  board, reload, users, loadUsers, departments, isOwner, meEmail, usersMeta, appSettings, loadAppSettings,
}: {
  departments: { id: string; name: string }[];
  board: Board; reload: () => Promise<Board | null>; users: AdminUser[] | null; loadUsers: () => Promise<void>; isOwner: boolean;
  meEmail: string; usersMeta: { mayEdit: boolean; editors: string[] };
  appSettings: { app_name: string; theme_name: string }; loadAppSettings: () => void;
}) {

  // ---- app identity: logo (fixed), app name + theme name (editable) ----
  const [idForm, setIdForm] = useState({ app_name: appSettings.app_name, theme_name: appSettings.theme_name });
  useEffect(() => { setIdForm({ app_name: appSettings.app_name, theme_name: appSettings.theme_name }); }, [appSettings]);
  const [idMsg, setIdMsg] = useState("");
  const [idBusy, setIdBusy] = useState(false);
  const idDirty = idForm.app_name !== appSettings.app_name || idForm.theme_name !== appSettings.theme_name;
  const saveIdentity = async () => {
    if (!idForm.app_name.trim() || !idForm.theme_name.trim()) return;
    setIdBusy(true);
    setIdMsg("");
    try {
      await api.post("/api/app-settings", { app_name: idForm.app_name, theme_name: idForm.theme_name });
      loadAppSettings();
      setIdMsg("Saved ✓");
    } catch (e) { setIdMsg(e instanceof Error ? e.message : String(e)); }
    finally { setIdBusy(false); }
  };

  // ---- FY targets: owner-only, the numbers the Required Run Rate is measured
  // against. Typed in crore because that is how they are set and spoken about;
  // stored in rupees like every other value in the suite, so nothing downstream
  // has to know about the unit.
  const CR = 10000000;
  const [tgt, setTgt] = useState<{ fy: string; sales: string; throughput: string; loaded: boolean; hasTarget: boolean; installed: boolean; updatedBy: string | null }>(
    { fy: "", sales: "", throughput: "", loaded: false, hasTarget: false, installed: true, updatedBy: null },
  );
  const [tgtMsg, setTgtMsg] = useState("");
  const [tBusy, setTBusy] = useState(false);
  const loadTargets = useCallback(async () => {
    try {
      const r = await api.get("/api/run-rate");
      setTgt({
        fy: r.fy || "",
        sales: r.installed && r.hasTarget ? String(r.targets.sales / CR) : "",
        throughput: r.installed && r.hasTarget ? String(r.targets.throughput / CR) : "",
        loaded: true,
        hasTarget: !!r.hasTarget,
        installed: !!r.installed,
        updatedBy: r.updatedBy ?? null,
      });
    } catch { setTgt((t) => ({ ...t, loaded: true, installed: false })); }
  }, []);
  useEffect(() => { loadTargets(); }, [loadTargets]);
  const saveTargets = async () => {
    const s = Number(tgt.sales), t = Number(tgt.throughput);
    if (!Number.isFinite(s) || !Number.isFinite(t) || s < 0 || t < 0) {
      setTgtMsg("Both targets must be a number of crore, zero or more.");
      return;
    }
    setTBusy(true); setTgtMsg("");
    try {
      await api.post("/api/run-rate", { fy: tgt.fy, sales_target: s * CR, throughput_target: t * CR });
      await loadTargets();
      setTgtMsg("Saved ✓ — the Required Run Rate on both boards now reads against this.");
    } catch (e) { setTgtMsg(e instanceof Error ? e.message : String(e)); }
    finally { setTBusy(false); }
  };

  // ---- goals access ----
  type GoalAccessRow = {
    id: string; email: string; initials: string | null; name: string | null;
    role: string; disabled: boolean; level: "none" | "view" | "edit";
    implicit: boolean; isOwner: boolean; locked: boolean; ownsNodes: number;
  };
  const [gaRows, setGaRows] = useState<GoalAccessRow[] | null>(null);
  const [gaMsg, setGaMsg] = useState("");
  const loadAccess = useCallback(() => {
    api.get("/api/admin/goal-access").then((r) => setGaRows(r.users)).catch(() => setGaRows([]));
  }, []);
  useEffect(() => { loadAccess(); }, [loadAccess]);
  const setAccess = async (id: string, level: string, who: string) => {
    setGaMsg("");
    try {
      await api.post("/api/admin/goal-access", { person_id: id, level });
      setGaMsg(`${who} → ${level === "none" ? "no goals access" : level === "view" ? "can view the goal tree" : "can edit the goal tree"} ✓`);
      loadAccess();
    } catch (e) { setGaMsg(e instanceof Error ? e.message : String(e)); }
  };

  // ---- goal categories (swimlanes) — any admin may manage these ----
  type Swimlane = { id: string; name: string; color: string; sort_order: number; nodeCount: number };
  const [lanes, setLanes] = useState<Swimlane[] | null>(null);
  const [laneMsg, setLaneMsg] = useState("");
  const [newLaneName, setNewLaneName] = useState("");
  const loadLanes = useCallback(() => {
    api.get("/api/admin/swimlanes").then((r) => setLanes(r.swimlanes)).catch(() => setLanes([]));
  }, []);
  useEffect(() => { loadLanes(); }, [loadLanes]);
  const addLane = async () => {
    const name = newLaneName.trim();
    if (!name) return;
    setLaneMsg("");
    try { await api.post("/api/admin/swimlanes", { action: "create", name }); setNewLaneName(""); loadLanes(); }
    catch (e) { setLaneMsg(e instanceof Error ? e.message : String(e)); }
  };
  const saveLane = async (id: string, patch: { name?: string; color?: string }) => {
    setLaneMsg("");
    try { await api.post("/api/admin/swimlanes", { action: "update", id, ...patch }); loadLanes(); }
    catch (e) { setLaneMsg(e instanceof Error ? e.message : String(e)); }
  };
  const removeLane = async (l: Swimlane) => {
    if (l.nodeCount) { alert(`"${l.name}" is used by ${l.nodeCount} goal item${l.nodeCount === 1 ? "" : "s"} — move them to another category first.`); return; }
    if (!window.confirm(`Delete the "${l.name}" category?`)) return;
    setLaneMsg("");
    try { await api.post("/api/admin/swimlanes", { action: "delete", id: l.id }); loadLanes(); }
    catch (e) { setLaneMsg(e instanceof Error ? e.message : String(e)); }
  };

  // ---- family milestone template editor ----
  type TRow = { name: string; days: number; preds: number[]; crew: Crew; shift: string; offset: number };
  const famList = useMemo(() => Object.keys(board.templates).sort(), [board.templates]);
  const [fam, setFam] = useState<string>("");
  const [rows, setRows] = useState<TRow[] | null>(null);
  const [newFam, setNewFam] = useState("");
  const [tMsg, setTMsg] = useState("");
  const loadFam = (f: string) => { setFam(f); setRows(templateMilestones(f, board.templates) as TRow[]); setTMsg(""); };
  useEffect(() => {
    if (fam || !famList.length) return;
    const f = famList[0];
    setFam(f);
    setRows(templateMilestones(f, board.templates) as TRow[]);
  }, [fam, famList, board.templates]);

  const setRow = (i: number, patch: Partial<TRow>) => setRows((rs) => rs!.map((r, k) => (k === i ? { ...r, ...patch } : r)));
  const setRowCrew = (i: number, key: keyof Crew, v: number) => setRows((rs) => rs!.map((r, k) => (k === i ? { ...r, crew: { ...r.crew, [key]: v } } : r)));
  const addRow = () => setRows((rs) => [...(rs || []), { name: `Milestone ${(rs?.length || 0) + 1}`, days: 3, preds: rs && rs.length ? [rs.length] : [], crew: zeroCrew(), shift: "D", offset: 0 }]);
  const delRow = (i: number) => setRows((rs) => rs!.filter((_, k) => k !== i).map((r) => ({ ...r, preds: r.preds.filter((p) => p !== i + 1).map((p) => (p > i + 1 ? p - 1 : p)) })));
  const parsePreds = (s: string, i: number) => s.split(/[ ,]+/).map((n) => parseInt(n, 10)).filter((n) => n > 0 && n <= i);
  const createFam = () => {
    const f = newFam.trim();
    if (!f) return;
    setFam(f);
    setRows(templateMilestones(f, board.templates) as TRow[]);
    setNewFam("");
    setTMsg(`New product family "${f}" — adjust the milestones below, then Save template.`);
  };
  const saveTemplate = async () => {
    if (!rows || !fam.trim()) return;
    const clean = rows.map((r, i) => ({ name: r.name.trim() || `Milestone ${i + 1}`, days: Math.max(1, Number(r.days) || 1), preds: r.preds.filter((p) => p > 0 && p <= i), crew: r.crew, shift: r.shift || "D", offset: Number(r.offset) || 0 }));
    try {
      await api.post("/api/templates", { family: fam.trim(), milestones: clean });
      await reload();
      setTMsg(`Saved ✓ — every "${fam}" job without a saved plan now defaults to these milestones.`);
    } catch (e) { setTMsg(e instanceof Error ? e.message : String(e)); }
  };

  // ---- admin sub-tabs: the setup pages, and the release log ----
  // Admin opens on Updates first, then Users (Dr Raghu, 30 Aug 2026)
  const [adminTab, setAdminTab] = useState<AdminTab>("updates");
  // Goals access is folded away behind a toggle on the Users tab. It is the
  // only place a grant can be revoked, so it is hidden rather than removed —
  // a page nobody can reach is a permission nobody can take back.
  const [showGoalsAccess, setShowGoalsAccess] = useState(false);

  if (adminTab === "updates") {
    return (
      <div className="p-4 space-y-4">
        <AdminTabs tab={adminTab} setTab={setAdminTab} owner={isOwner} />
        <Updates />
      </div>
    );
  }

  // the owner's two rooms — the tabs never render for anyone else, and the
  // APIs behind them answer only the owner
  if (adminTab === "genie" && isOwner) {
    return (
      <div className="p-4 space-y-4">
        <AdminTabs tab={adminTab} setTab={setAdminTab} owner={isOwner} />
        <GenieUsagePanel />
      </div>
    );
  }
  if (adminTab === "consult" && isOwner) {
    return (
      <div className="p-4 space-y-4">
        <AdminTabs tab={adminTab} setTab={setAdminTab} owner={isOwner} />
        <ConsultRaghuPanel />
      </div>
    );
  }

  // Agent rules (Dr Raghu, 16 Oct 2026): what Genie-through-Perisclaw and
  // every other agent key must obey — admins set them, Genie enforces them.
  if (adminTab === "agent") {
    return (
      <div className="p-4 space-y-4">
        <AdminTabs tab={adminTab} setTab={setAdminTab} owner={isOwner} />
        <AgentRules />
      </div>
    );
  }

  // The software description is a document, not a settings panel — it returns
  // on its own for the same reason Updates does: the other tabs stack cards
  // into a shared column and this one owns the width.
  if (adminTab === "software") {
    return (
      <div className="p-4 space-y-4">
        <AdminTabs tab={adminTab} setTab={setAdminTab} owner={isOwner} />
        <SoftwareDescription />
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      <AdminTabs tab={adminTab} setTab={setAdminTab} owner={isOwner} />
      {adminTab === "setup" && <LabourRatesCard />}

      {adminTab === "setup" && <ImageQuotesPanel />}

      {adminTab === "setup" && (<>
      {/* ---- app identity ---- */}
      <div className="bg-white rounded-lg border p-3" style={{ borderColor: "var(--line)" }}>
        <div className="font-bold text-sm mb-2">App identity <span className="font-normal text-xs" style={{ color: "var(--muted)" }}>— the name and theme line shown next to the logo, header-wide</span></div>
        <div className="flex gap-4 flex-wrap items-end">
          <div>
            <div className="text-xs font-semibold mb-1" style={{ color: "var(--muted)" }}>Logo</div>
            <div className="rounded px-2 py-1 inline-block" style={{ background: "var(--navy)" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={LOGO} alt="Nandan GSE" style={{ height: 28 }} />
            </div>
          </div>
          <div>
            <div className="text-xs font-semibold mb-1" style={{ color: "var(--muted)" }}>Name of app</div>
            <input value={idForm.app_name} onChange={(e) => setIdForm({ ...idForm, app_name: e.target.value })} className="text-xs border rounded px-2 py-1.5" style={{ borderColor: "var(--line)", width: 160 }} />
          </div>
          <div>
            <div className="text-xs font-semibold mb-1" style={{ color: "var(--muted)" }}>Theme name</div>
            <input value={idForm.theme_name} onChange={(e) => setIdForm({ ...idForm, theme_name: e.target.value })} className="text-xs border rounded px-2 py-1.5" style={{ borderColor: "var(--line)", width: 260 }} />
          </div>
          <button onClick={saveIdentity} disabled={!idDirty || idBusy} className="text-xs font-bold rounded px-3 py-1.5" style={{ background: "var(--accent)", color: "#fff", opacity: !idDirty || idBusy ? 0.5 : 1 }}>
            {idBusy ? "Saving…" : "Save"}
          </button>
          {idMsg && <span className="text-xs font-semibold" style={{ color: idMsg.includes("✓") ? "var(--green)" : "var(--red)" }}>{idMsg}</span>}
        </div>
      </div>

      {/* ---- monthly delivered targets (Dr Raghu, 30 Aug 2026): the numbers
          the Delivered Jobs run-rate box measures against ---- */}
      <MonthlyTargetsCard />
      </>)}

      {adminTab === "setup" && (<>
      {/* ---- financial-year targets ----
          Shown to every admin, editable by the owner alone. A target the board
          can quietly edit is not a target; a target nobody can find is not one
          either, so the others see it and see who set it. */}
      {tgt.loaded && (
        <div className="bg-white rounded-lg border p-3" style={{ borderColor: "var(--line)" }}>
          <div className="font-bold text-sm mb-2">
            Targets{" "}
            <span className="font-normal text-xs" style={{ color: "var(--muted)" }}>
              — what the Required Run Rate on the Job Delivery Board and Delivered Jobs is measured against
            </span>
          </div>
          {/* The year first, then its numbers. A target with no year on it is
              the thing that gets carried forward by accident. */}
          <div className="rounded px-2.5 py-1.5 mb-2 inline-block" style={{ background: "var(--navy)" }}>
            <div style={{ fontSize: 10, color: "#8FA1B3", letterSpacing: 1.2 }}>FINANCIAL YEAR</div>
            <div className="font-bold tnum" style={{ fontSize: 17, color: "var(--amber)", lineHeight: 1.2 }}>
              {tgt.fy || "—"}
            </div>
          </div>
          {!tgt.installed ? (
            <div className="text-xs" style={{ color: "var(--warn)", lineHeight: 1.6 }}>
              Run <code style={{ background: "#F4F2EC", padding: "1px 5px", borderRadius: 3 }}>supabase/migrations/0025_fy_targets.sql</code>{" "}
              in the Supabase SQL editor, then reload. Until then the run-rate card stays hidden rather than showing a
              target of zero.
            </div>
          ) : (
            <>
              <div className="flex gap-4 flex-wrap items-end">
                <div>
                  <div className="text-xs font-semibold mb-1" style={{ color: "var(--muted)" }}>Sales target (₹ Cr)</div>
                  <input value={tgt.sales} onChange={(e) => setTgt({ ...tgt, sales: e.target.value })} disabled={!isOwner}
                    inputMode="decimal" className="text-xs border rounded px-2 py-1.5 tnum text-right"
                    style={{ borderColor: "var(--line)", width: 110, background: isOwner ? "#fff" : "#F4F2EC" }} />
                </div>
                <div>
                  <div className="text-xs font-semibold mb-1" style={{ color: "var(--muted)" }}>Throughput target (₹ Cr)</div>
                  <input value={tgt.throughput} onChange={(e) => setTgt({ ...tgt, throughput: e.target.value })} disabled={!isOwner}
                    inputMode="decimal" className="text-xs border rounded px-2 py-1.5 tnum text-right"
                    style={{ borderColor: "var(--line)", width: 110, background: isOwner ? "#fff" : "#F4F2EC" }} />
                </div>
                {isOwner && (
                  <button onClick={saveTargets} disabled={tBusy} className="text-xs font-bold rounded px-3 py-1.5"
                    style={{ background: "var(--accent)", color: "#fff", opacity: tBusy ? 0.5 : 1 }}>
                    {tBusy ? "Saving…" : "Save targets"}
                  </button>
                )}
                {tgtMsg && <span className="text-xs font-semibold" style={{ color: tgtMsg.includes("✓") ? "var(--green)" : "var(--red)" }}>{tgtMsg}</span>}
              </div>
              <div className="text-xs mt-2" style={{ color: "var(--muted)", lineHeight: 1.55 }}>
                {!tgt.hasTarget
                  ? `No target is set for ${tgt.fy} yet. The run-rate card says so on both boards rather than carrying last year's number forward.`
                  : <>Whole-year targets, measured against what has actually been <b>delivered</b> since 1 April — a job counts on the day it goes out of the door, not the day it is promised.</>}
                {" "}
                {isOwner
                  ? "You are the only account that can change these."
                  : <>Only <b>{OWNER_EMAIL}</b> can change these{tgt.updatedBy ? <>; last set by <b>{tgt.updatedBy}</b></> : null}.</>}
              </div>
            </>
          )}
        </div>
      )}
      </>)}

      {/* ── who can open the two apps that are not Genie ── */}
      {adminTab === "users" && (
        <UsersApp users={users} departments={departments} loadUsers={loadUsers}
          canEdit={usersMeta.mayEdit} isOwner={isOwner} ownerEmail={OWNER_EMAIL} meEmail={meEmail.toLowerCase()}
          editors={usersMeta.editors} unlinkedOwners={board.unlinkedOwners || []} />
      )}

      {adminTab === "users" && (
        <button onClick={() => setShowGoalsAccess((v) => !v)} className="text-xs font-bold rounded px-3 py-1.5"
          style={{ background: "#fff", border: "1px solid #E2E0DA", color: "var(--dim)" }}>
          {showGoalsAccess ? "▲ Hide goals access" : "▼ Goals access — who can open the goal tree"}
        </button>
      )}
      {adminTab === "users" && showGoalsAccess && (<>
      {/* ---- goals access ---- */}
      <div className="bg-white rounded-lg border p-3" style={{ borderColor: "var(--line)" }}>
        <div className="font-bold text-sm mb-1">
          🎯 Goals access <span className="font-normal text-xs" style={{ color: "var(--muted)" }}>— who can open the goal tree</span>
        </div>
        <div className="text-xs mb-3 rounded p-2" style={{ background: "#F4F2EC", color: "var(--dim)", lineHeight: 1.5 }}>
          Access is <b>granted, not automatic</b>. Someone with <b>no access</b> still sees the goal work assigned to
          them on <b>My Week</b> — seeing the tree and seeing your own work are separate checks, so removing access
          never hides a person&apos;s own to-do list.
        </div>
        {gaMsg && (
          <div className="text-xs font-semibold mb-2" style={{ color: gaMsg.includes("✓") ? "var(--green)" : "var(--red)" }}>{gaMsg}</div>
        )}
        <div className="overflow-x-auto">
          <table className="text-xs w-full genie-table" style={{ minWidth: 560 }}>
            <thead>
              <tr style={{ color: "var(--muted)" }}>
                <th className="text-left py-1 font-semibold">Person</th>
                <th className="text-left py-1 font-semibold">Role</th>
                <th className="text-center py-1 font-semibold" title="How many goal nodes they own">Owns</th>
                <th className="text-left py-1 font-semibold">Goals access</th>
              </tr>
            </thead>
            <tbody>
              {gaRows === null && [0, 1, 2].map((i) => (
                <tr key={"g" + i} style={{ borderTop: "1px solid #EEECE6" }}>
                  <td className="py-2" colSpan={4}><div className="rounded" style={{ height: 12, width: `${55 - i * 8}%`, background: "var(--line-soft)" }} /></td>
                </tr>
              ))}
              {(gaRows ?? []).filter((u) => !u.disabled).map((u) => (
                <tr key={u.id} style={{ borderTop: "1px solid #EEECE6" }}>
                  <td className="py-1.5">
                    {u.initials && <span className="font-bold rounded px-1 mr-1" style={{ background: "#DCE8F5", color: "var(--blue)" }}>{u.initials}</span>}
                    {u.name || u.email.split("@")[0]}
                  </td>
                  <td className="py-1.5" style={{ color: "var(--muted)" }}>{u.role.replace("_", " ")}</td>
                  <td className="py-1.5 text-center tnum" style={{ color: u.ownsNodes ? "var(--blue)" : "#B8B5AC" }}>{u.ownsNodes || "—"}</td>
                  <td className="py-1.5">
                    {u.isOwner ? (
                      <span className="rounded px-2 py-0.5 font-semibold" style={{ background: "#FFF3E8", color: "var(--accent)" }} title="The owner always has full access and cannot be restricted">
                        full · owner
                      </span>
                    ) : u.locked ? (
                      <span className="rounded px-2 py-0.5 font-semibold" style={{ background: "#F4F2EC", color: "var(--muted)" }} title={`Only ${OWNER_EMAIL} may change another admin's goals access`}>
                        {u.level === "none" ? "No access" : u.level === "view" ? "View" : "Edit"} 🔒
                      </span>
                    ) : (
                      <div className="flex gap-1">
                        {([["none", "No access"], ["view", "View"], ["edit", "Edit"]] as const).map(([lv, label]) => (
                          <button key={lv} onClick={() => setAccess(u.id, lv, u.name || u.email.split("@")[0])}
                            className="rounded px-2 py-0.5 font-semibold"
                            style={u.level === lv
                              ? { background: lv === "none" ? "#E7E4DC" : lv === "view" ? "#DCE8F5" : "var(--accent)", color: lv === "edit" ? "#fff" : lv === "view" ? "var(--blue)" : "var(--dim)" }
                              : { background: "#F4F2EC", color: "#B8B5AC" }}>
                            {label}
                          </button>
                        ))}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="text-xs mt-2" style={{ color: "var(--muted)" }}>
          <b>View</b> opens the tree read-only. <b>Edit</b> also allows adding, changing and reassigning nodes.
          Owners can always update their own node&apos;s numbers and comment on it, whatever is set here.
        </div>
      </div>
      </>)}

      {adminTab === "report" && <ReportPanel />}

      {adminTab === "org" && <OrgChart users={users} departments={departments} />}

      {adminTab === "milestones" && (<>
      {/* ---- goal categories (swimlanes) ---- */}
      <div className="bg-white rounded-lg border p-3" style={{ borderColor: "var(--line)" }}>
        <div className="font-bold text-sm mb-1">
          🏷 Goal categories <span className="font-normal text-xs" style={{ color: "var(--muted)" }}>— the fields goals and tactics are filed under (Growth, Operations, People, …)</span>
        </div>
        <div className="text-xs mb-3 rounded p-2" style={{ background: "#F4F2EC", color: "var(--dim)", lineHeight: 1.5 }}>
          Any admin may add or edit categories here — this is separate from goals access, since organising the
          categories isn&apos;t the same as being allowed into the tree. The Swimlanes view on the Goals tab lays
          work out one column per category.
        </div>
        <div className="flex gap-1 mb-2">
          <input value={newLaneName} onChange={(e) => setNewLaneName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addLane()} placeholder="New category…" className="text-xs border rounded px-2 py-1 flex-1" style={{ borderColor: "var(--line)" }} />
          <button onClick={addLane} className="text-xs font-bold rounded px-3 py-1" style={{ background: "var(--accent)", color: "#fff" }}>+ Add</button>
        </div>
        {laneMsg && <div className="text-xs font-semibold mb-2" style={{ color: "var(--red)" }}>{laneMsg}</div>}
        <div className="space-y-1">
          {lanes === null && [0, 1, 2].map((i) => (
            <div key={"ln" + i} className="rounded" style={{ height: 30, width: `${60 - i * 8}%`, background: "#F4F2EC" }} />
          ))}
          {lanes?.length === 0 && <div className="text-xs" style={{ color: "var(--muted)" }}>No categories yet.</div>}
          {(lanes ?? []).map((l) => (
            <div key={l.id} className="flex items-center gap-2 rounded p-1.5" style={{ background: "#F4F2EC" }}>
              <input type="color" defaultValue={l.color} onBlur={(e) => { if (e.target.value !== l.color) saveLane(l.id, { color: e.target.value }); }} style={{ width: 26, height: 26, border: "none", background: "none", padding: 0, cursor: "pointer" }} title="Category colour" />
              <input defaultValue={l.name} onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== l.name) saveLane(l.id, { name: v }); }} className="text-xs border rounded px-2 py-1 flex-1" style={{ borderColor: "var(--line)" }} />
              <span className="text-xs tnum" style={{ color: l.nodeCount ? "var(--blue)" : "#B8B5AC" }}>{l.nodeCount} item{l.nodeCount === 1 ? "" : "s"}</span>
              <button onClick={() => removeLane(l)} className="rounded px-2 py-0.5 text-xs font-bold" style={{ background: "#FBEDEA", color: "var(--red)" }} title="Delete — only while unused">✕</button>
            </div>
          ))}
        </div>
        <div className="text-xs mt-2" style={{ color: "var(--muted)" }}>
          Name and colour save when you click away. A category can only be deleted while no goal item still uses it.
        </div>
      </div>
      </>)}

      {adminTab === "milestones" && (<>
      {/* ---- family milestone templates ---- */}
      <div className="bg-white rounded-lg border p-3" style={{ borderColor: "var(--line)" }}>
        <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
          <div className="font-bold text-sm">Family milestone templates <span className="font-normal text-xs" style={{ color: "var(--muted)" }}>— every new job of a product family starts with these milestones</span></div>
          <div className="flex gap-1 items-center">
            <input placeholder="New product family…" value={newFam} onChange={(e) => setNewFam(e.target.value)} className="text-xs border rounded px-2 py-1" style={{ borderColor: "var(--line)", minWidth: 170 }} />
            <button onClick={createFam} className="text-xs font-bold rounded px-2 py-1" style={{ background: "var(--blue)", color: "#fff" }}>+ New product</button>
          </div>
        </div>
        <div className="flex gap-1 mb-2 flex-wrap items-center">
          {famList.map((f) => (
            <button key={f} onClick={() => loadFam(f)} className="px-2 py-1 rounded text-xs font-semibold" style={fam === f ? { background: "var(--ink)", color: "#fff" } : { background: "#F4F2EC", color: "var(--dim)" }}>{f}</button>
          ))}
          {fam && !famList.includes(fam) && (
            <span className="px-2 py-1 rounded text-xs font-bold" style={{ background: "var(--accent)", color: "#fff" }}>{fam} (unsaved)</span>
          )}
        </div>
        {rows && (
          <>
            <div className="overflow-x-auto">
              <table className="text-xs genie-table" style={{ borderCollapse: "collapse", minWidth: 760 }}>
                <thead>
                  <tr style={{ background: "#F4F2EC", color: "var(--dim)" }}>
                    <th className="px-2 py-1 text-left">#</th>
                    <th className="px-2 py-1 text-left" style={{ minWidth: 220 }}>Milestone</th>
                    <th className="px-2 py-1">Days</th>
                    <th className="px-2 py-1" title="Predecessor milestone numbers, comma-separated">Preds</th>
                    {TRADES.map((t) => (<th key={t.key} className="px-1 py-1" style={{ color: t.color }} title={t.label}>{t.tiny}</th>))}
                    <th className="px-1 py-1"></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i} style={{ borderTop: "1px solid #EEECE6" }}>
                      <td className="px-2 py-1 font-bold" style={{ color: "var(--accent)" }}>{i + 1}</td>
                      <td className="px-2 py-1"><input value={r.name} onChange={(e) => setRow(i, { name: e.target.value })} className="w-full text-xs border rounded px-1 py-0.5" style={{ borderColor: "var(--line)" }} /></td>
                      <td className="px-2 py-1 text-center"><input type="number" min={1} value={r.days} onChange={(e) => setRow(i, { days: Math.max(1, parseInt(e.target.value || "1", 10)) })} className="w-12 text-center border rounded px-1 py-0.5 tnum" style={{ borderColor: "var(--line)" }} /></td>
                      <td className="px-2 py-1 text-center"><input value={r.preds.join(",")} onChange={(e) => setRow(i, { preds: parsePreds(e.target.value, i) })} placeholder="—" className="w-16 text-center border rounded px-1 py-0.5 tnum" style={{ borderColor: "var(--line)" }} title="Earlier milestone numbers this one waits for (comma-separated)" /></td>
                      {TRADES.map((t) => (<td key={t.key} className="px-0.5 py-1 text-center"><CrewCell value={r.crew[t.key] || 0} color={t.color} onChange={(v) => setRowCrew(i, t.key as keyof Crew, v)} /></td>))}
                      <td className="px-1 py-1 text-center"><button onClick={() => delRow(i)} style={{ color: "var(--red)" }}>✕</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <button onClick={addRow} className="text-xs font-bold rounded px-3 py-1.5" style={{ background: "var(--ink)", color: "#fff" }}>+ Add milestone</button>
              <button onClick={saveTemplate} className="text-xs font-bold rounded px-3 py-1.5" style={{ background: "var(--accent)", color: "#fff" }}>💾 Save template</button>
              {tMsg && <span className="text-xs font-semibold" style={{ color: tMsg.includes("✓") ? "var(--green)" : "var(--blue)" }}>{tMsg}</span>}
            </div>
            <div className="text-xs mt-2" style={{ color: "var(--muted)" }}>Matching: a job&apos;s Product Family is matched to a template by exact name first, then partial (e.g. template &quot;Hi Lift&quot; covers &quot;Hi Lift 12m&quot;). Changing a template affects jobs that don&apos;t yet have a saved plan; saved plans are never touched.</div>
          </>
        )}
      </div>
      </>)}

    </div>
  );
}

// ============================ Pending Material ============================

/** The same number card the delivery board uses, shared by the new tabs. */
/**
 * Labour day-rates, one per trade — Admin -> Settings, keyed by Dr Raghu.
 * With the manpower ledger rolling every day, these turn headcount into
 * labour cost on the Job Plan's Manpower tab. Rates are money: the API
 * answers Stratcom only, and the cost columns mask like every other rupee.
 */
export function LabourRatesCard() {
  const [rates, setRates] = useState<Record<string, string> | null>(null);
  const [needsMigration, setNeedsMigration] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  useEffect(() => {
    api.get("/api/admin/labour-rates")
      .then((r: { rates?: Record<string, number> | null; needsMigration?: boolean }) => {
        if (r.needsMigration) { setNeedsMigration(true); setRates(Object.fromEntries(TRADES.map((t) => [t.key, "0"]))); return; }
        setRates(Object.fromEntries(TRADES.map((t) => [t.key, String(r.rates?.[t.key] ?? 0)])));
      })
      .catch(() => setRates(Object.fromEntries(TRADES.map((t) => [t.key, "0"]))));
  }, []);
  const save = async () => {
    if (!rates) return;
    setBusy(true); setMsg("");
    try {
      await api.post("/api/admin/labour-rates", {
        rates: Object.fromEntries(TRADES.map((t) => [t.key, Number(rates[t.key]) || 0])),
      });
      setMsg("Saved. The Manpower tab prices itself from these.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); }
  };
  return (
    <div className="bg-white rounded-lg border p-3 mb-3" style={{ borderColor: "var(--line)" }}>
      <div className="flex items-baseline gap-2 flex-wrap mb-2">
        <h3 className="font-bold" style={{ color: "var(--navy)" }}>Labour rates</h3>
        <span className="text-xs" style={{ color: "var(--muted)" }}>
          day-rate per trade · turns the manpower ledger into labour cost · masked like every other rupee
        </span>
      </div>
      {needsMigration && (
        <div className="text-xs rounded p-2 mb-2" style={{ background: "#FFF7E6", color: "#8A5A00" }}>
          Run migration 0072 — the rates have nowhere to live yet.
        </div>
      )}
      {rates && (
        <div className="flex gap-2 flex-wrap items-end">
          {TRADES.map((t) => (
            <label key={t.key} className="block">
              <div className="text-xs font-bold mb-0.5" style={{ color: t.color }}>{t.label}</div>
              <input
                type="number" min={0} value={rates[t.key]}
                onChange={(e) => setRates((r) => ({ ...(r || {}), [t.key]: e.target.value }))}
                className="rounded border px-2 py-1 text-sm tnum" style={{ borderColor: "var(--line)", width: 92 }}
              />
            </label>
          ))}
          <button onClick={save} disabled={busy || needsMigration}
            className="rounded px-3 py-1.5 text-xs font-bold"
            style={{ background: busy ? "#B8B5AC" : "var(--accent)", color: "#fff" }}>
            {busy ? "Saving…" : "Save rates"}
          </button>
        </div>
      )}
      {msg && <div className="text-xs mt-2 font-semibold" style={{ color: msg.startsWith("Saved") ? "var(--green)" : "var(--red)" }}>{msg}</div>}
    </div>
  );
}