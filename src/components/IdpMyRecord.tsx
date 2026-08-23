"use client";
/**
 * Step 1 of the IDP: their own HRIS record.
 *
 * The IDP begins with what the company has on file, because a development
 * plan built on a wrong record is wrong before a word is written — and
 * because nobody looks at their own record until something makes them.
 * "Any changes, please make them in this. They will be updated after
 * approval." Every edit queues for Dr Raghu with everything else.
 *
 * Role is shown and not editable — what somebody is accountable for is not
 * self-service. HR notes are not shown at all; they are not theirs to read.
 */
import { useState } from "react";
import { api } from "@/lib/api";
import { FIELD_GROUPS, splitMulti, type FieldSpec } from "@/lib/hrms";

const C = { ink: "#22303C", dim: "#5A6672", faint: "#8A94A0", line: "#E2E0DA", orange: "#E8600A", green: "#0D7A3F", red: "#B3261E" };

export interface MyRecord { value: Record<string, string | null>; pending: Record<string, boolean> }

export default function IdpMyRecord({
  record, options, onChanged,
}: {
  record: MyRecord;
  options: Record<string, string[]>;
  onChanged: (field: string, value: string | null) => void;
}) {
  const [msg, setMsg] = useState("");
  const [pendingLocal, setPendingLocal] = useState<Record<string, boolean>>({});

  const save = async (field: string, value: string) => {
    if (String(record.value[field] ?? "") === value.trim()) return;
    setMsg("");
    try {
      const j = await api.post("/api/idp", { action: "myrecord", field, value });
      onChanged(field, j.value ?? null);
      setPendingLocal((x) => ({ ...x, [field]: true }));
      setMsg("Saved — it will show after approval ✓");
    } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
  };

  const isPending = (k: string) => pendingLocal[k] || record.pending[k];

  return (
    <div className="mb-5">
      <h2 className="font-bold" style={{ fontSize: 19 }}>Begin with my HRIS records</h2>
      <div className="rounded-lg p-3 mt-2" style={{ background: "#FFF7E6", border: "1px solid #F5D9A8" }}>
        <div style={{ fontSize: 14, color: C.ink, lineHeight: 1.7 }}>
          This is what the company has on file for you. <b>Read it. Any changes, please make them in this.</b>
        </div>
        <div style={{ fontSize: 12.5, color: C.dim, lineHeight: 1.6, marginTop: 4 }}>
          A change you make is sent to management and shows on your record <b>after approval</b>. Nothing you type
          here is lost — it simply waits to be agreed.
        </div>
      </div>
      {msg && <div className="text-sm font-semibold mt-2" style={{ color: msg.includes("✓") ? C.green : C.red }}>{msg}</div>}

      {FIELD_GROUPS.map((g) => {
        const fields = g.fields.filter((f) => f.key !== "notes");
        if (!fields.length) return null;
        return (
          <details key={g.key} open={g.key === "identity" || g.key === "contact"} className="mt-3">
            <summary className="font-bold cursor-pointer rounded-lg px-3 py-2.5"
              style={{ fontSize: 15, background: "#fff", border: `1px solid ${C.line}` }}>
              {g.label}
              {g.confidential && <span style={{ fontSize: 10, color: C.red, marginLeft: 6 }}>your own — private</span>}
            </summary>
            <div className="rounded-lg mt-1 px-3 py-1" style={{ background: "#fff", border: `1px solid ${C.line}` }}>
              {fields.map((f) => (
                <Row key={f.key} f={f} record={record} options={options}
                  pending={isPending(f.key)} onSave={(v) => save(f.key, v)} />
              ))}
            </div>
          </details>
        );
      })}
    </div>
  );
}

function Row({
  f, record, options, pending, onSave,
}: {
  f: FieldSpec; record: MyRecord; options: Record<string, string[]>;
  pending: boolean; onSave: (v: string) => void;
}) {
  const raw = record.value[f.key] ?? "";

  // worked out, not typed
  if (f.derived) {
    const v = f.derived(record.value);
    return (
      <div className="py-2 flex gap-2 items-baseline flex-wrap" style={{ borderTop: "1px solid #EEECE6" }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: C.faint, minWidth: 150 }}>{f.label}</div>
        <div style={{ fontSize: 14, color: C.dim }}>{v ?? "—"}</div>
        <div style={{ fontSize: 11, color: "#C9C6BD" }}>worked out automatically</div>
      </div>
    );
  }

  // the role is HR's to set
  if (f.key === "role") {
    const roles = splitMulti(raw);
    return (
      <div className="py-2" style={{ borderTop: "1px solid #EEECE6" }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: C.dim }}>{f.label}</div>
        <div className="flex gap-1 flex-wrap mt-1">
          {roles.length ? roles.map((r) => (
            <span key={r} className="rounded px-2 py-0.5" style={{ background: "#FFF3E8", fontSize: 13 }}>{r}</span>
          )) : <span style={{ fontSize: 13, color: "#C9C6BD" }}>not set</span>}
        </div>
        <div style={{ fontSize: 11, color: C.faint, marginTop: 2 }}>Set by HR — if this is wrong, say so to HR.</div>
      </div>
    );
  }

  const opts = f.options || (f.master && f.master !== "__roles__" ? options[f.master] || [] : []);

  return (
    <div className="py-2" style={{ borderTop: "1px solid #EEECE6" }}>
      <div className="flex items-baseline gap-2 flex-wrap">
        <div style={{ fontSize: 13, fontWeight: 600, color: C.dim, minWidth: 150 }}>{f.label}</div>
        {pending && (
          <span className="rounded px-1.5" style={{ fontSize: 10, fontWeight: 700, background: "#F5B32B", color: "#4A3300" }}>
            change sent for approval
          </span>
        )}
      </div>
      {f.kind === "bool" ? (
        <select defaultValue={raw === "no" ? "no" : "yes"} onChange={(e) => onSave(e.target.value)}
          className="rounded px-2 py-1.5 mt-1 bg-white" style={{ border: `1px solid ${C.line}`, fontSize: 16 }}>
          <option value="yes">yes</option><option value="no">no</option>
        </select>
      ) : opts.length ? (
        <select defaultValue={raw} onChange={(e) => onSave(e.target.value)}
          className="rounded px-2 py-1.5 mt-1 bg-white w-full" style={{ border: `1px solid ${C.line}`, fontSize: 16, maxWidth: 340 }}>
          <option value="">— not set —</option>
          {raw && !opts.includes(raw) && <option value={raw}>{raw}</option>}
          {opts.map((o) => (<option key={o} value={o}>{o}</option>))}
        </select>
      ) : f.kind === "long" ? (
        <textarea defaultValue={raw} rows={2} onBlur={(e) => onSave(e.target.value)}
          className="w-full rounded px-2 py-1.5 mt-1" style={{ border: `1px solid ${C.line}`, fontSize: 16, lineHeight: 1.5 }} />
      ) : (
        <input defaultValue={raw} type={f.kind === "date" ? "date" : f.kind === "tel" ? "tel" : f.kind === "email" ? "email" : "text"}
          onBlur={(e) => onSave(e.target.value)} placeholder="—"
          className="w-full rounded px-2 py-1.5 mt-1" style={{ border: `1px solid ${C.line}`, fontSize: 16, maxWidth: 420 }} />
      )}
    </div>
  );
}
