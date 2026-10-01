"use client";
import { useEffect, useMemo, useState } from "react";
import { api, btn, Card, dmy, inr, input, K, label, monthYear, pill, serif, type Boot } from "./shared";

interface Entry { id: string; entry_on: string; kind: string; member_id: string | null; meeting_id: string | null; fine_id: string | null; head: string | null; amount: number; note: string | null; created_by: string | null }
interface Budget { id: string; year: number; head: string; amount: number; note: string | null }
interface Fine { id: string; member_id: string; meeting_id: string | null; rule_code: string | null; amount: number; reason: string | null; levied_on: string; paid_on: string | null; paid_amount: number | null; waived: boolean }
interface Rule { code: string; label: string; amount: number }
interface Data { ledger: Entry[]; budget: Budget[]; fines: Fine[]; rules: Rule[] }
const KIND: Record<string, [string, string]> = { opening: ["Opening", K.muted], collection: ["Collection", K.green], fine: ["Fine", K.ember], expense: ["Expense", K.red], adjustment: ["Adjustment", K.blue] };

/** Finances: the ledger month by month, fines due and paid, the year's budget. The treasurer writes; everyone reads. */
export default function Finances({ boot }: { boot: Boot }) {
  const [d, setD] = useState<Data | null>(null);
  const load = () => api<Data>("/api/kindle/finances").then(setD).catch(() => setD({ ledger: [], budget: [], fines: [], rules: [] }));
  useEffect(() => { load(); }, []);
  const may = boot.me.treasurer;
  const name = (id: string | null) => boot.members.find((m) => m.id === id)?.short_name || "";
  const year = new Date().getFullYear();
  const months = useMemo(() => {
    if (!d) return [];
    const by = new Map<string, { in: number; out: number; fines: number }>();
    for (const e of d.ledger) { const k = e.entry_on.slice(0, 7); const r = by.get(k) || { in: 0, out: 0, fines: 0 }; if (e.kind === "expense" || (e.kind === "adjustment" && e.amount < 0)) r.out += Math.abs(Number(e.amount)); else if (e.kind === "fine") r.fines += Number(e.amount); else r.in += Number(e.amount); by.set(k, r); }
    return [...by.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [d]);
  const balance = d ? d.ledger.reduce((s, e) => s + Number(e.amount), 0) : 0;
  const due = d ? d.fines.filter((f) => !f.waived && !f.paid_on) : [];
  const [tab, setTab] = useState<"ledger" | "fines" | "budget">("ledger");
  if (!d) return <Card><span style={{ color: K.muted }}>Loading…</span></Card>;
  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h1 style={{ ...serif, fontSize: 26, margin: 0 }}>Finances</h1>
        <div style={{ display: "flex", border: `1px solid ${K.line}`, borderRadius: 10, overflow: "hidden" }}>
          {([["ledger", "Month by month"], ["fines", `Fines${due.length ? ` · ${due.length} due` : ""}`], ["budget", `Budget ${year}`]] as const).map(([k, l]) => <button key={k} onClick={() => setTab(k)} style={{ border: "none", padding: "6px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer", background: tab === k ? K.charcoal : "#fff", color: tab === k ? "#fff" : K.ink }}>{l}</button>)}
        </div>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 13, color: K.dim }}>In hand <b style={{ ...serif, fontSize: 18, color: balance >= 0 ? K.green : K.red }}>{inr(balance)}</b>{d.ledger.length === 0 ? " · placeholder until Niraj enters the opening balance" : ""}</span>
      </div>
      {tab === "ledger" && <Ledger d={d} boot={boot} may={may} months={months} name={name} reload={load} />}
      {tab === "fines" && <Fines d={d} boot={boot} may={may} name={name} reload={load} />}
      {tab === "budget" && <BudgetView d={d} may={may} year={year} reload={load} />}
    </div>
  );
}

