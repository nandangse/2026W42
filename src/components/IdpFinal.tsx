"use client";
/**
 * The last page of the IDP.
 *
 * Everything on it is Dr Raghu's brief of 23 Aug 2026: the thank-you, the
 * role read back once more with his recording, the salary table with the
 * CTC in lakhs, a placeholder for his video walking through that table,
 * and then the part that matters — a COMPULSORY voice note answering him
 * on cost and value, with room to write more and attach anything.
 *
 * The voice note is the exchange at the heart of the page: the company has
 * just shown the person exactly what they cost; the person answers, in
 * their own voice, what they are worth and what they will change.
 */
import { useRef, useState } from "react";
import DictateBox, { type Recording } from "./DictateBox";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { LOOM_EMBED } from "@/lib/idp";
import { api } from "@/lib/api";

const C = { ink: "#22303C", dim: "#5A6672", faint: "#8A94A0", line: "#E2E0DA", orange: "#E8600A", green: "#0D7A3F", red: "#B3261E" };

export interface SalaryRow { label: string; monthly: number | null; yearly: number | null; kind: "head" | "row" | "total" | "note" }
export interface SalaryInfo { name: string | null; department: string | null; designation: string | null; type: string | null; years: string | null; age: string | null }
export interface Attachment { path: string; name: string; size: number; at: string; url?: string | null }

const inr = (n: number | null) => (n === null ? "" : n.toLocaleString("en-IN"));

