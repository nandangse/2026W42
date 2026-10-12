"use client";
/** MY ADVANCES AND EXPENSES — what the company paid me and what I spent, from the opening balance (Dr Raghu, 12 Oct 2026: "the service person can see it himself"). */
import { useEffect, useState } from "react";

type Line = { date: string; no: string; kind: string; text: string; spent: number; received: number; balance: number };
type Ent = { no: string; kind: string; on_date: string; amount: number; status: string; paid_on: string | null; description: string };
const inr = (n: number) => "₹" + Math.round(Number(n) || 0).toLocaleString("en-IN");
const dmy = (d?: string | null) => (d ? new Date(d.slice(0, 10) + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "2-digit" }) : "—");
const ST: Record<string, string> = { sent: "With accounts", approved: "Approved", paid: "Paid", dropped: "Dropped" };

export default function MyLedger() {
  const [d, setD] = useState<{ installed: boolean; me: { name: string }; from: string; opening: number; received: number; spent: number; balance: number; lines: Line[]; entries: Ent[] } | null>(null);
  useEffect(() => { fetch("/api/idp/ledger", { cache: "no-store" }).then((r) => r.json()).then(setD).catch(() => setD(null)); }, []);
  return (
    <div style={{ minHeight: "100vh", background: "#F6F4EF", color: "#1B2A41", fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif" }}>
      <div style={{ background: "#1B2A41", color: "#fff", padding: "12px 16px", display: "flex", gap: 10, alignItems: "center" }}>
        <a href="/idp" style={{ color: "#fff", textDecoration: "none", fontWeight: 700 }}>← IDP</a><b style={{ marginLeft: 6 }}>My advances & expenses</b><span style={{ marginLeft: "auto", fontSize: 13, opacity: 0.85 }}>{d?.me?.name}</span>
      </div>
      <div style={{ maxWidth: 560, margin: "0 auto", padding: 16 }}>
        {!d && <div style={{ color: "#6B7280", padding: 30, textAlign: "center" }}>Opening…</div>}
        {d && !d.installed && <div style={{ color: "#B3392E", fontWeight: 700 }}>Not set up yet.</div>}
        {d && d.installed && (
          <>
            <div style={{ background: "#fff", borderRadius: 14, padding: 16, border: "1px solid #E2E0DA", textAlign: "center" }}>
              <div style={{ fontSize: 13, color: "#6B7280" }}>Balance since {dmy(d.from)}</div>
              <div style={{ fontSize: 30, fontWeight: 800, color: d.balance < 0 ? "#B3392E" : "#1B2A41" }}>{inr(d.balance)}</div>
              <div style={{ fontSize: 12.5, color: "#6B7280" }}>{d.balance > 0 ? "still with you — to be shown as expenses" : d.balance < 0 ? "the company owes you this" : "all square"}</div>
              <div style={{ display: "flex", justifyContent: "space-around", marginTop: 10, fontSize: 13 }}><span>Opening <b>{inr(d.opening)}</b></span><span style={{ color: "#15803D" }}>Received <b>{inr(d.received)}</b></span><span style={{ color: "#B3392E" }}>Spent <b>{inr(d.spent)}</b></span></div>
            </div>
            <div style={{ marginTop: 14, background: "#fff", borderRadius: 10, border: "1px solid #E2E0DA", overflow: "hidden" }}>
              {[...d.lines].reverse().map((x, i) => (
                <div key={i} style={{ display: "flex", padding: "8px 12px", borderBottom: "1px solid #EEE", fontSize: 13.5, gap: 8 }}>
                  <span style={{ width: 74, color: "#6B7280" }}>{dmy(x.date)}</span>
                  <span style={{ flex: 1 }}><b>{x.kind}</b>{x.text ? <span style={{ color: "#6B7280" }}> · {x.text}</span> : null}</span>
                  <span style={{ fontWeight: 700, color: x.received ? "#15803D" : "#B3392E" }}>{x.received ? `+${inr(x.received)}` : `−${inr(x.spent)}`}</span>
                </div>
              ))}
              {d.lines.length === 0 && <div style={{ padding: 12, color: "#6B7280", fontSize: 14 }}>Nothing since {dmy(d.from)} yet.</div>}
            </div>
            {d.entries.some((e) => e.status !== "paid" && e.status !== "dropped") && (
              <>
                <div style={{ marginTop: 16, fontWeight: 800 }}>Waiting with accounts</div>
                {d.entries.filter((e) => e.status !== "paid" && e.status !== "dropped").map((e) => <div key={e.no} style={{ display: "flex", gap: 8, fontSize: 13.5, padding: "6px 2px" }}><span style={{ flex: 1 }}>{e.kind} · {dmy(e.on_date)}{e.description ? ` · ${e.description}` : ""}</span><b>{inr(e.amount)}</b><span style={{ color: "#2563EB" }}>{ST[e.status]}</span></div>)}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