function Ledger({ d, boot, may, months, name, reload }: { d: Data; boot: Boot; may: boolean; months: [string, { in: number; out: number; fines: number }][]; name: (id: string | null) => string; reload: () => void }) {
  const [f, setF] = useState({ entry_on: boot.today, kind: "collection", amount: "", head: "", note: "", member_id: "" });
  const [adding, setAdding] = useState(false);
  const add = async () => { try { await api("/api/kindle/finances", { action: "entry", ...f }); setAdding(false); setF({ ...f, amount: "", note: "" }); reload(); } catch (e) { alert(String((e as Error).message || e)); } };
  return (
    <div style={{ display: "grid", gap: 12 }}>
      {may && <div><button onClick={() => setAdding(!adding)} style={btn(adding ? "ghost" : "primary")}>{adding ? "Close" : "+ Entry"}</button></div>}
      {adding && (
        <Card title="A ledger entry" right="collections and fines come in; expenses go out">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8 }}>
            <div><label style={label}>Date</label><input style={input} type="date" value={f.entry_on} onChange={(e) => setF({ ...f, entry_on: e.target.value })} /></div>
            <div><label style={label}>Kind</label><select style={input} value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>{Object.entries(KIND).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}</select></div>
            <div><label style={label}>Amount ₹</label><input style={input} type="number" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></div>
            <div><label style={label}>Head</label><input style={input} value={f.head} onChange={(e) => setF({ ...f, head: e.target.value })} placeholder="Venue, food, speaker, annual fee…" /></div>
            <div><label style={label}>Member (if any)</label><select style={input} value={f.member_id} onChange={(e) => setF({ ...f, member_id: e.target.value })}><option value="">—</option>{boot.members.map((m) => <option key={m.id} value={m.id}>{m.short_name || m.name}</option>)}</select></div>
            <div style={{ gridColumn: "span 2" }}><label style={label}>Note</label><input style={input} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></div>
          </div>
          <div style={{ marginTop: 10 }}><button onClick={add} style={btn("primary")}>Book it</button></div>
        </Card>
      )}
      <Card title="Month by month">
        {months.length === 0 ? <span style={{ color: K.muted, fontSize: 13 }}>Nothing booked yet. The treasurer starts with an Opening entry for the balance in hand, then the month's collections and expenses.</span> : (
          <table className="genie-table" style={{ fontSize: 13 }}><thead><tr><th>Month</th><th className="num">Collections</th><th className="num">Fines</th><th className="num">Expenses</th><th className="num">Net</th></tr></thead>
            <tbody>{months.map(([m, r]) => <tr key={m}><td>{monthYear(m + "-01")}</td><td className="num">{inr(r.in)}</td><td className="num">{inr(r.fines)}</td><td className="num">{inr(r.out)}</td><td className="num" style={{ color: r.in + r.fines - r.out >= 0 ? K.green : K.red }}>{inr(r.in + r.fines - r.out)}</td></tr>)}</tbody></table>
        )}
      </Card>
      <Card title="Entries" right={`${d.ledger.length}`}>
        {d.ledger.length > 0 && <table className="genie-table" style={{ fontSize: 12 }}><thead><tr><th>Date</th><th>Kind</th><th>Head</th><th>Member</th><th>Note</th><th className="num">₹</th>{may && <th />}</tr></thead>
          <tbody>{d.ledger.map((e) => <tr key={e.id}><td>{dmy(e.entry_on)}</td><td><span style={pill(KIND[e.kind]?.[1] || K.muted)}>{KIND[e.kind]?.[0] || e.kind}</span></td><td>{e.head}</td><td>{name(e.member_id)}</td><td>{e.note}</td><td className="num" style={{ color: Number(e.amount) < 0 ? K.red : K.ink }}>{Number(e.amount).toLocaleString("en-IN")}</td>{may && <td>{!e.fine_id && <button onClick={async () => { if (confirm("Remove this entry?")) { await api("/api/kindle/finances", { action: "remove", id: e.id }); reload(); } }} style={{ ...btn("ghost", { padding: "2px 8px", fontSize: 11 }) }}>✕</button>}</td>}</tr>)}</tbody></table>}
      </Card>
    </div>
  );
}

