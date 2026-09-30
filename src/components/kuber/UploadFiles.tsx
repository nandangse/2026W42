"use client";

/**
 * Kuber's Upload Files — the pipeline version (Dr Raghu, 28 Aug 2026):
 * the file goes to the BROWSER first, then straight to GOOGLE DRIVE
 * (bypassing Vercel and Supabase entirely — a 407 MB export never touches
 * them), and then the browser itself READS it into Kuber's tables, sending
 * only parsed rows. A timer and a % ride every stage; one file at a time.
 *
 * The Drive leg signs in with the user's own Google account (the same OAuth
 * app Gmail uses) and files the XML under "<date> - <initials>" inside the
 * Tally folder Dr Raghu linked. If Drive says no — origin not yet allowed on
 * the OAuth app, popup blocked — the stage is skipped in plain words and the
 * books still load; the Mac script can file the copy later.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { parseMastersInBrowser, parseTransactionsInBrowser, type Row } from "@/lib/kuber-tally-browser";

const INK = "var(--navy)", MUTED = "var(--muted)", BORDER = "var(--line)", ORANGE = "var(--accent)", GREEN = "var(--green)";
const TODAY_IST = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
import { driveToken, driveUpload } from "@/components/kuber/drive-leg";
import YearFiles from "@/components/kuber/YearFiles";

interface KuberUpload {
  id: string; kind: string; for_date: string; name: string; bytes: number | null;
  by: string | null; initials: string | null; at: string; drive_synced_at: string | null; url: string | null;
  taken_in: string | null;
}
type Stage = { name: string; state: "wait" | "run" | "done" | "skip" | "fail"; pct: number; note?: string };

export default function UploadFiles({ email }: { email?: string }) {
  const [forDate, setForDate] = useState(TODAY_IST);
  const [rebuild, setRebuild] = useState("");
  /**
   * WHICH YEAR THIS LOAD BELONGS TO (0178).
   *
   * Derived from the date the export is OF, because that is the one fact the
   * person already had to get right, and shown so it can be corrected: an
   * export taken in April of last year's closed books is dated April and
   * belongs to the year before. Getting it wrong no longer destroys anything
   * — it loads into the wrong year's slot, and re-loading the right one puts
   * it back — but it is worth a glance.
   */
  const fyOf = (iso: string) => {
    const d = new Date(`${iso}T00:00:00`);
    const y = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
    return `${y}-${String(y + 1).slice(2)}`;
  };
  const [fy, setFy] = useState(() => fyOf(TODAY_IST));
  const [fyTouched, setFyTouched] = useState(false);
  const setDate = (iso: string) => { setForDate(iso); if (!fyTouched) setFy(fyOf(iso)); };
  const [rows, setRows] = useState<KuberUpload[] | null>(null);
  const [reviewLink, setReviewLink] = useState<string | null>(null);
  const [reviewWho, setReviewWho] = useState<string>("");
  const [linkEdit, setLinkEdit] = useState<string | null>(null); // null = not editing
  const [linkMsg, setLinkMsg] = useState("");
  const [running, setRunning] = useState<"" | "masters" | "transactions">("");
  const [googleClientId, setGoogleClientId] = useState<string | null>(null);
  const [stages, setStages] = useState<Stage[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const [finished, setFinished] = useState("");
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(() => {
    fetch("/api/kuber/upload", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        setRows(j.uploads || []); setReviewLink(j.reviewLink ?? null);
        setReviewWho(j.reviewLinkBy
          ? `updated by ${j.reviewLinkBy}${j.reviewLinkAt ? " · " + new Date(j.reviewLinkAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : ""}`
          : "");
      })
      .catch(() => setRows([]));
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => () => { if (timer.current) clearInterval(timer.current); }, []);
  // fetched at mount so the CLICK itself can open Google's popup — a popup
  // asked for seconds after the click is a popup the browser blocks
  useEffect(() => {
    fetch("/api/kuber/ingest?config=1", { cache: "no-store" })
      .then((r) => r.json()).then((j) => setGoogleClientId(j.googleClientId ?? null))
      .catch(() => setGoogleClientId(null));
  }, []);

  const setStage = (i: number, patch: Partial<Stage>) =>
    setStages((s) => s.map((st, j) => (j === i ? { ...st, ...patch } : st)));

  const run = async (kind: "masters" | "transactions", file: File | null) => {
    if (!file || running) return;
    setRunning(kind); setFinished("");
    setStages([
      { name: "In the browser", state: "run", pct: 0 },
      { name: "To Google Drive", state: "wait", pct: 0 },
      { name: "Read into Kuber", state: "wait", pct: 0 },
    ]);
    const t0 = Date.now();
    setElapsed(0);
    timer.current = setInterval(() => setElapsed(Math.floor((Date.now() - t0) / 1000)), 1000);
    const label = kind === "masters" ? "Tally XML Masters" : "Tally XML Transactions";
    let onDrive = false;
    try {
      // Google FIRST, inside the click itself — the popup opens while the
      // browser still trusts the gesture. Everything else waits its turn.
      let driveTok: string | null = null;
      let driveSkip = "";
      if (googleClientId) {
        try { driveTok = await driveToken(googleClientId, email); }
        catch (e) {
          const w = e instanceof Error ? e.message : String(e);
          driveSkip = /popup/i.test(w)
            ? "the browser blocked Google's window — click the popup icon in the address bar, allow genie.nandan.co.in, and run this file again"
            : `${w} — the Mac script can file it later`;
        }
      } else {
        driveSkip = "no Google client configured — the Mac script can file it later";
      }

      // 1 — the browser holds the File itself; a quick read proves it is real
      await file.slice(0, 1024).arrayBuffer();
      setStage(0, { state: "done", pct: 1, note: `${(file.size / 1024 / 1024).toFixed(0)} MB held` });

      // 2 — straight to Drive, Vercel and Supabase never see the bytes
      setStage(1, { state: "run" });
      try {
        if (!driveTok) throw new Error(driveSkip);
        const me = rows?.find(() => true);
        const initials = (me?.initials || "RJ").toUpperCase();
        await driveUpload(driveTok, `${forDate} - ${initials}`, file, label, (p) => setStage(1, { pct: p }));
        onDrive = true;
        setStage(1, { state: "done", pct: 1, note: "filed in the Tally folder" });
      } catch (e) {
        setStage(1, { state: "skip", note: e instanceof Error ? e.message : String(e) });
      }

      // 3 — the browser parses; only rows travel, 500 at a time
      setStage(2, { state: "run" });
      const begin = await fetch("/api/kuber/ingest", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "begin", kind, fy }),
      });
      if (!begin.ok) throw new Error((await begin.json()).error || "Kuber refused the load");
      const sink = async (table: string, batch: Row[]) => {
        const r = await fetch("/api/kuber/ingest", {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "batch", table, rows: batch, fy }),
        });
        if (!r.ok) throw new Error((await r.json()).error || `a ${table} batch was refused`);
      };
      const onPct = (p: number) => setStage(2, { pct: p });
      const counts = kind === "masters"
        ? await parseMastersInBrowser(file, sink, onPct)
        : await parseTransactionsInBrowser(file, sink, onPct);
      const done = await fetch("/api/kuber/ingest", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "done", kind, fy, for_date: forDate, name: file.name, bytes: file.size, drive: onDrive, counts }),
      });
      if (!done.ok) throw new Error((await done.json()).error || "the final step was refused");
      const j = await done.json();
      const what = "ledgers" in counts
        ? `${counts.ledgers.toLocaleString()} ledgers, ${counts.bills.toLocaleString()} opening bills`
        : `${counts.vouchers.toLocaleString()} vouchers, ${counts.lines.toLocaleString()} lines`;
      setStage(2, { state: "done", pct: 1, note: what });
      setFinished(`Done in ${Math.floor((Date.now() - t0) / 60000)}m ${Math.floor(((Date.now() - t0) / 1000) % 60)}s — ${what}; ${j.bills.toLocaleString()} open bills stand rebuilt.`);
      load();
    } catch (e) {
      setStages((s) => s.map((st) => (st.state === "run" ? { ...st, state: "fail", note: e instanceof Error ? e.message : String(e) } : st)));
    } finally {
      if (timer.current) clearInterval(timer.current);
      setRunning("");
    }
  };

  const mmss = `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, "0")}`;
  const Tile = ({ kind, label }: { kind: "masters" | "transactions"; label: string }) => (
    <label className="rounded-lg border p-4 flex-1 text-center"
      style={{ borderColor: BORDER, background: running === kind ? "#F4F2EC" : "#fff", minWidth: 220, cursor: running ? "default" : "pointer", opacity: running && running !== kind ? 0.45 : 1 }}
      title={running && running !== kind ? "One file at a time — this one waits its turn" : undefined}>
      <div className="text-2xl mb-1">⬆</div>
      <div className="text-sm font-bold" style={{ color: INK }}>{label}</div>
      <div className="text-xs mt-1" style={{ color: MUTED }}>
        {running === kind ? `working… ${mmss}` : "Click to choose the XML — any size"}
      </div>
      <input type="file" accept=".xml,text/xml,application/xml" className="hidden" disabled={!!running}
        onChange={(e) => { run(kind, e.target.files?.[0] ?? null); e.target.value = ""; }} />
    </label>
  );

  return (
    <div>
      <div className="bg-white rounded-lg border p-4 mb-3" style={{ borderColor: BORDER, maxWidth: 780 }}>
        <div className="text-lg font-bold mb-1" style={{ color: INK }}>⬆ Upload Files</div>
        <div className="text-sm mb-3" style={{ color: "var(--dim)", lineHeight: 1.6 }}>
          The file stays with the browser, goes straight to <b>Google Drive</b> under a <b>date – initials</b> folder,
          and is then read into Kuber's books right here — the 400&nbsp;MB never touches the app's servers, only the rows do.
          One file at a time.
        </div>
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <span className="text-xs font-bold" style={{ color: MUTED }}>DATE</span>
          <input type="date" value={forDate} onChange={(e) => setDate(e.target.value)} disabled={!!running}
            className="border rounded px-2 py-1 text-sm" style={{ borderColor: BORDER }}
            title="The date the export is OF — not necessarily today" />
          {/* WHICH YEAR IT REPLACES. Loading clears this year and refills it;
              every other year is left alone (0178). */}
          <span className="text-xs font-bold ml-2" style={{ color: MUTED }}>FINANCIAL YEAR</span>
          <select value={fy} disabled={!!running}
            onChange={(e) => { setFy(e.target.value); setFyTouched(true); }}
            className="border rounded px-2 py-1 text-sm font-bold" style={{ borderColor: BORDER, color: INK }}
            title="The year this load belongs to — loading replaces THIS year only">
            {Array.from({ length: 8 }, (_, i) => { const y = 2026 - i; return `${y}-${String(y + 1).slice(2)}`; })
              .map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
        </div>
        <div className="text-xs rounded px-2 py-1.5 mb-3" style={{ background: "#FFF8E8", color: "#7A5B00", lineHeight: 1.5 }}>
          Loading replaces <b>{fy}</b> and nothing else. Any other year already in the books stays where it is —
          and the open bills are rebuilt across all of them, so a bill raised in one year and settled in the next
          nets off properly.
        </div>
        <div className="flex gap-3 flex-wrap mb-2">
          <Tile kind="masters" label="Tally XML Masters" />
          <Tile kind="transactions" label="Tally XML Transactions" />
        </div>
        {/* RECOMPUTE WITHOUT RE-UPLOADING. The open bills are derived, not
            typed, so when the derivation is corrected the books should be
            able to catch up without asking anybody to send a 1 GB file again. */}
        <div className="flex items-center gap-2 flex-wrap mb-2">
          <button onClick={async () => {
            setRebuild("working"); 
            try {
              const r = await fetch("/api/kuber/ingest", {
                method: "POST", headers: { "content-type": "application/json" },
                body: JSON.stringify({ action: "rebuild" }),
              });
              const j = await r.json();
              if (!r.ok) throw new Error(j?.error || "the recompute was refused");
              setRebuild(`${Number(j.rebuilt || 0).toLocaleString("en-IN")} open bills rebuilt from the Tally masters ✓`);
            } catch (e) { setRebuild("!" + (e instanceof Error ? e.message : String(e))); }
          }} disabled={rebuild === "working" || !!running}
            className="text-xs font-bold rounded px-3 py-1.5"
            style={{ background: "#fff", border: `1px solid ${BORDER}`, color: INK }}
            title="Rebuild the open bills from the masters already loaded — no upload needed">
            {rebuild === "working" ? "Recomputing…" : "↻ Recompute open bills"}
          </button>
          {!!rebuild && rebuild !== "working" && (
            <span className="text-xs" style={{ color: rebuild.startsWith("!") ? "var(--red)" : GREEN }}>
              {rebuild.replace(/^!/, "")}
            </span>
          )}
        </div>
        {stages.length > 0 && (
          <div className="rounded border p-3 mt-1" style={{ borderColor: BORDER, background: "#FAF9F5" }}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold" style={{ color: MUTED, letterSpacing: 0.8 }}>THE PIPELINE</span>
              <span className="text-xs tnum font-bold" style={{ color: running ? ORANGE : GREEN }}>⏱ {mmss}</span>
            </div>
            {stages.map((st, i) => (
              <div key={i} className="mb-2">
                <div className="flex items-center gap-2 text-xs">
                  <span style={{ width: 16 }}>
                    {st.state === "done" ? "✅" : st.state === "run" ? "▶" : st.state === "skip" ? "↷" : st.state === "fail" ? "✕" : "·"}
                  </span>
                  <span className="font-semibold" style={{ color: st.state === "fail" ? "var(--red)" : INK }}>{st.name}</span>
                  {st.state === "run" && <span className="tnum font-bold" style={{ color: ORANGE }}>{Math.round(st.pct * 100)}%</span>}
                  {st.note && <span style={{ color: st.state === "fail" ? "var(--red)" : MUTED }}>— {st.note}</span>}
                </div>
                {(st.state === "run" || st.state === "done") && (
                  <div className="rounded mt-1" style={{ height: 5, background: "#EAE7DF", overflow: "hidden" }}>
                    <div style={{ width: `${Math.round(st.pct * 100)}%`, height: "100%", background: st.state === "done" ? GREEN : ORANGE, transition: "width .3s" }} />
                  </div>
                )}
              </div>
            ))}
            {finished && <div className="text-xs font-bold mt-1" style={{ color: GREEN }}>{finished}</div>}
          </div>
        )}
      </div>

      {/* the Management Review file — the sheet these books mirror */}
      <div className="bg-white rounded-lg border p-3 mb-3 flex items-center gap-3 flex-wrap" style={{ borderColor: BORDER, maxWidth: 780 }}>
        <span className="text-sm font-bold" style={{ color: INK }}>📊 Management Review file</span>
        {linkEdit === null ? (
          <>
            {reviewLink ? (
              <>
                <a href={reviewLink} target="_blank" rel="noreferrer" className="text-sm font-bold" style={{ color: "var(--blue)" }}>
                  Open the sheet ↗
                </a>
                {reviewWho && <span className="text-xs" style={{ color: MUTED }}>{reviewWho}</span>}
              </>
            ) : (
              <span className="text-sm" style={{ color: MUTED }}>no link kept yet</span>
            )}
            <button onClick={() => setLinkEdit(reviewLink ?? "")} className="text-xs font-bold ml-auto" style={{ color: ORANGE }}>
              ✎ {reviewLink ? "Change" : "Add the link"}
            </button>
          </>
        ) : (
          <>
            <input value={linkEdit} onChange={(e) => setLinkEdit(e.target.value)}
              placeholder="https://docs.google.com/spreadsheets/…"
              className="flex-1 border rounded px-2 py-1 text-sm" style={{ borderColor: BORDER, minWidth: 260 }} />
            <button onClick={async () => {
              setLinkMsg("");
              const r = await fetch("/api/kuber/upload", {
                method: "PATCH", headers: { "content-type": "application/json" },
                body: JSON.stringify({ review_link: linkEdit }),
              });
              if (!r.ok) { setLinkMsg((await r.json()).error || "Could not save"); return; }
              setReviewLink(linkEdit.trim() || null); setLinkEdit(null); load();
            }} className="text-xs font-bold rounded px-3 py-1 text-white" style={{ background: ORANGE }}>Save</button>
            <button onClick={() => { setLinkEdit(null); setLinkMsg(""); }} className="text-xs" style={{ color: MUTED }}>Cancel</button>
          </>
        )}
        {linkMsg && <span className="text-xs font-bold" style={{ color: "var(--red)" }}>{linkMsg}</span>}
      </div>

      <div className="bg-white rounded-lg border overflow-auto" style={{ borderColor: BORDER, maxWidth: 950, maxHeight: "46vh" }}>
        <table className="w-full text-xs genie-table" style={{ minWidth: 640, borderCollapse: "separate", borderSpacing: 0 }}>
          <thead>
            <tr style={{ background: "var(--ink)", color: "#fff" }}>
              {["Date", "Kind", "File", "Data taken in", "By", "Uploaded", "On Drive"].map((h) => (
                <th key={h} className="px-2 py-2 text-left" style={{ position: "sticky", top: 0, background: "var(--ink)" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows === null && (<tr><td colSpan={7} className="px-3 py-4" style={{ color: MUTED }}>Loading…</td></tr>)}
            {rows?.length === 0 && (<tr><td colSpan={7} className="px-3 py-4" style={{ color: MUTED }}>Nothing uploaded yet — the first pair starts the ledger.</td></tr>)}
            {(rows || []).map((r, i) => (
              <tr key={r.id} className="border-t" style={{ borderColor: "var(--line-soft)", background: i % 2 ? "#FAF9F5" : "#fff" }}>
                <td className="px-2 py-1.5 tnum whitespace-nowrap">{r.for_date}</td>
                <td className="px-2 py-1.5 font-bold" style={{ color: r.kind === "masters" ? "var(--blue)" : GREEN }}>
                  {r.kind === "masters" ? "Masters" : "Transactions"}
                </td>
                <td className="px-2 py-1.5">
                  {r.url ? <a href={r.url} target="_blank" rel="noreferrer" style={{ color: "var(--blue)", textDecoration: "underline" }}>{r.name}</a> : r.name}
                  {r.bytes != null && <span style={{ color: MUTED }}> · {(r.bytes / 1024 / 1024).toFixed(1)} MB</span>}
                </td>
                <td className="px-2 py-1.5 font-semibold" style={{ color: r.taken_in ? GREEN : MUTED, maxWidth: 240 }}>
                  {r.taken_in ?? "—"}
                </td>
                <td className="px-2 py-1.5 font-semibold">{r.initials || r.by || "—"}</td>
                <td className="px-2 py-1.5 tnum whitespace-nowrap" style={{ color: MUTED }}>
                  {new Date(r.at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                </td>
                <td className="px-2 py-1.5">
                  {r.drive_synced_at
                    ? <span className="font-bold" style={{ color: GREEN }}>✓ filed</span>
                    : <span style={{ color: MUTED }} title="the Mac sync carries it over on its next run">pending sync</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <YearFiles email={email} googleClientId={googleClientId} />
    </div>
  );
}
