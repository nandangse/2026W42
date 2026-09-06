"use client";

/**
 * The kitting register (Dr Raghu, 3 Sep 2026: "all these tick boxes that
 * we are doing, as issued, should also tally back into the kitting
 * register"). Every tick on the MRP is a row here: the job, the WIP
 * warehouse it went into, the item, the quantity, the value, who, when —
 * and which issue slip carried it to the store, once submitted.
 */

import GenieTable from "@/components/GenieTable";
import { Screen, Btn, Note, Chip, INK, MUTED, NAVY, GREEN, AMBER, S, useLoad } from "@/components/ims/ui";
import { rupee } from "@/lib/fmt";
const money = (n: unknown) => rupee(n, "·");

interface Issue {
  id: string; job_no: string; warehouse: string; item_code: string; item_name: string; qty: number; uom: string; rate: number | null; amount: number | null;
  rbom_id: string; issued_by: string | null; issued_at: string; slip_no: string; slip_status: string;
}

const fmtAt = (s: string) => new Date(s).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).replace(",", "");
const who = (s: string | null) => (S(s).includes("@") ? S(s).split("@")[0] : S(s)) || "·";

export default function Kitting({ mrp }: { mrp?: string } = {}) {
  const [data, busy, reload, err] = useLoad<{ ok: boolean; rows: Issue[] }>(`/api/saamaan/slip?mode=kitting${mrp ? `&mrp=${encodeURIComponent(mrp)}` : ""}`);
  const rows = data?.rows ?? [];
  const total = rows.reduce((a, r) => a + (Number(r.amount) || 0), 0);
  const unslipped = rows.filter((r) => !r.slip_no).length;
  return (
    <Screen title="Kitting register" blurb="Every issue into a WIP — every tick on the MRP — newest first, with the slip that carried it to the store."
      action={<Btn onClick={reload} disabled={busy}>↻ Re-read</Btn>}>
      {err && <Note kind="error">{err}</Note>}
      <div className="flex gap-4 mb-2 text-xs" style={{ color: MUTED }}>
        <span><b style={{ color: INK }}>{rows.length.toLocaleString("en-IN")}</b> issues</span>
        <span>value <b className="tnum" style={{ color: INK }}>{money(total)}</b></span>
        <span><b style={{ color: unslipped ? AMBER : INK }}>{unslipped}</b> not yet on a slip — Submit to store on the MRP</span>
      </div>
      <GenieTable<Issue>
        rows={data ? rows : null}
        minWidth={1100}
        search={(r, q) => [r.job_no, r.warehouse, r.item_code, r.item_name, r.issued_by, r.slip_no].join(" ").toLowerCase().includes(q)}
        searchPlaceholder="🔍 job, item, who, slip"
        empty="No issue yet — tick a cell on the MRP."
        columns={[
          { key: "at", label: "When", align: "left", sort: (r) => r.issued_at, render: (r) => <span className="tnum">{fmtAt(r.issued_at)}</span> },
          { key: "job", label: "Job", align: "left", sort: (r) => r.job_no, render: (r) => <b style={{ color: NAVY }}>{r.job_no}</b> },
          { key: "wh", label: "Into", align: "left", render: (r) => <span className="text-xs font-bold" style={{ color: "#0F766E" }}>{r.warehouse}</span> },
          { key: "item", label: "Item", align: "left", sort: (r) => r.item_code, render: (r) => <span><b style={{ color: INK }}>{r.item_code}</b> <span style={{ color: MUTED }}>{r.item_name}</span></span> },
          { key: "qty", label: "Qty", align: "right", sort: (r) => Number(r.qty), render: (r) => <span className="tnum font-bold">{Number(r.qty).toLocaleString("en-IN", { maximumFractionDigits: 3 })} <span style={{ color: MUTED, fontWeight: 500 }}>{r.uom}</span></span> },
          { key: "rate", label: "Rate", align: "right", render: (r) => <span className="tnum">{money(r.rate)}</span> },
          { key: "amt", label: "Value", align: "right", sort: (r) => Number(r.amount ?? -1), render: (r) => <span className="tnum">{money(r.amount)}</span> },
          { key: "by", label: "By", align: "left", sort: (r) => who(r.issued_by), render: (r) => who(r.issued_by) },
          { key: "slip", label: "Slip", align: "left", sort: (r) => r.slip_no,
            render: (r) => r.slip_no ? <Chip text={`${r.slip_no} · ${r.slip_status}`} colour={r.slip_status === "done" ? GREEN : NAVY} /> : <span style={{ color: AMBER }}>not submitted</span> },
        ]}
      />
    </Screen>
  );
}