/** 125000 → "1.25 Lakhs", 55000 → "55 Thousand" — the words people say. */
const inWords = (n: number) =>
  n >= 100000 ? `${(n / 100000).toFixed(2).replace(/\.?0+$/, "")} Lakhs`
  : n >= 1000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, "")} Thousand`
  : String(n);

/**
 * THE SAME ARITHMETIC AS THE TABLE ABOVE, run at the figure they typed — so
 * the number they ask for is immediately shown as what it would COST, not
 * just what it would pay. Basic is assumed to keep its current share of
 * gross; the exempt types keep their exemption.
 */
function indicativeCtc(askGross: number, basicShare: number, exempt: boolean): number {
  const basic = askGross * basicShare;
  const pf = !exempt && basic > 0 ? Math.round(Math.min(basic, 15000) * 0.12) : 0;
  const pt = !exempt && askGross >= 10000 ? 200 : 0;
  const perDay = askGross / 26;
  const benM = pf + 5000 / 12 + 2000 / 12 + basic * 0.10 + (perDay * 20) / 12 + (perDay * 52) / 12;
  return (askGross - pf - pt + benM) * 12;
}

const QUESTIONS = [
  "How do you justify your cost to company?",
  "What should be your Value to Company?",
  "What all would you do more in order to be more valuable to the company — so we can improve our efficiency and also improve throughput?",
  "What are the real areas where you can give a solution?",
  "What do you want your CTC to be? And what is the change you are promising that can be seen in results?",
  "Who are you training to do your today's work, so that you can take up bigger work tomorrow?",
];

export default function IdpFinal({
  name, idpId, salary, ctcLakhs, salaryInfo, exempt, roleAudio, roleSummary, roleName,
  answers, setAnswer, recordings, onRecorded, attachments, onAttached, onOpenBrief,
}: {
  name: string; idpId: string;
  salary: SalaryRow[] | null; ctcLakhs: string | null; salaryInfo: SalaryInfo | null; exempt: boolean;
  roleAudio: string | null; roleSummary: string | null; roleName: string | null;
  answers: Record<string, string>;
  setAnswer: (id: string, v: string) => void;
  recordings: Recording[];
  onRecorded: (r: Recording) => void;
  attachments: Attachment[];
  onAttached: (a: Attachment) => void;
  onOpenBrief: () => void;
}) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [ask, setAsk] = useState(() =>
    answers["ask_gross"] || String(salary?.find((r) => r.label === "Total Gross Salary (A)")?.monthly ?? ""));
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState("");

  /**
   * STRAIGHT TO STORAGE. The platform caps an API request at ~4.5 MB, so a
   * 6 MB deck posted through it came back as an HTML error the page tried to
   * read as JSON. The server now signs a one-time upload address, the browser
   * sends the file THERE, and the API only records that it arrived.
   */
  const attach = async (f: File | null) => {
    if (!f) return;
    setUploading(true); setErr("");
    try {
      const t = await api.post("/api/idp", { action: "attach-url", id: idpId, name: f.name, size: f.size });
      const { error: upErr } = await supabaseBrowser().storage.from("voice-notes").uploadToSignedUrl(t.path, t.token, f);
      if (upErr) throw new Error(`The upload itself failed: ${upErr.message}`);
      const j = await api.post("/api/idp", { action: "attach-commit", id: idpId, path: t.path, name: t.name, size: f.size });
      onAttached({ path: j.path, name: j.name, size: f.size, at: new Date().toISOString(), url: j.url });
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    setUploading(false);
  };

  return (
    <div className="mb-5">
      {/* ── the thank-you ── */}
      <div className="rounded-lg p-4" style={{ background: "#E6F4EA", border: "1px solid #9AD3AE" }}>
        <div className="font-bold" style={{ fontSize: 18 }}>
          {name}, thank you for this time you took to fill this up.
        </div>
        <div style={{ fontSize: 14.5, color: C.dim, lineHeight: 1.7, marginTop: 4 }}>
          Now this is your IDP record, which will help you get better and better.
        </div>
      </div>

      {/* ── the role, once more ── */}
      <div className="rounded-lg p-3 mt-4" style={{ background: "#fff", border: `1px solid ${C.line}` }}>
        <div className="font-bold" style={{ fontSize: 15 }}>
          In order that I know better, do review the “Roles and Responsibilities Assigned to me” below.
        </div>
        <div style={{ fontSize: 13, color: C.dim, marginTop: 2 }}>
          Also hear Raghu&apos;s voice note about your role. After you see this, if you want to change any of your
          answers, feel free to do so — use the step numbers above.
        </div>
        <div className="flex items-center gap-2 flex-wrap mt-2">
          {roleName && <span className="rounded px-2 py-0.5 font-bold" style={{ background: "#FFF3E8", fontSize: 13 }}>{roleName}</span>}
          <button onClick={onOpenBrief} className="text-xs font-bold rounded px-2.5 py-1.5" style={{ background: "#16232F", color: "#fff" }}>
            📋 Read the full role
          </button>
        </div>
        {roleAudio && (
          <div className="mt-2">
            <div style={{ fontSize: 12, color: C.faint }}>Voice note from Raghu about your role</div>
            <audio controls controlsList="nodownload" onContextMenu={(e) => e.preventDefault()} src={roleAudio} style={{ width: "100%", maxWidth: 420 }} />
          </div>
        )}
        {roleSummary && (
          <div style={{ fontSize: 13, color: C.dim, whiteSpace: "pre-wrap", lineHeight: 1.7, marginTop: 6 }}>{roleSummary}</div>
        )}
      </div>

      {/* ── the salary table ── */}
      {salary ? (
        <div className="rounded-lg p-3 mt-4" style={{ background: "#fff", border: `1px solid ${C.line}` }}>
          <div className="font-bold" style={{ fontSize: 15 }}>Your Current Salary Table</div>
          {salaryInfo && (
            <div className="mt-1" style={{ fontSize: 13, lineHeight: 1.7, color: C.dim }}>
              <b>Name:</b> {salaryInfo.name || "—"}<br />
              <b>Department:</b> {salaryInfo.department || "—"} &nbsp;·&nbsp; <b>Designation:</b> {salaryInfo.designation || "—"}<br />
              <b>Type:</b> {salaryInfo.type || "—"}<br />
              <b>In Company Since:</b> {salaryInfo.years ? `${salaryInfo.years} years` : "—"} &nbsp;·&nbsp;{" "}
              <b>Age:</b> {salaryInfo.age ? `${salaryInfo.age} years` : "—"}
            </div>
          )}
          {/* fits the screen it is on: fixed layout, percentages, and the
              rupee columns tight — nothing to scroll sideways for */}
          <div className="mt-2">
            <table style={{ fontSize: 12.5, width: "100%", tableLayout: "fixed", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th className="text-left px-1.5 py-1.5" style={{ border: `1px solid ${C.line}`, width: "48%" }}>Components of Compensation</th>
                  <th className="text-right px-1.5 py-1.5" style={{ border: `1px solid ${C.line}`, width: "24%" }}>Monthly (Rs.)</th>
                  <th className="text-right px-1.5 py-1.5" style={{ border: `1px solid ${C.line}`, width: "28%" }}>Yearly (Rs.)</th>
                </tr>
              </thead>
              <tbody>
                {salary.map((r, i) => (
                  <tr key={i} style={{
                    background: r.kind === "head" || r.kind === "total" ? "#FFF9C4" : "#fff",
                    fontWeight: r.kind === "total" ? 700 : r.kind === "head" ? 700 : 400,
                  }}>
                    {r.kind === "note" ? (
                      <td colSpan={3} className="px-1.5 py-1" style={{ border: `1px solid ${C.line}`, fontSize: 11.5, color: C.dim }}>{r.label}</td>
                    ) : (
                      <>
                        <td className="px-1.5 py-1" style={{ border: `1px solid ${C.line}`, wordBreak: "break-word" }}>{r.label}</td>
                        <td className="px-1.5 py-1 text-right tnum" style={{ border: `1px solid ${C.line}` }}>{inr(r.monthly)}</td>
                        <td className="px-1.5 py-1 text-right tnum" style={{ border: `1px solid ${C.line}` }}>{inr(r.yearly)}</td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {exempt && (
            <div style={{ fontSize: 12, color: "#8A5B00", marginTop: 6, lineHeight: 1.5 }}>
              HRA, PF and PT are not applicable for Contract, Management and Staff - Contract type of employees.
            </div>
          )}
          {ctcLakhs && (
            <div className="mt-2 font-bold" style={{ fontSize: 15 }}>
              Your CTC is approx <span style={{ color: C.orange }}>Rs {ctcLakhs} Lakhs</span> per year.
            </div>
          )}
          <div className="rounded p-2.5 mt-3" style={{ background: "#EDEAF6", border: "1px solid #B9AEDD" }}>
            <div className="font-bold" style={{ fontSize: 13 }}>🎬 Raghu explaining this table — watch before you answer below</div>
            <div style={{ position: "relative", paddingBottom: "56.25%", height: 0, marginTop: 6 }}>
              <iframe src={LOOM_EMBED} frameBorder={0} allowFullScreen
                style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", borderRadius: 8 }} />
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-lg p-3 mt-4" style={{ background: "#F4F2EC", fontSize: 13, color: C.dim }}>
          Your salary details are not on the record yet, so the table cannot be shown. HR has been building the
          records — it will appear here once yours carries the pay components.
        </div>
      )}

      {/* ── the compulsory reply ── */}
      <div className="rounded-lg p-3 mt-4" style={{ background: "#fff", border: "2px solid #E8600A" }}>
        <div className="font-bold" style={{ fontSize: 15 }}>
          🎙 Please leave me a VOICE NOTE — <span style={{ color: C.red }}>compulsory</span>
        </div>
        <div style={{ fontSize: 13, color: C.dim, lineHeight: 1.6, marginTop: 2 }}>
          As if you are replying to Raghu. Speak to these, in any order, in English or Hindi:
        </div>
        <ol className="mt-2" style={{ fontSize: 13.5, lineHeight: 1.8, paddingLeft: 20, listStyle: "decimal" }}>
          {QUESTIONS.map((q) => (<li key={q}>{q}</li>))}
        </ol>
        <div className="mt-2">
          <DictateBox
            value={answers["final_voice"] || ""}
            rows={5}
            placeholder="Speak first — your words appear here, and you can add to them."
            onChange={(v) => setAnswer("final_voice", v)}
            idpId={idpId} qid="final_voice"
            recordings={recordings}
            onRecorded={onRecorded}
          />
        </div>
        {recordings.length === 0 && (
          <div className="mt-1" style={{ fontSize: 12, color: C.red, fontWeight: 600 }}>
            The IDP cannot be submitted without this recording.
          </div>
        )}
        <div style={{ fontSize: 12, color: C.faint, marginTop: 6 }}>
          Feel free to write more in the box after you put in the voice note.
        </div>
      </div>

      {/* ── the question worth asking ── */}
      <div className="rounded-lg p-3 mt-4" style={{ background: "#fff", border: `1px solid ${C.line}` }}>
        <div className="font-bold" style={{ fontSize: 15, color: C.green }}>
          What Gross Monthly Salary should the company pay you?
        </div>
        <div style={{ fontSize: 12.5, color: C.dim, lineHeight: 1.6, marginTop: 2 }}>
          It starts at what you are paid today — change it to the number you believe is right, next to the value
          you have just described.
        </div>
        <div className="flex items-center gap-2 mt-2 flex-wrap">
          <span style={{ fontSize: 16, fontWeight: 700, color: C.green }}>Rs</span>
          <input
            value={ask}
            inputMode="numeric"
            placeholder="per month"
            onChange={(e) => setAsk(e.target.value.replace(/[^0-9]/g, ""))}
            onBlur={() => setAnswer("ask_gross", ask)}
            className="rounded px-2 py-2 tnum"
            style={{ border: `2px solid ${C.green}`, color: C.green, fontWeight: 700, fontSize: 17, width: 170 }} />
          <span style={{ fontSize: 12, color: C.faint }}>gross, per month</span>
        </div>
        {(() => {
          const n = Number(ask || 0);
          if (!n) return null;
          const current = salary?.find((r) => r.label === "Total Gross Salary (A)")?.monthly ?? null;
          const basicNow = salary?.find((r) => r.label === "Basic & DA")?.monthly ?? null;
          const basicShare = current && basicNow ? basicNow / current : 1;
          const inc = current !== null ? n - current : null;
          const ctc = indicativeCtc(n, basicShare, exempt);
          return (
            <div className="mt-2" style={{ fontSize: 13.5, lineHeight: 1.8 }}>
              <b style={{ color: C.green }}>= ₹{inWords(n)} per month</b>
              {inc !== null && (
                <div>
                  Increment <b className="tnum" style={{ color: inc >= 0 ? C.green : C.red }}>
                    {inc >= 0 ? "+" : "−"}₹{inr(Math.abs(inc))}
                  </b>{" "}
                  <span style={{ color: C.faint }}>
                    ({current ? `${inc >= 0 ? "+" : "−"}${Math.abs((inc / current) * 100).toFixed(1)}% increment` : ""})
                  </span>
                </div>
              )}
              <div style={{ color: C.dim }}>
                At this gross, your indicative CTC works out to about{" "}
                <b>₹{inWords(Math.round(ctc))} per year</b>{" "}
                <span style={{ fontSize: 11.5, color: C.faint }}>— same calculation as the table above</span>
              </div>
            </div>
          );
        })()}
      </div>

      {/* ── attachments ── */}
      <div className="rounded-lg p-3 mt-4" style={{ background: "#fff", border: `1px solid ${C.line}` }}>
        <div className="font-bold" style={{ fontSize: 14 }}>
          If you have any document, presentation or note, please feel free to attach it
        </div>
        <div className="flex items-center gap-2 flex-wrap mt-2">
          <input ref={fileRef} type="file" style={{ display: "none" }}
            accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.png,.jpg,.jpeg,.txt"
            onChange={(e) => { attach(e.target.files?.[0] || null); e.target.value = ""; }} />
          <button onClick={() => fileRef.current?.click()} disabled={uploading}
            className="text-xs font-bold rounded px-3 py-2" style={{ background: "#16232F", color: "#fff", opacity: uploading ? 0.6 : 1 }}>
            {uploading ? "Attaching…" : "📎 Attach document"}
          </button>
          <span style={{ fontSize: 11.5, color: C.faint }}>PDF, Word, PowerPoint, Excel or an image · under 25 MB</span>
        </div>
        {err && <div style={{ fontSize: 12, color: C.red, marginTop: 4 }}>{err}</div>}
        {attachments.length > 0 && (
          <div className="mt-2">
            {attachments.map((a) => (
              <div key={a.path} className="flex items-center gap-2 py-1" style={{ borderTop: "1px solid #EEECE6", fontSize: 13 }}>
                <span>📄</span>
                {a.url ? <a href={a.url} target="_blank" rel="noopener noreferrer" style={{ color: "#1B3A5C", fontWeight: 600 }}>{a.name}</a> : <span>{a.name}</span>}
                <span style={{ fontSize: 11, color: C.faint }}>{Math.max(1, Math.round(a.size / 1024))} KB</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
