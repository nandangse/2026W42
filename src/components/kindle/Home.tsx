"use client";
import { KINDLE_VERSION } from "@/lib/kindle/version";
import { Avatar, Card, dayName, dmy, inr, K, pill, serif, type Boot } from "./shared";

/** Home: the next meeting, the room, birthdays this month, fines due, the WhatsApp door. */
export default function Home({ boot, go }: { boot: Boot; go: (k: string, a?: string | null) => void }) {
  const me = boot.me;
  const hour = new Date().getHours();
  const greet = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const next = boot.next;
  const isToday = next && next.meeting_on === boot.today;
  const myTally = boot.tally[me.id];
  const myDue = boot.due[me.id] || 0;
  const roles = boot.members.filter((m) => m.roles.length || m.is_admin);
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div>
        <h1 style={{ ...serif, fontSize: 28, margin: 0 }}>{greet}, {me.short_name || me.name.split(" ")[0]}.</h1>
        <p style={{ margin: "4px 0 0", color: K.dim }}>Kindle · Ascent Trust Group, Mumbai · ten of us since January 2023.</p>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16 }}>
        <Card title={isToday ? "Today's meeting" : "Next meeting"} right={next ? dayName(next.meeting_on) : undefined} style={{ borderColor: isToday ? K.ember : K.line }}>
          {next ? (
            <>
              <div style={{ ...serif, fontSize: 24 }}>{dmy(next.meeting_on)}</div>
              <div style={{ color: K.dim, fontSize: 13, marginTop: 2 }}>{(next.starts_at || "15:00").slice(0, 5)} to {(next.ends_at || "19:00").slice(0, 5)} · {next.venue || boot.settings.meeting_venue || "venue to be set"}{next.guru ? ` · Knowledge Guru: ${next.guru}` : ""}</div>
              {!next.date_exact && <div style={{ fontSize: 11, color: K.muted, marginTop: 4 }}>Date from the calendar rule; the facilitator confirms it.</div>}
              <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button onClick={() => go("meetings", next.id)} style={lnk}>Agenda and attendance →</button>
                <button onClick={() => go("checkins")} style={lnk}>My check-in →</button>
              </div>
            </>
          ) : <div style={{ color: K.muted }}>No meeting planned. The facilitator sets the calendar in January.</div>}
        </Card>
        <Card title="My year" right={String(new Date().getFullYear())}>
          {myTally ? (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <Stat n={myTally.present} l="meetings attended" />
              <Stat n={myTally.year_absent} l="absences this year" warn={myTally.year_absent >= 2} />
              <Stat n={myTally.late} l="times late" />
              <Stat n={inr(myDue)} l="fines due" warn={myDue > 0} />
            </div>
          ) : <div style={{ color: K.muted }}>No attendance on record yet.</div>}
          <div style={{ fontSize: 11, color: K.muted, marginTop: 8 }}>Computed from the meeting record, never typed. Two absences a year are allowed; the third carries a fine of ₹15,000.</div>
        </Card>
        <Card title="Birthdays this month">
          {boot.birthdays.length ? (
            <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.8 }}>
              {boot.birthdays.map((b, i) => <li key={i}><b>{b.who}</b>{b.of ? <span style={{ color: K.muted }}> · {b.relation} of {b.of}</span> : ""} <span style={{ color: K.dim }}>· {dmy(`2000-${b.on}`).slice(0, -5)}</span></li>)}
            </ul>
          ) : <div style={{ color: K.muted }}>None on record this month. Birthdays come from each member's profile; fill yours in from the account menu.</div>}
        </Card>
      </div>
      <Card title="The room" right={`${boot.members.filter((m) => m.active).length} members`}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 10 }}>
          {boot.members.filter((m) => m.active).map((m) => (
            <button key={m.id} onClick={() => go("directory", m.id)} style={{ display: "flex", alignItems: "center", gap: 10, background: K.soft, border: "none", borderRadius: 12, padding: 10, cursor: "pointer", textAlign: "left" }}>
              <Avatar m={m} size={38} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.short_name || m.name}</div>
                <div style={{ fontSize: 11, color: K.muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.company || ""}</div>
              </div>
            </button>
          ))}
        </div>
        <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          {roles.map((m) => <span key={m.id} style={{ fontSize: 12, color: K.dim }}><b>{m.short_name || m.name}</b> · {[...m.roles.map((r) => ({ facilitator: "Facilitator", co_facilitator: "Co-facilitator", treasurer: "Treasurer", scribe: "Scribe", timekeeper: "Time keeper" } as Record<string, string>)[r] || r), ...(m.is_admin ? ["Admin"] : [])].join(", ")}</span>)}
        </div>
      </Card>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16 }}>
        <Card title="WhatsApp">
          {boot.settings.whatsapp_link ? <a href={boot.settings.whatsapp_link} target="_blank" rel="noreferrer" style={{ ...lnk, display: "inline-block", textDecoration: "none" }}>Open the Kindle group →</a> : <span style={{ color: K.muted }}>Link not set.</span>}
          <div style={{ fontSize: 12, color: K.muted, marginTop: 8 }}>Notices of delay or absence go there at least 24 hours before, per 4.11.</div>
        </Card>
        <Card title="Last meeting">
          {boot.last ? (<>
            <div style={{ ...serif, fontSize: 18 }}>{dmy(boot.last.meeting_on)}</div>
            <div style={{ fontSize: 13, color: K.dim, marginTop: 4 }}>{boot.attendance.filter((a) => a.meeting_id === boot.last!.id && a.status !== "absent").length} present · {boot.last.minutes ? "minutes written" : "minutes not yet written"}</div>
            <button onClick={() => go("meetings", boot.last!.id)} style={{ ...lnk, marginTop: 8 }}>Open →</button>
          </>) : <span style={{ color: K.muted }}>—</span>}
        </Card>
        <Card title="Our purpose">
          <p style={{ margin: 0, fontStyle: "italic", color: K.dim, lineHeight: 1.6 }}>“To create an environment that leads to collaborative growth through experience sharing, mutual trust and transparent feedback.”</p>
          <div style={{ marginTop: 8 }}><span style={pill(K.charcoal, K.amber)}>Don't advise · share from experience · listen · don't judge</span></div>
        </Card>
      </div>
      <div style={{ fontSize: 11, color: K.muted, textAlign: "right" }}>Kindle {KINDLE_VERSION}</div>
    </div>
  );
}
const lnk: React.CSSProperties = { background: "none", border: "none", color: K.emberDark, fontWeight: 700, fontSize: 13, cursor: "pointer", padding: 0 };
function Stat({ n, l, warn }: { n: number | string; l: string; warn?: boolean }) {
  return <div style={{ background: K.soft, borderRadius: 10, padding: "8px 10px" }}><div style={{ ...serif, fontSize: 22, color: warn ? K.red : K.ink }}>{n}</div><div style={{ fontSize: 11, color: K.muted }}>{l}</div></div>;
}
