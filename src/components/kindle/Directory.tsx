"use client";
import { useMemo, useState } from "react";
import { api, Avatar, btn, Card, dmy, inr, K, monthYear, pill, ROLE_LABEL, serif, type Boot, type Member } from "./shared";

/**
 * The Directory: the ten as cards; one member's page with company, phones,
 * family, the attendance strip across every meeting, lateness and fines;
 * and the matrix — every member against every meeting — the sheet's own
 * Directory tab, computed from the record.
 */
export default function Directory({ boot, arg, go, reload }: { boot: Boot; arg: string | null; go: (k: string, a?: string | null) => void; reload?: () => void }) {
  const [view, setView] = useState<"cards" | "matrix">("cards");
  const members = boot.members.filter((m) => m.active);
  const open = arg ? boot.members.find((m) => m.id === arg) : null;
  if (open) return <MemberPage boot={boot} m={open} back={() => go("directory")} />;
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
        <h1 style={{ ...serif, fontSize: 26, margin: 0 }}>Directory</h1>
        <span style={{ color: K.muted, fontSize: 13 }}>{members.length} members</span>
        <div style={{ flex: 1 }} />
        <div style={{ display: "flex", border: `1px solid ${K.line}`, borderRadius: 10, overflow: "hidden" }}>
          {(["cards", "matrix"] as const).map((v) => <button key={v} onClick={() => setView(v)} style={{ border: "none", padding: "6px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer", background: view === v ? K.charcoal : "#fff", color: view === v ? "#fff" : K.ink }}>{v === "cards" ? "Members" : "Attendance"}</button>)}
        </div>
      </div>
      {view === "cards" ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
          {members.map((m) => { const t = boot.tally[m.id]; const due = boot.due[m.id] || 0; return (
            <button key={m.id} onClick={() => go("directory", m.id)} style={{ textAlign: "left", background: "#fff", border: `1px solid ${K.line}`, borderRadius: 14, padding: 14, cursor: "pointer" }}>
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <Avatar m={m} size={52} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ ...serif, fontSize: 17 }}>{m.name}</div>
                  <div style={{ fontSize: 12, color: K.dim, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.company || "—"}</div>
                  <div style={{ fontSize: 11, color: K.muted }}>{m.sector || ""}</div>
                </div>
              </div>
              <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
                {m.roles.map((r) => <span key={r} style={pill(K.amber, K.ink)}>{ROLE_LABEL[r] || r}</span>)}
                {m.is_admin && <span style={pill(K.charcoal, K.amber)}>Admin</span>}
                {t && <span style={pill(K.soft, K.dim)}>{t.present}/{t.out_of} present</span>}
                {t && t.late > 0 && <span style={pill("#fde7cf", K.emberDark)}>{t.late} late</span>}
                {due > 0 && <span style={pill("#fbe3e1", K.red)}>{inr(due)} due</span>}
              </div>
            </button>
          ); })}
        </div>
      ) : <Matrix boot={boot} members={members} go={go} reload={reload} />}
    </div>
  );
}

const mark = (s?: string, late?: number) => s === "present" ? (late ? "L" : "P") : s === "zoom" ? "Z" : s === "absent" ? "A" : s === "excused" ? "E" : "·";
const colour = (c: string) => c === "P" ? K.green : c === "Z" ? K.blue : c === "L" ? K.ember : c === "A" ? K.red : c === "E" ? K.muted : K.line;

