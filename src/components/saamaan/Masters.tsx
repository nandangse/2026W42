"use client";

/**
 * Masters — the warehouses, and what each one is for (Dr Raghu, 3 Sep
 * 2026: "Make Masters settings. In this show warehouses, and in front of
 * the warehouse remarks. In front of it Type — changeable to stock / wip /
 * vendor. For the purpose of the stock it's ONLY the closing stock in the
 * 'Stock' warehouses!").
 *
 * The names are the ERP's, pulled. The type and the remark are Genie's and
 * survive every pull. On the first pull the type was guessed from the name
 * and the remark says so — a guess is shown to be corrected, not hidden.
 */

import { useState } from "react";
import GenieTable from "@/components/GenieTable";
import { Screen, Btn, Note, INK, MUTED, BORDER, NAVY, GREEN, AMBER, S, useLoad, post } from "@/components/ims/ui";

interface Wh {
  warehouse: string; warehouse_name: string; company: string; parent_warehouse: string; is_group: boolean; disabled: boolean;
  kind: string; remarks: string; kind_by: string | null; kind_at: string | null;
}
const KINDS = ["", "Stock", "WIP", "Vendor"];
const kindColour = (k: string) => (k === "Stock" ? GREEN : k === "WIP" ? AMBER : k === "Vendor" ? "#1B6B93" : MUTED);

export default function Masters() {
  const [data, busy, reload, err] = useLoad<{ installed: boolean; rows: Wh[] }>("/api/saamaan/warehouse");
  const [saving, setSaving] = useState("");
  const [msg, setMsg] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const save = async (warehouse: string, patch: { kind?: string; remarks?: string }) => {
    setSaving(warehouse);
    setMsg("");
    const r = await post("/api/saamaan/warehouse", { warehouse, ...patch });
    setSaving("");
    if (!r.ok) { setMsg(r.error || "Could not save."); return; }
    reload();
  };

  const rows = (data?.rows ?? []).filter((w) => !w.is_group);
  const counts = KINDS.map((k) => [k || "not said", rows.filter((w) => w.kind === k).length] as const);

  return (
    <Screen
      title="Masters — warehouses"
      blurb="Every warehouse the ERP has. The type is Genie's word on what it holds: only Stock warehouses count towards an item's closing stock. Type and remark stay through every pull."
      action={<Btn onClick={reload} disabled={busy}>↻ Re-read</Btn>}>
      {err && <Note kind="error">{err}</Note>}
      {msg && <Note kind="error">{msg}</Note>}
      {data && !data.installed && <Note kind="warn">Run migration 0124 first — the warehouse master doesn&apos;t exist yet. Then pull from the ERP; phase 7 brings the warehouses.</Note>}
      {data?.installed && !rows.length && <Note kind="warn">No warehouses yet — pull from the ERP; phase 7 brings them.</Note>}

      <div className="flex gap-3 mb-2 text-xs flex-wrap" style={{ color: MUTED }}>
        {counts.map(([k, n]) => (
          <span key={k}><b style={{ color: kindColour(k === "not said" ? "" : k) }}>{k}</b> {n}</span>
        ))}
      </div>

      <GenieTable<Wh>
        rows={data ? rows : null}
        minWidth={900}
        search={(w, q) => [w.warehouse, w.kind, w.remarks, w.parent_warehouse].join(" ").toLowerCase().includes(q)}
        searchPlaceholder="🔍 warehouse, type, remark"
        empty="No warehouse matches."
        columns={[
          { key: "wh", label: "Warehouse", align: "left", sort: (w) => w.warehouse,
            render: (w) => <span className="font-bold" style={{ color: w.disabled ? MUTED : INK }}>{w.warehouse}{w.disabled ? " (disabled on the ERP)" : ""}</span> },
          { key: "parent", label: "Under", align: "left", sort: (w) => w.parent_warehouse, render: (w) => <span style={{ color: MUTED }}>{w.parent_warehouse || "·"}</span> },
          { key: "kind", label: "Type", align: "left", sort: (w) => w.kind,
            render: (w) => (
              <select value={w.kind} disabled={saving === w.warehouse} onChange={(e) => save(w.warehouse, { kind: e.target.value })}
                className="rounded border px-2 py-1 text-xs font-bold bg-white" style={{ borderColor: BORDER, color: kindColour(w.kind), minWidth: 110 }}
                title={w.kind_at ? `set by ${(w.kind_by || "").split("@")[0]} on ${new Date(w.kind_at).toLocaleDateString("en-IN")}` : "not yet said"}>
                {KINDS.map((k) => <option key={k} value={k}>{k || "— not said —"}</option>)}
              </select>
            ) },
          { key: "counts", label: "Counts as stock", align: "center", sort: (w) => (w.kind === "Stock" ? 1 : 0),
            render: (w) => <span style={{ color: w.kind === "Stock" ? GREEN : MUTED, fontWeight: 700 }}>{w.kind === "Stock" ? "✓" : "–"}</span> },
          { key: "remarks", label: "Remarks", align: "left", sort: (w) => w.remarks,
            render: (w) => (
              <input value={drafts[w.warehouse] ?? w.remarks} placeholder="…"
                onChange={(e) => setDrafts((d) => ({ ...d, [w.warehouse]: e.target.value }))}
                onBlur={(e) => { if (e.target.value !== w.remarks) save(w.warehouse, { remarks: e.target.value }); }}
                onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                className="w-full rounded border px-2 py-1 text-xs" style={{ borderColor: BORDER, minWidth: 260, color: INK }} />
            ) },
        ]}
      />
      <div className="text-xs mt-2" style={{ color: MUTED, lineHeight: 1.6 }}>
        Change the type and it saves at once; a remark saves when you leave the box. <b style={{ color: NAVY }}>Only Stock counts</b> towards closing stock on an item —
        WIP is material already in the works, Vendor is material out at a sub-vendor. {S(rows.find((w) => /guessed/i.test(w.remarks))?.remarks) ? "Types marked “guessed from the name” were set by the first pull and are yours to correct." : ""}
      </div>
    </Screen>
  );
}
