"use client";

import { Card, Chip, Empty, Metric, Note, Screen, TableBox, Td, Th, expiryColour, expiryWords, fmtD, useLoad, INK, statusColour } from "./ui";
import type { Boot, Row } from "./types";

interface Dash {
  installed: boolean;
  today?: string;
  expiring?: { haveData: boolean; rows: Row[]; overdue: number };
  tasks?: { haveData: boolean; mine: number; overdue: number; rows: Row[] };
  documents?: { haveData: boolean; total: number; inReview: number; approved: number; draft: number };
  journey?: { haveData: boolean; achieved: number; inProgress: number; target: number };
}

/**
 * The dashboard. Four cards, and then the two lists that actually get acted
 * on: what expires soon, and what is on you today.
 *
 * Every figure goes through <Metric>, which draws "No data" rather than 0
 * when there is nothing entered. A management system that reports zero open
 * nonconformities because nobody has ever raised one is reporting a fiction.
 */
export default function Dashboard({ boot, go }: { boot: Boot; go: (s: string) => void }) {
  const [d, busy, , err] = useLoad<Dash>("/api/ims/dashboard");

  if (err) return <Screen title="Dashboard"><Note kind="error">{err}</Note></Screen>;
  if (busy || !d) return <Screen title="Dashboard"><Empty>Reading…</Empty></Screen>;
  if (!d.installed)
    return (
      <Screen title="Dashboard">
        <Note kind="warn">
          {boot.note || "The IMS database is connected but empty — run supabase-ims/migrations/0001_core.sql and 0002_seed.sql."}
        </Note>
      </Screen>
    );

  const ex = d.expiring!, tk = d.tasks!, dc = d.documents!, jr = d.journey!;

  return (
    <Screen
      title="Dashboard"
      blurb="What expires, what is owed, what is waiting for a signature, and where every certification stands."
    >
      <div className="grid gap-2 mb-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
        <button onClick={() => go("certificates")} className="text-left">
          <Card title="Expiring ≤ 90 days" hint={ex.overdue ? `${ex.overdue} already past` : undefined}>
            <Metric value={ex.rows.length} haveData={ex.haveData} />
          </Card>
        </button>
        <button onClick={() => go("tasks")} className="text-left">
          <Card title="My open tasks" hint={tk.overdue ? `${tk.overdue} overdue` : undefined}>
            <Metric value={tk.mine} haveData={tk.haveData} />
          </Card>
        </button>
        <button onClick={() => go("documents")} className="text-left">
          <Card title="Documents in review" hint={dc.haveData ? `${dc.approved} approved · ${dc.draft} draft` : undefined}>
            <Metric value={dc.inReview} haveData={dc.haveData} />
          </Card>
        </button>
        <button onClick={() => go("certifications")} className="text-left">
          <Card title="Certification journey" hint={jr.haveData ? `${jr.inProgress} underway · ${jr.target} aimed at` : undefined}>
            <Metric value={jr.achieved} haveData={jr.haveData} suffix="achieved" />
          </Card>
        </button>
      </div>

      <div className="text-sm font-bold mb-2" style={{ color: INK }}>Expiring next</div>
      {ex.rows.length === 0 ? (
        <Empty>
          {ex.haveData
            ? "Nothing expires in the next ninety days."
            : "No certificates entered yet — add the ISO certificates, the Factory Licence, the MPCB consent and the Fire NOC first."}
        </Empty>
      ) : (
        <TableBox min={560}>
          <thead><tr><Th>Certificate</Th><Th>Scheme</Th><Th>Expiry</Th><Th>Status</Th></tr></thead>
          <tbody>
            {ex.rows.slice(0, 12).map((c) => (
              <tr key={c.id}>
                <Td wrap>{String(c.title ?? "")}</Td>
                <Td>{String(c.scheme || c.kind || "—")}</Td>
                <Td>{fmtD(c.expiry_date)}</Td>
                <Td><Chip text={expiryWords(c.expiry_date)} colour={expiryColour(c.expiry_date)} /></Td>
              </tr>
            ))}
          </tbody>
        </TableBox>
      )}

      <div className="text-sm font-bold mt-4 mb-2" style={{ color: INK }}>On you</div>
      {tk.rows.length === 0 ? (
        <Empty>{tk.haveData ? "Nothing open against your name." : "No tasks yet."}</Empty>
      ) : (
        <TableBox min={520}>
          <thead><tr><Th>Task</Th><Th>Due</Th><Th>Source</Th><Th>Status</Th></tr></thead>
          <tbody>
            {tk.rows.map((t) => (
              <tr key={t.id}>
                <Td wrap>{String(t.title ?? "")}</Td>
                <Td>{fmtD(t.due_date)}</Td>
                <Td>{String(t.source_type || "manual").replace(/_/g, " ")}</Td>
                <Td><Chip text={String(t.status ?? "")} colour={statusColour(String(t.status ?? ""))} /></Td>
              </tr>
            ))}
          </tbody>
        </TableBox>
      )}
    </Screen>
  );
}