function Matrix({ boot, members, go, reload }: { boot: Boot; members: Member[]; go: (k: string, a?: string | null) => void; reload?: () => void }) {
  const held = boot.meetings.filter((m) => m.meeting_on <= boot.today && m.status !== "cancelled");
  const att = useMemo(() => { const x = new Map<string, { status: string; late_min: number }>(); for (const a of boot.attendance) x.set(`${a.meeting_id}:${a.member_id}`, a); return x; }, [boot.attendance]);
  const mayEdit = boot.me.admin || boot.me.roles.includes("scribe");
  const [editing, setEditing] = useState(false);
  const [changes, setChanges] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const CYCLE = ["present", "absent", "zoom", "excused", ""];
  const cellStatus = (mid: string, memid: string) => { const key = `${mid}:${memid}`; return key in changes ? changes[key] : (att.get(key)?.status || ""); };
  const click = (mid: string, memid: string) => { if (!editing) return; const key = `${mid}:${memid}`; const cur = cellStatus(mid, memid); const next = CYCLE[(CYCLE.indexOf(cur) + 1) % CYCLE.length]; setChanges({ ...changes, [key]: next }); };
  const submit = async () => {
    setBusy(true);
    try {
      for (const [key, status] of Object.entries(changes)) {
        const [meeting_id, member_id] = key.split(":");
        const before = att.get(key)?.status || "";
        if (status === before) continue;
        if (!status) continue; /* clearing a mark is not offered; set excused instead */
        await api("/api/kindle/meetings", { action: "mark", meeting_id, member_id, status, late_min: att.get(key)?.late_min || 0 });
      }
      setChanges({}); setEditing(false); reload?.();
    } catch (e) { alert(String((e as Error).message || e)); }
    setBusy(false);
  };
  const short = (d: string) => { const [y, m] = d.split("-"); return `${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][Number(m) - 1]} ${y.slice(2)}`; };
  return (
    <Card title="Every member, every meeting" right={<span style={{ display: "flex", gap: 8, alignItems: "center" }}><span>P present · Z Zoom · L late · A absent · E excused · dot: no record</span>{mayEdit && !editing && <button onClick={() => setEditing(true)} style={btn("ghost", { padding: "4px 10px" })}>Change attendance</button>}{editing && <><button onClick={submit} disabled={busy || !Object.keys(changes).length} style={btn("primary", { padding: "4px 12px" })}>{busy ? "Saving…" : `Submit ${Object.keys(changes).length || ""}`}</button><button onClick={() => { setEditing(false); setChanges({}); }} style={btn("ghost", { padding: "4px 10px" })}>Cancel</button></>}</span>}>
      {editing && <div style={{ fontSize: 12, color: K.emberDark, marginBottom: 8 }}>Tap a cell to cycle present → absent → Zoom → excused; Submit writes the changes and strikes nothing else. Late minutes are set on the meeting's own page.</div>}
      <div className="genie-scroll" style={{ maxHeight: "70vh" }}>
        <table className="genie-table nowrap" style={{ fontSize: 12 }}>
          <thead><tr><th style={{ position: "sticky", left: 0, zIndex: 3, background: K.charcoal }}>Member</th><th className="num" style={{ background: K.charcoal }}>P / A</th>{held.map((m) => <th key={m.id} style={{ background: K.charcoal, padding: "6px 4px", fontWeight: 500, fontSize: 10, cursor: "pointer", textAlign: "center", lineHeight: 1.1 }} onClick={() => go("meetings", m.id)} title={`${dmy(m.meeting_on)}${m.kind !== "monthly" ? ` · ${m.title || m.kind}` : ""}`}>{short(m.meeting_on)}{m.kind !== "monthly" ? <><br /><span style={{ color: K.amber }}>{m.kind === "outbound" ? "out" : m.kind}</span></> : ""}</th>)}</tr></thead>
          <tbody>
            {members.map((mem) => { const t = boot.tally[mem.id]; return (
              <tr key={mem.id}>
                <td style={{ position: "sticky", left: 0, background: "#fff", fontWeight: 700, cursor: "pointer" }} onClick={() => go("directory", mem.id)}>{mem.short_name || mem.name}</td>
                <td className="num">{t ? `${t.present} / ${t.absent}` : "—"}</td>
                {held.map((m) => { const key = `${m.id}:${mem.id}`; const a = att.get(key); const st = cellStatus(m.id, mem.id); const c = mark(st || undefined, key in changes ? 0 : a?.late_min); const changed = key in changes && changes[key] !== (a?.status || ""); return <td key={m.id} onClick={() => click(m.id, mem.id)} style={{ textAlign: "center", padding: "4px 2px", cursor: editing ? "pointer" : "default", outline: changed ? `2px solid ${K.amber}` : undefined }} title={a ? `${a.status}${a.late_min ? `, ${a.late_min} min late` : ""}` : "no record"}><span style={{ display: "inline-block", width: 20, height: 20, lineHeight: "20px", borderRadius: 5, background: c === "·" ? (editing ? K.soft : "transparent") : colour(c), color: c === "·" ? K.line : "#fff", fontSize: 11, fontWeight: 700 }}>{c}</span></td>; })}
              </tr>
            ); })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function MemberPage({ boot, m, back }: { boot: Boot; m: Member; back: () => void }) {
  const t = boot.tally[m.id];
  const held = boot.meetings.filter((x) => x.meeting_on <= boot.today && x.status !== "cancelled");
  const mine = new Map(boot.attendance.filter((a) => a.member_id === m.id).map((a) => [a.meeting_id, a]));
  const fines = boot.fines.filter((f) => f.member_id === m.id).sort((a, b) => b.levied_on.localeCompare(a.levied_on));
  const fam = boot.family.filter((f) => f.member_id === m.id);
  const byYear = new Map<string, typeof held>();
  for (const h of held) { const y = h.meeting_on.slice(0, 4); byYear.set(y, [...(byYear.get(y) || []), h]); }
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <button onClick={back} style={{ background: "none", border: "none", color: K.emberDark, fontWeight: 700, cursor: "pointer", textAlign: "left", padding: 0, fontSize: 13 }}>← Directory</button>
      <Card>
        <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
          <Avatar m={m} size={84} />
          <div style={{ flex: 1, minWidth: 220 }}>
            <h1 style={{ ...serif, fontSize: 26, margin: 0 }}>{m.name}</h1>
            <div style={{ color: K.dim }}>{[m.designation, m.company].filter(Boolean).join(", ") || "—"}</div>
            <div style={{ color: K.muted, fontSize: 13 }}>{m.sector || ""}</div>
            <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
              {m.roles.map((r) => <span key={r} style={pill(K.amber, K.ink)}>{ROLE_LABEL[r] || r}</span>)}
              {m.is_admin && <span style={pill(K.charcoal, K.amber)}>Admin</span>}
              {m.joined_on && <span style={pill(K.soft, K.dim)}>since {monthYear(m.joined_on)}</span>}
            </div>
          </div>
          <div style={{ fontSize: 13, lineHeight: 1.9, color: K.dim }}>
            <div>✉ <a href={`mailto:${m.email}`} style={{ color: K.blue }}>{m.email}</a></div>
            {m.phone && <div>☎ <a href={`tel:${m.phone}`} style={{ color: K.blue }}>{m.phone}</a> · <a href={`https://wa.me/91${m.phone.replace(/\D/g, "").slice(-10)}`} target="_blank" rel="noreferrer" style={{ color: K.green }}>WhatsApp</a></div>}
            {m.linkedin && <div>in <a href={m.linkedin.startsWith("http") ? m.linkedin : `https://${m.linkedin}`} target="_blank" rel="noreferrer" style={{ color: K.blue }}>LinkedIn</a></div>}
            {m.birthday && <div>🎂 {dmy(m.birthday).slice(0, -5)}</div>}
            {m.stay_at && <div>🏠 {m.stay_at}</div>}
            {m.office_at && <div>🏢 {m.office_at}</div>}
          </div>
        </div>
        {m.about && <p style={{ marginTop: 14, color: K.ink, lineHeight: 1.6 }}>{m.about}</p>}
      </Card>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16 }}>
        <Card title="Attendance" right={t ? `${t.present} of ${t.out_of} on record` : undefined}>
          {[...byYear.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([y, ms]) => (
            <div key={y} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <span style={{ width: 36, fontSize: 12, color: K.muted }}>{y}</span>
              <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
                {ms.map((h) => { const a = mine.get(h.id); const c = mark(a?.status, a?.late_min); return <span key={h.id} title={`${dmy(h.meeting_on)}${a ? ` — ${a.status}${a.late_min ? `, ${a.late_min} min late` : ""}` : " — no record"}`} style={{ width: 18, height: 18, borderRadius: 4, background: c === "·" ? K.soft : colour(c), display: "inline-block" }} />; })}
              </div>
            </div>
          ))}
          <div style={{ fontSize: 11, color: K.muted, marginTop: 6 }}>Green present · blue on Zoom · orange late · red absent · pale: no record in the sheet.</div>
          {t && <div style={{ marginTop: 8, fontSize: 13, color: K.dim }}>{t.late ? `Late ${t.late} time${t.late > 1 ? "s" : ""}, ${t.late_min} minutes in all. ` : "Never late on record. "}{t.year_absent ? `${t.year_absent} absence${t.year_absent > 1 ? "s" : ""} this year.` : "No absence this year."}</div>}
        </Card>
        <Card title="Fines" right={inr(boot.due[m.id] || 0) + " due"}>
          {fines.length ? (
            <table className="genie-table" style={{ fontSize: 12 }}><thead><tr><th>Date</th><th>For</th><th className="num">₹</th><th>Paid</th></tr></thead>
              <tbody>{fines.map((f) => <tr key={f.id}><td>{dmy(f.levied_on)}</td><td>{f.reason || f.rule_code}</td><td className="num">{Number(f.amount).toLocaleString("en-IN")}</td><td>{f.waived ? "waived" : f.paid_on ? dmy(f.paid_on) : <span style={{ color: K.red }}>due</span>}</td></tr>)}</tbody></table>
          ) : <div style={{ color: K.muted, fontSize: 13 }}>None on record. Fines are struck from the constitution's slabs when the scribe marks late minutes; the treasurer marks them paid.</div>}
        </Card>
        <Card title="Family" right={fam.length ? `${fam.length}` : undefined}>
          {fam.length ? <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.8, fontSize: 13 }}>{fam.map((f) => <li key={f.id}><b>{f.name}</b> <span style={{ color: K.muted }}>· {f.relation}{f.birthday ? ` · ${dmy(f.birthday).slice(0, -5)}` : ""}</span></li>)}</ul> : <div style={{ color: K.muted, fontSize: 13 }}>Not filled in yet{m.id === boot.me.id ? " — it is on your profile, from the account menu." : "."}</div>}
        </Card>
      </div>
    </div>
  );
}