function Fines({ d, boot, may, name, reload }: { d: Data; boot: Boot; may: boolean; name: (id: string | null) => string; reload: () => void }) {
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState({ member_id: "", rule_code: "", amount: "", reason: "", meeting_id: "", levied_on: boot.today });
  const add = async () => { try { await api("/api/kindle/finances", { action: "fine_add", ...f, amount: f.amount || null }); setAdding(false); reload(); } catch (e) { alert(String((e as Error).message || e)); } };
  const pay = async (x: Fine) => { const amt = prompt(`Amount received from ${name(x.member_id)}`, String(x.amount)); if (amt == null) return; await api("/api/kindle/finances", { action: "fine_pay", fine_id: x.id, paid_amount: Number(amt), paid_on: boot.today }); reload(); };
  const dueBy = useMemo(() => { const t: Record<string, number> = {}; for (const x of d.fines) if (!x.waived) t[x.member_id] = (t[x.member_id] || 0) + Number(x.amount) - Number(x.paid_amount || 0); return t; }, [d]);
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <Card title="Due by member" right="from the constitution's slabs; the treasurer marks paid">
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{boot.members.filter((m) => m.active).map((m) => <span key={m.id} style={pill(dueBy[m.id] > 0 ? "#fbe3e1" : K.soft, dueBy[m.id] > 0 ? K.red : K.dim)}>{m.short_name || m.name} · {inr(dueBy[m.id] || 0)}</span>)}</div>
        {(boot.me.admin || may) && <div style={{ marginTop: 10 }}><button onClick={() => setAdding(!adding)} style={btn(adding ? "ghost" : "primary")}>{adding ? "Close" : "+ Levy a fine"}</button></div>}
        {adding && (
          <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 8, alignItems: "end" }}>
            <div><label style={label}>Member</label><select style={input} value={f.member_id} onChange={(e) => setF({ ...f, member_id: e.target.value })}><option value="">—</option>{boot.members.filter((m) => m.active).map((m) => <option key={m.id} value={m.id}>{m.short_name || m.name}</option>)}</select></div>
            <div><label style={label}>Rule</label><select style={input} value={f.rule_code} onChange={(e) => { const r = d.rules.find((x) => x.code === e.target.value); setF({ ...f, rule_code: e.target.value, amount: r ? String(r.amount) : f.amount, reason: r ? r.label : f.reason }); }}><option value="">—</option>{d.rules.map((r) => <option key={r.code} value={r.code}>{r.label} · {inr(r.amount)}</option>)}</select></div>
            <div><label style={label}>Amount ₹</label><input style={input} type="number" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></div>
            <div><label style={label}>Meeting</label><select style={input} value={f.meeting_id} onChange={(e) => setF({ ...f, meeting_id: e.target.value })}><option value="">—</option>{[...boot.meetings].reverse().slice(0, 24).map((m) => <option key={m.id} value={m.id}>{dmy(m.meeting_on)}</option>)}</select></div>
            <div style={{ gridColumn: "span 2" }}><label style={label}>Reason</label><input style={input} value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} /></div>
            <button onClick={add} style={btn("primary")}>Levy</button>
          </div>
        )}
      </Card>
      <Card title="Every fine" right={`${d.fines.length}`}>
        {d.fines.length === 0 ? <span style={{ color: K.muted, fontSize: 13 }}>None on record. Late minutes marked on a meeting strike the fine automatically.</span> : (
          <table className="genie-table" style={{ fontSize: 12 }}><thead><tr><th>Date</th><th>Member</th><th>For</th><th className="num">₹</th><th>Status</th>{may && <th />}</tr></thead>
            <tbody>{d.fines.map((x) => <tr key={x.id}><td>{dmy(x.levied_on)}</td><td>{name(x.member_id)}</td><td>{x.reason || x.rule_code}</td><td className="num">{Number(x.amount).toLocaleString("en-IN")}</td><td>{x.waived ? <span style={pill(K.muted)}>waived</span> : x.paid_on ? <span style={pill(K.green)}>paid {dmy(x.paid_on)}</span> : <span style={pill(K.red)}>due</span>}</td>{may && <td style={{ whiteSpace: "nowrap" }}>{!x.paid_on && !x.waived && <button onClick={() => pay(x)} style={{ ...btn("ghost", { padding: "2px 8px", fontSize: 11 }) }}>Paid</button>} {!x.paid_on && <button onClick={async () => { await api("/api/kindle/finances", { action: "fine_waive", fine_id: x.id, waived: !x.waived }); reload(); }} style={{ ...btn("ghost", { padding: "2px 8px", fontSize: 11 }) }}>{x.waived ? "Unwaive" : "Waive"}</button>}</td>}</tr>)}</tbody></table>
        )}
      </Card>
    </div>
  );
}

function BudgetView({ d, may, year, reload }: { d: Data; may: boolean; year: number; reload: () => void }) {
  const rows = d.budget.filter((b) => b.year === year);
  const spent = (head: string) => d.ledger.filter((e) => e.kind === "expense" && e.entry_on.startsWith(String(year)) && (e.head || "").toLowerCase() === head.toLowerCase()).reduce((s, e) => s + Math.abs(Number(e.amount)), 0);
  const [f, setF] = useState({ head: "", amount: "", note: "" });
  const save = async () => { try { await api("/api/kindle/finances", { action: "budget", year, ...f }); setF({ head: "", amount: "", note: "" }); reload(); } catch (e) { alert(String((e as Error).message || e)); } };
  return (
    <Card title={`Budget ${year}`} right="the treasurer's annual budget (constitution 5.3); spend reads from the ledger by head">
      {rows.length === 0 ? <span style={{ color: K.muted, fontSize: 13 }}>No budget set for {year}. Heads the constitution names: venue, audio-visual, food, gifts and tokens, speaker fees.</span> : (
        <table className="genie-table" style={{ fontSize: 13 }}><thead><tr><th>Head</th><th className="num">Budget</th><th className="num">Spent</th><th className="num">Left</th><th>Note</th></tr></thead>
          <tbody>{rows.map((b) => { const s = spent(b.head); return <tr key={b.id}><td>{b.head}</td><td className="num">{inr(b.amount)}</td><td className="num">{inr(s)}</td><td className="num" style={{ color: b.amount - s >= 0 ? K.green : K.red }}>{inr(b.amount - s)}</td><td>{b.note}</td></tr>; })}</tbody></table>
      )}
      {may && <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 2fr auto", gap: 8, marginTop: 12, alignItems: "end" }}><div><label style={label}>Head</label><input style={input} value={f.head} onChange={(e) => setF({ ...f, head: e.target.value })} /></div><div><label style={label}>Amount ₹ (0 removes)</label><input style={input} type="number" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></div><div><label style={label}>Note</label><input style={input} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></div><button onClick={save} style={btn("primary")}>Set</button></div>}
    </Card>
  );
}
