"use client";
/**
 * Admin → Users, rebuilt as an app (Dr Raghu, 4 Sep 2026):
 *
 *   "Initials - Name - Email - Apps - Edit - Delete - Reset Password.
 *    Select all - Deselect all. Edit Selected, and in that can give mass
 *    commands! On clicking the user a lightbox opens and all the settings
 *    are available in editable way. For now will only give this to Raghu
 *    and Vishwas. Other admins can see it."
 *
 * So: one flat table, a tick per row, a mass-edit panel over the ticked
 * rows, and one lightbox per person holding every setting Genie keeps
 * about them. The server decides who may change anything (USER_EDITORS in
 * the admin/users route); this screen only greys itself out for the rest.
 */
import React, { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { fmtFull } from "@/lib/schedule";
import { GROUPS, normaliseGroups } from "@/lib/groups";

export interface UserRow {
  id: string;
  email: string;
  role: string;
  disabled: boolean;
  initials: string | null;
  display_name: string | null;
  erp_owner: string | null;
  reports_to: string | null;
  designation: string | null;
  department_id: string | null;
  last_sign_in_at: string | null;
  goals_level: "none" | "view" | "edit";
  lc?: boolean;
  stratcom?: boolean;
  management?: boolean;
  oauth_available?: boolean;
  crm_access: boolean; crm_implicit: boolean;
  hrms_access: boolean; hrms_implicit: boolean;
  accounts_access: boolean; accounts_implicit: boolean;
  vishwakarma_access: boolean; vishwakarma_implicit: boolean;
  seva_access: boolean; seva_implicit: boolean;
  ims_access: boolean; ims_implicit: boolean;
  saamaan_access: boolean; saamaan_implicit: boolean;
}

/** The seven doors that are not Main Genie, in the order the menus show them. */
export const APPS = [
  { key: "crm", label: "CRM", icon: "💼", color: "#1B3A5C", path: "/crm" },
  { key: "hrms", label: "HRMS", icon: "👤", color: "#E8600A", path: "/hrms" },
  { key: "accounts", label: "Kuber", icon: "💰", color: "#0D7A3F", path: "/kuber" },
  { key: "vishwakarma", label: "Vishwakarma", icon: "🛠", color: "#7C3AED", path: "/vishwakarma" },
  { key: "seva", label: "Seva", icon: "🛎", color: "#0F766E", path: "/seva" },
  { key: "ims", label: "IMS", icon: "📐", color: "#1B2D6B", path: "/ims" },
  { key: "saamaan", label: "Saamaan", icon: "📦", color: "#B45309", path: "/saamaan" },
] as const;
type AppKey = (typeof APPS)[number]["key"];

const ROLE_OPTIONS: { value: string; label: string; hint: string }[] = [
  { value: "admin", label: "Admin", hint: "Everything, plus the Admin page" },
  { value: "planner", label: "Planner", hint: "All boards and editing" },
  { value: "project_owner", label: "Planning Owner", hint: "Owns jobs — the boards filter by these people. The Jobmaster calls this the Project Owner; it is the same person." },
  { value: "user", label: "User", hint: "Works tasks assigned to them" },
  { value: "sales", label: "Sales team", hint: "Sales Genie by default, plus the boards" },
  { value: "viewer", label: "Viewer", hint: "Read-only" },
  { value: "uploader", label: "Uploader", hint: "Morning Update page only" },
];
const roleLabel = (v: string) => ROLE_OPTIONS.find((r) => r.value === v)?.label ?? v;

const hasApp = (u: UserRow, k: AppKey) => !!(u as unknown as Record<string, unknown>)[`${k}_access`];
const implicitApp = (u: UserRow, k: AppKey) => !!(u as unknown as Record<string, unknown>)[`${k}_implicit`];

const INK = "#16232F", DIM = "#5A6672", FAINT = "#8A94A0", LINE = "#E2E0DA", ORANGE = "#E8600A", GREEN = "#0D7A3F", RED = "#B3261E";

const inp: React.CSSProperties = { border: `1px solid ${LINE}`, borderRadius: 6, padding: "5px 8px", fontSize: 13, width: "100%", background: "#fff", color: INK };

const post = (body: Record<string, unknown>) => api.post("/api/admin/users", body);

export default function UsersApp({
  users, departments, loadUsers, canEdit, isOwner, ownerEmail, meEmail, unlinkedOwners, editors,
}: {
  users: UserRow[] | null;
  departments: { id: string; name: string }[];
  loadUsers: () => Promise<void>;
  /** Raghu and Vishwas, from the server's answer. Everybody else looks. */
  canEdit: boolean;
  isOwner: boolean;
  ownerEmail: string;
  meEmail: string;
  unlinkedOwners: string[];
  editors: string[];
}) {
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<{ k: string; d: 1 | -1 }>({ k: "name", d: 1 });
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [mass, setMass] = useState(false);
  const [msg, setMsg] = useState("");
  const [showLog, setShowLog] = useState(false);
  const [log, setLog] = useState<{ at: string; by_email: string; action: string; target: string }[] | null>(null);
  const [showGone, setShowGone] = useState(false);

  const deptName = (id?: string | null) => departments.find((d) => d.id === id)?.name ?? "";
  const personName = (id?: string | null) => (users ?? []).find((p) => p.id === id)?.display_name ?? "";
  const nameOf = (u: UserRow) => u.display_name || u.email.split("@")[0];

  /** The owner row is untouchable; the rest is the server's call (canEdit). */
  const mayTouch = (u: UserRow) => canEdit && u.email.toLowerCase() !== ownerEmail;

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = (users ?? []).filter((u) => showGone || !u.disabled).filter((u) => {
      if (!needle) return true;
      const hay = [u.initials, u.display_name, u.email, u.erp_owner, u.designation, deptName(u.department_id), roleLabel(u.role)].join(" ").toLowerCase();
      return hay.includes(needle);
    });
    const val = (u: UserRow): string => {
      switch (sort.k) {
        case "initials": return u.initials || "";
        case "email": return u.email;
        case "apps": return String(APPS.filter((a) => hasApp(u, a.key)).length).padStart(2, "0");
        case "role": return roleLabel(u.role);
        default: return nameOf(u);
      }
    };
    return list.sort((a, b) => val(a).localeCompare(val(b), "en", { sensitivity: "base", numeric: true }) * sort.d);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [users, q, sort, showGone, departments]);

  const allPicked = rows.length > 0 && rows.every((u) => picked.has(u.id));
  const selectAll = () => setPicked(new Set(rows.map((u) => u.id)));
  const deselectAll = () => setPicked(new Set());
  const toggle = (id: string) => setPicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const run = async (label: string, fn: () => Promise<unknown>) => {
    setMsg("");
    try { await fn(); await loadUsers(); if (label) setMsg(`${label} ✓`); }
    catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
  };

  const setApp = (u: UserRow, k: AppKey, grant: boolean) =>
    run(`${APPS.find((a) => a.key === k)?.label} ${grant ? "granted to" : "taken from"} ${nameOf(u)}`, () => post({ action: `${k}_access`, id: u.id, grant }));

  const resetLink = (u: UserRow) => {
    if (!window.confirm(`Send a password-reset link to ${u.email}?\n\nThey set their own new password from the mail. Nobody sees it.`)) return;
    run(`Reset link sent to ${u.email}`, () => post({ action: "reset_email", id: u.id }));
  };
  const removeUser = (u: UserRow) => {
    if (!window.confirm(`Remove ${u.email}?\n\nThey will no longer be able to sign in. Their plans, comments and edits remain in the app.`)) return;
    run(`${u.email} removed`, () => post({ action: "delete", id: u.id }));
  };

  const openLog = async () => {
    const next = !showLog; setShowLog(next);
    if (next && log === null) {
      try { setLog(((await api.get("/api/admin/users?log=1")) as { log?: typeof log }).log ?? []); } catch { setLog([]); }
    }
  };

  const th = (k: string | null, label: string, extra?: React.CSSProperties) => (
    <th onClick={k ? () => setSort((c) => ({ k, d: c.k === k ? (c.d === 1 ? -1 : 1) : 1 })) : undefined}
      className="text-left py-2 px-2 font-semibold" style={{ position: "sticky", top: 0, background: "#fff", zIndex: 3, whiteSpace: "nowrap", cursor: k ? "pointer" : "default", boxShadow: `inset 0 -2px 0 ${LINE}`, color: FAINT, fontSize: 11, letterSpacing: 0.4, textTransform: "uppercase", ...(extra || {}) }}>
      {label}{k && sort.k === k ? (sort.d === 1 ? " ▲" : " ▼") : ""}
    </th>
  );

  const openUser = open ? (users ?? []).find((u) => u.id === open) ?? null : null;
  const pickedRows = (users ?? []).filter((u) => picked.has(u.id));

  return (
    <div className="bg-white rounded-lg border" style={{ borderColor: LINE }}>
      {/* ── header ── */}
      <div className="px-3 pt-3 pb-2 flex items-center gap-2 flex-wrap" style={{ borderBottom: `1px solid ${LINE}` }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div className="font-bold" style={{ fontSize: 15, color: INK }}>👥 Users <span className="font-normal text-xs" style={{ color: FAINT }}>— {rows.length} of {(users ?? []).filter((u) => showGone || !u.disabled).length}{picked.size ? ` · ${picked.size} selected` : ""}</span></div>
          <div className="text-xs" style={{ color: FAINT }}>
            {canEdit ? "Click a name for every setting. Tick rows, then Edit selected for one command on all of them."
              : `Read-only for you — only ${editors.map((e) => e.split("@")[0]).join(" and ")} may change users here.`}
          </div>
        </div>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="search name, email, role, department…" className="text-xs" style={{ ...inp, width: 250 }} />
        <label className="text-xs flex items-center gap-1" style={{ color: DIM, cursor: "pointer" }}>
          <input type="checkbox" checked={showGone} onChange={(e) => setShowGone(e.target.checked)} /> show disabled
        </label>
        {canEdit && <button onClick={() => setAdding(true)} className="text-xs font-bold rounded px-3 py-1.5" style={{ background: ORANGE, color: "#fff" }}>+ Add user</button>}
      </div>

      {/* ── selection bar ── */}
      <div className="px-3 py-1.5 flex items-center gap-2 flex-wrap text-xs" style={{ background: "#FBFAF7", borderBottom: `1px solid ${LINE}` }}>
        <button onClick={selectAll} className="font-semibold rounded border px-2 py-1 bg-white" style={{ borderColor: LINE, color: "#1B3A5C" }}>Select all</button>
        <button onClick={deselectAll} className="font-semibold rounded border px-2 py-1 bg-white" style={{ borderColor: LINE, color: DIM }}>Deselect all</button>
        <button onClick={() => setMass(true)} disabled={!canEdit || picked.size === 0} className="font-bold rounded px-3 py-1"
          style={{ background: canEdit && picked.size ? "#1B3A5C" : "#E9ECEF", color: canEdit && picked.size ? "#fff" : FAINT, cursor: canEdit && picked.size ? "pointer" : "not-allowed" }}
          title={canEdit ? "One command for every ticked row" : "Read-only for you"}>
          ✎ Edit selected{picked.size ? ` (${picked.size})` : ""}
        </button>
        {msg && <span className="font-semibold ml-2" style={{ color: msg.includes("✓") || /removed|sent/.test(msg) ? GREEN : RED }}>{msg}</span>}
      </div>

      {/* ── the table ── */}
      <div style={{ overflow: "auto", maxHeight: "calc(100vh - 290px)" }}>
        <table className="w-full" style={{ fontSize: 13, borderCollapse: "collapse", whiteSpace: "nowrap" }}>
          <thead>
            <tr>
              <th className="py-2 px-2" style={{ position: "sticky", top: 0, background: "#fff", zIndex: 3, boxShadow: `inset 0 -2px 0 ${LINE}`, width: 28 }}>
                <input type="checkbox" checked={allPicked} onChange={(e) => (e.target.checked ? selectAll() : deselectAll())} title={allPicked ? "Deselect all" : "Select all"} />
              </th>
              {th("initials", "Initials")}
              {th("name", "Name")}
              {th("email", "Email")}
              {th("apps", "Apps")}
              {th(null, "Edit", { textAlign: "center" })}
              {th(null, "Delete", { textAlign: "center" })}
              {th(null, "Reset password", { textAlign: "center" })}
            </tr>
          </thead>
          <tbody>
            {users === null && [0, 1, 2].map((i) => (
              <tr key={"sk" + i} style={{ borderTop: `1px solid #EEECE6` }}><td className="py-2 px-2" colSpan={8}><div className="rounded" style={{ height: 12, width: `${60 - i * 10}%`, background: "#EFEDE7" }} /></td></tr>
            ))}
            {users !== null && rows.length === 0 && <tr><td className="py-4 px-2" colSpan={8} style={{ color: FAINT }}>Nobody matches.</td></tr>}
            {rows.map((u) => {
              const owner = u.email.toLowerCase() === ownerEmail;
              const on = picked.has(u.id);
              return (
                <tr key={u.id} style={{ borderTop: "1px solid #EEECE6", background: on ? "#F3F6FA" : u.disabled ? "#FAFAF8" : "#fff", opacity: u.disabled ? 0.6 : 1 }}>
                  <td className="py-1.5 px-2"><input type="checkbox" checked={on} onChange={() => toggle(u.id)} /></td>
                  <td className="py-1.5 px-2">
                    <span className="inline-flex items-center justify-center rounded font-bold" style={{ minWidth: 34, height: 24, padding: "0 6px", background: u.initials ? "#FFF3E8" : "#FBEDEA", color: u.initials ? ORANGE : RED, fontSize: 12 }} title={u.initials ? "Initials — the key tasks are assigned by" : "No initials yet"}>
                      {u.initials || "?"}
                    </span>
                  </td>
                  <td className="py-1.5 px-2">
                    <button onClick={() => setOpen(u.id)} className="font-semibold text-left" style={{ color: "#1B3A5C", textDecoration: "underline", textUnderlineOffset: 2 }} title="Open every setting">
                      {nameOf(u)}
                    </button>
                    <span className="ml-1.5 rounded px-1 font-bold" style={{ background: "#F4F2EC", color: DIM, fontSize: 9.5 }}>{roleLabel(u.role)}</span>
                    {owner && <span className="ml-1 rounded px-1 font-bold" style={{ background: "#FFF3E8", color: ORANGE, fontSize: 9 }}>OWNER</span>}
                    {editors.includes(u.email.toLowerCase()) && !owner && <span className="ml-1 rounded px-1 font-bold" style={{ background: "#DCE8F5", color: "#1B3A5C", fontSize: 9 }} title="May change users here">USER EDITOR</span>}
                    {u.disabled && <span className="ml-1 rounded px-1 font-bold" style={{ background: "#FBEDEA", color: RED, fontSize: 9 }}>DISABLED</span>}
                  </td>
                  <td className="py-1.5 px-2" style={{ color: DIM }}>{u.email}</td>
                  <td className="py-1.5 px-2">
                    <div className="flex gap-1 flex-wrap">
                      {APPS.map((a) => {
                        const has = hasApp(u, a.key), imp = implicitApp(u, a.key);
                        const can = mayTouch(u) && !imp;
                        return (
                          <button key={a.key} onClick={can ? () => setApp(u, a.key, !has) : undefined}
                            className="rounded px-1.5 font-semibold" style={{ fontSize: 10.5, lineHeight: "18px", border: `1px solid ${has ? a.color : LINE}`, background: has ? a.color : "#fff", color: has ? "#fff" : "#B8B5AC", cursor: can ? "pointer" : "default", opacity: has ? 1 : 0.8 }}
                            title={`${a.label} · genie.nandan.co.in${a.path} — ${imp ? "the owner holds it always" : has ? (can ? "click to take away" : "granted") : (can ? "click to grant" : "not granted")}`}>
                            {a.icon} {a.label}
                          </button>
                        );
                      })}
                    </div>
                  </td>
                  <td className="py-1.5 px-2 text-center">
                    <button onClick={() => setOpen(u.id)} className="rounded px-2 py-0.5 font-semibold" style={{ background: "#DCE8F5", color: "#1B3A5C" }} title={canEdit ? "Edit every setting" : "See every setting"}>✎</button>
                  </td>
                  <td className="py-1.5 px-2 text-center">
                    {mayTouch(u) && u.email.toLowerCase() !== meEmail
                      ? <button onClick={() => removeUser(u)} className="rounded px-2 py-0.5 font-semibold" style={{ background: "#FBEDEA", color: RED }} title="Remove this account">✕</button>
                      : <span style={{ color: "#B8B5AC" }} title={owner ? "The owner account is protected" : u.email.toLowerCase() === meEmail ? "Not your own account" : "Read-only for you"}>🔒</span>}
                  </td>
                  <td className="py-1.5 px-2 text-center">
                    {mayTouch(u)
                      ? <button onClick={() => resetLink(u)} className="rounded px-2 py-0.5 font-semibold" style={{ background: "#F4F2EC", color: DIM }} title="Send them a reset link by email">✉ send link</button>
                      : <span style={{ color: "#B8B5AC" }}>—</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ── footer: the ledger and the Jobmaster bridge ── */}
      <div className="px-3 py-2 text-xs" style={{ borderTop: `1px solid ${LINE}`, color: FAINT }}>
        <button onClick={openLog} className="font-bold rounded border px-2 py-1 bg-white" style={{ borderColor: LINE, color: DIM }}>{showLog ? "▾" : "▸"} Change log — who changed what</button>
        {showLog && (
          <div className="rounded border p-2 mt-1" style={{ borderColor: LINE, maxHeight: 220, overflowY: "auto" }}>
            {log === null && <div>reading…</div>}
            {log !== null && log.length === 0 && <div>Nothing logged yet.</div>}
            {(log ?? []).map((e, i) => (
              <div key={i} className="py-0.5" style={{ borderTop: i ? "1px solid #F0F1F6" : "none", color: DIM }}>
                <span className="tnum" style={{ color: FAINT }}>{fmtFull(e.at)}</span> · <b>{e.by_email.split("@")[0]}</b> → {e.action} <b>{e.target ? e.target.split("@")[0] : ""}</b>
              </div>
            ))}
          </div>
        )}
        {unlinkedOwners.length > 0 && (
          <div className="mt-2 rounded p-2" style={{ background: "#FFF7E6", border: "1px solid #F5B32B", color: "#8A5B00" }}>
            <b>⚠ {unlinkedOwners.length} owner name{unlinkedOwners.length === 1 ? "" : "s"} in the Jobmaster match no account:</b>{" "}
            {unlinkedOwners.map((o) => <span key={o} className="rounded px-1.5 py-0.5 font-semibold mr-1" style={{ background: "#fff", border: `1px solid ${LINE}` }}>{o}</span>)}
            <div className="mt-1">Their jobs show as <b>Unassigned</b>. Open the person and paste the exact name into <b>ERP owner</b>.</div>
          </div>
        )}
        <div className="mt-2">Grants are held against the <b>email</b>, so a person can be granted before their account exists. Anyone granted a door can edit inside it as well as read.</div>
      </div>

      {openUser && (
        <UserLightbox u={openUser} users={users ?? []} departments={departments} canEdit={mayTouch(openUser) || (isOwner && openUser.email.toLowerCase() === ownerEmail)}
          ownerEmail={ownerEmail} isOwner={isOwner} meEmail={meEmail} onClose={() => setOpen(null)} reload={loadUsers} />
      )}
      {adding && <AddUser departments={departments} isOwner={isOwner} onClose={() => setAdding(false)} reload={loadUsers} />}
      {mass && pickedRows.length > 0 && (
        <MassEdit rows={pickedRows} users={users ?? []} departments={departments} ownerEmail={ownerEmail} isOwner={isOwner} meEmail={meEmail}
          onClose={() => setMass(false)} reload={async () => { await loadUsers(); }} onDone={(n) => { setMsg(`Applied to ${n} ✓`); }} />
      )}
    </div>
  );
}

/* ───────────────────────── shared bits ───────────────────────── */

function Shell({ title, sub, badge, onClose, children, width = 760 }: { title: React.ReactNode; sub?: React.ReactNode; badge?: React.ReactNode; onClose: () => void; children: React.ReactNode; width?: number }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(22,35,47,0.55)", zIndex: 70, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "32px 16px", overflowY: "auto" }}>
      <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-lg" style={{ width: `min(${width}px, 100%)`, maxHeight: "90vh", overflowY: "auto" }}>
        <div className="px-4 py-3 flex items-start gap-3" style={{ background: INK, position: "sticky", top: 0, zIndex: 2 }}>
          {badge}
          <div style={{ flex: 1 }}>
            <div className="font-bold text-white" style={{ fontSize: 16, lineHeight: 1.25 }}>{title}</div>
            {sub && <div className="text-xs" style={{ color: "#8FA1B3" }}>{sub}</div>}
          </div>
          <button onClick={onClose} className="font-bold" style={{ color: "#8FA1B3", fontSize: 20, lineHeight: 1 }}>✕</button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded border p-3 mb-3" style={{ borderColor: LINE, background: "#FBFAF7" }}>
      <div className="text-xs font-bold mb-2" style={{ color: FAINT, letterSpacing: 0.6 }}>{title.toUpperCase()}</div>
      {children}
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block" title={hint}>
      <div className="text-xs font-semibold mb-0.5" style={{ color: DIM }}>{label}</div>
      {children}
    </label>
  );
}

/* ───────────────────────── the lightbox ───────────────────────── */

function UserLightbox({ u, users, departments, canEdit, ownerEmail, isOwner, meEmail, onClose, reload }: {
  u: UserRow; users: UserRow[]; departments: { id: string; name: string }[]; canEdit: boolean; ownerEmail: string; isOwner: boolean; meEmail: string;
  onClose: () => void; reload: () => Promise<void>;
}) {
  const owner = u.email.toLowerCase() === ownerEmail;
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({ initials: u.initials || "", display_name: u.display_name || "", erp_owner: u.erp_owner || "", designation: u.designation || "" });
  useEffect(() => { setF({ initials: u.initials || "", display_name: u.display_name || "", erp_owner: u.erp_owner || "", designation: u.designation || "" }); }, [u]);

  const act = async (label: string, body: Record<string, unknown>) => {
    setMsg(""); setBusy(true);
    try { await post(body); await reload(); setMsg(`${label} ✓`); }
    catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };
  const profile = (patch: Record<string, unknown>, label: string) => act(label, { action: "profile", id: u.id, ...patch });
  const blur = (k: keyof typeof f, label: string) => { if (f[k] !== (u[k] || "")) profile({ [k]: f[k] }, label); };
  // The owner's own profile fields are the owner's to set; the rest of the owner row stays locked.
  const profOk = canEdit || (isOwner && owner);
  const dis = !canEdit || busy;
  const groups = { lc: !!u.lc, stratcom: !!u.stratcom, management: !!u.management };

  return (
    <Shell onClose={onClose} width={820}
      badge={<div className="rounded flex items-center justify-center font-bold" style={{ width: 44, height: 44, background: ORANGE, color: "#fff", fontSize: 16 }}>{u.initials || "?"}</div>}
      title={<>{u.display_name || u.email.split("@")[0]} {owner && <span className="rounded px-1.5 font-bold ml-1" style={{ background: "#FFF3E8", color: ORANGE, fontSize: 10 }}>OWNER</span>}</>}
      sub={<>{u.email} · {roleLabel(u.role)} · {u.disabled ? "disabled" : "active"} · last seen {u.last_sign_in_at ? fmtFull(String(u.last_sign_in_at)) : "never"}{!canEdit && " · read-only for you"}</>}>
      {msg && <div className="text-xs font-semibold mb-2" style={{ color: msg.includes("✓") ? GREEN : RED }}>{msg}</div>}

      <div className="grid gap-3" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <Section title="Identity">
          <div className="grid gap-2" style={{ gridTemplateColumns: "80px 1fr" }}>
            <Field label="Initials" hint="Two or three letters, unique — the key tasks are assigned by">
              <input value={f.initials} maxLength={3} disabled={!profOk || busy} onChange={(e) => setF({ ...f, initials: e.target.value.toUpperCase() })} onBlur={() => blur("initials", "Initials saved")} className="font-bold text-center" style={{ ...inp, color: ORANGE }} />
            </Field>
            <Field label="Full name">
              <input value={f.display_name} disabled={!profOk || busy} onChange={(e) => setF({ ...f, display_name: e.target.value })} onBlur={() => blur("display_name", "Name saved")} style={inp} />
            </Field>
          </div>
          <div className="mt-2"><Field label="Email"><input value={u.email} disabled style={{ ...inp, background: "#F4F2EC", color: DIM }} /></Field></div>
          <div className="mt-2"><Field label="ERP owner" hint="The Planning Owner / Project Owner text exactly as the Jobmaster carries it — links this login to its jobs">
            <input value={f.erp_owner} disabled={!profOk || busy} placeholder="e.g. pankajs@nandan.co.in or Pankaj Vikas Sutar" onChange={(e) => setF({ ...f, erp_owner: e.target.value })} onBlur={() => blur("erp_owner", "ERP owner saved")} style={inp} />
          </Field></div>
          <div className="grid gap-2 mt-2" style={{ gridTemplateColumns: "1fr 1fr" }}>
            <Field label="Designation"><input value={f.designation} disabled={!profOk || busy} onChange={(e) => setF({ ...f, designation: e.target.value })} onBlur={() => blur("designation", "Designation saved")} style={inp} /></Field>
            <Field label="Department" hint="Read by Goals">
              <select value={u.department_id || ""} disabled={!profOk || busy} onChange={(e) => profile({ department_id: e.target.value || null }, "Department saved")} style={inp}>
                <option value="">— none —</option>
                {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </Field>
          </div>
          <div className="mt-2"><Field label="Reports to" hint="Their line manager — Tasking's “people reporting to me” reads this">
            <select value={u.reports_to || ""} disabled={!profOk || busy} onChange={(e) => profile({ reports_to: e.target.value }, "Manager saved")} style={inp}>
              <option value="">— nobody —</option>
              {users.filter((p) => p.id !== u.id && !p.disabled).map((p) => <option key={p.id} value={p.id}>{p.display_name || p.email.split("@")[0]}</option>)}
            </select>
          </Field></div>
        </Section>

        <div>
          <Section title="Role & rooms">
            <Field label="Role" hint={ROLE_OPTIONS.find((r) => r.value === u.role)?.hint}>
              <select value={u.role} disabled={dis || owner} onChange={(e) => act("Role saved", { action: "role", id: u.id, role: e.target.value })} style={inp}>
                {ROLE_OPTIONS.map((r) => <option key={r.value} value={r.value} disabled={r.value === "admin" && !isOwner}>{r.label}</option>)}
              </select>
            </Field>
            <div className="mt-2"><Field label="Goals" hint="Seeing the goal tree is granted per person. Work assigned to someone reaches them on My Week either way.">
              <select value={u.goals_level || "none"} disabled={dis || owner} onChange={async (e) => { setMsg(""); setBusy(true); try { await api.post("/api/admin/goal-access", { person_id: u.id, level: e.target.value }); await reload(); setMsg("Goals access saved ✓"); } catch (err) { setMsg(err instanceof Error ? err.message : String(err)); } finally { setBusy(false); } }} style={inp}>
                <option value="none">no access</option><option value="view">can view</option><option value="edit">can edit</option>
              </select>
            </Field></div>
            <div className="mt-2 text-xs font-semibold" style={{ color: DIM }}>Rooms</div>
            <div className="flex gap-3 flex-wrap mt-1">
              {GROUPS.map((g) => {
                const checked = owner ? true : groups[g.key];
                return (
                  <label key={g.key} className="flex items-center gap-1 text-xs" style={{ cursor: dis || owner ? "default" : "pointer", opacity: owner ? 0.55 : 1 }} title={owner ? "The owner is in all three already" : g.title}>
                    <input type="checkbox" checked={checked} disabled={dis || owner} onChange={(e) => act(`${g.label} saved`, { action: "groups", id: u.id, ...normaliseGroups({ ...groups, [g.key]: e.target.checked }) })} style={{ accentColor: "#1B3A5C" }} />
                    <span style={{ color: checked ? "#1B3A5C" : FAINT, fontWeight: checked ? 700 : 400 }}>{g.label}</span>
                  </label>
                );
              })}
              <label className="flex items-center gap-1 text-xs" style={{ cursor: profOk && !busy ? "pointer" : "default" }} title="Marks this person ready to connect Gmail">
                <input type="checkbox" checked={!!u.oauth_available} disabled={!profOk || busy} onChange={(e) => profile({ oauth_available: e.target.checked }, "OAuth mark saved")} />
                <span style={{ color: u.oauth_available ? "#1B3A5C" : FAINT, fontWeight: u.oauth_available ? 700 : 400 }}>✉ OAuth</span>
              </label>
            </div>
          </Section>

          <Section title="Apps — the doors this login opens">
            <div className="grid gap-1.5" style={{ gridTemplateColumns: "1fr 1fr" }}>
              {APPS.map((a) => {
                const has = hasApp(u, a.key), imp = implicitApp(u, a.key);
                return (
                  <label key={a.key} className="flex items-center gap-2 text-xs rounded px-2 py-1" style={{ border: `1px solid ${has ? a.color : LINE}`, background: has ? `${a.color}12` : "#fff", cursor: dis || imp ? "default" : "pointer" }} title={imp ? "The owner holds it always" : `genie.nandan.co.in${a.path}`}>
                    <input type="checkbox" checked={has} disabled={dis || imp} onChange={(e) => act(`${a.label} ${e.target.checked ? "granted" : "taken away"}`, { action: `${a.key}_access`, id: u.id, grant: e.target.checked })} style={{ accentColor: a.color }} />
                    <span style={{ color: has ? a.color : DIM, fontWeight: has ? 700 : 500 }}>{a.icon} {a.label}</span>
                  </label>
                );
              })}
            </div>
          </Section>
        </div>
      </div>

      <Section title="Account">
        <div className="flex gap-2 flex-wrap items-center text-xs">
          <button disabled={dis || owner || u.email.toLowerCase() === meEmail} onClick={() => { if (!u.disabled && !window.confirm(`Disable ${u.email}?\n\nThey will no longer be able to sign in until re-enabled.`)) return; act(u.disabled ? "Sign-in enabled" : "Sign-in disabled", { action: "disable", id: u.id, disabled: !u.disabled }); }}
            className="rounded px-3 py-1.5 font-bold" style={{ background: u.disabled ? RED : "#E6F4EA", color: u.disabled ? "#fff" : GREEN, opacity: dis || owner ? 0.5 : 1 }}>
            {u.disabled ? "Re-enable sign-in" : "Active — click to disable"}
          </button>
          <button disabled={dis || owner} onClick={() => act(`Reset link sent to ${u.email}`, { action: "reset_email", id: u.id })} className="rounded px-3 py-1.5 font-bold" style={{ background: "#DCE8F5", color: "#1B3A5C", opacity: dis || owner ? 0.5 : 1 }} title="They set their own new password from the mail">✉ Send password-reset link</button>
          <button disabled={dis || owner} onClick={() => { const pw = window.prompt(`New password for ${u.email} (min 8 characters):`); if (pw) act("Password set", { action: "password", id: u.id, password: pw }); }} className="rounded px-3 py-1.5 font-bold" style={{ background: "#F4F2EC", color: DIM, opacity: dis || owner ? 0.5 : 1 }} title="For somebody who cannot reach their mail">🔑 Set a password</button>
          <span style={{ flex: 1 }} />
          <button disabled={dis || owner || u.email.toLowerCase() === meEmail} onClick={async () => { if (!window.confirm(`Remove ${u.email}?\n\nThey will no longer be able to sign in. Their plans, comments and edits remain in the app.`)) return; await act(`${u.email} removed`, { action: "delete", id: u.id }); onClose(); }} className="rounded px-3 py-1.5 font-bold" style={{ background: "#FBEDEA", color: RED, opacity: dis || owner ? 0.5 : 1 }}>✕ Remove account</button>
        </div>
      </Section>
    </Shell>
  );
}

/* ───────────────────────── add a user ───────────────────────── */

function AddUser({ departments, isOwner, onClose, reload }: { departments: { id: string; name: string }[]; isOwner: boolean; onClose: () => void; reload: () => Promise<void> }) {
  const [f, setF] = useState({ email: "", pw: "", role: "user", name: "", initials: "", department_id: "" });
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const create = async () => {
    if (!f.email || !f.pw) { setMsg("Email and a password (min 8) are needed."); return; }
    setBusy(true); setMsg("");
    try {
      const r = await post({ action: "create", email: f.email, password: f.pw, role: f.role, display_name: f.name, initials: f.initials });
      if (f.department_id && r.id) await post({ action: "profile", id: r.id, department_id: f.department_id });
      await reload(); onClose();
    } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };
  return (
    <Shell onClose={onClose} width={520} title="Add a user" sub="One Genie login opens every door they are granted.">
      {msg && <div className="text-xs font-semibold mb-2" style={{ color: RED }}>{msg}</div>}
      <div className="grid gap-2" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <div style={{ gridColumn: "1 / -1" }}><Field label="Email"><input value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} placeholder="name@nandan.co.in" style={inp} /></Field></div>
        <Field label="Full name"><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} style={inp} /></Field>
        <Field label="Initials" hint="Leave blank to auto-generate"><input value={f.initials} maxLength={3} onChange={(e) => setF({ ...f, initials: e.target.value.toUpperCase() })} className="font-bold text-center" style={{ ...inp, color: ORANGE }} placeholder="auto" /></Field>
        <Field label="Password (min 8)"><input value={f.pw} onChange={(e) => setF({ ...f, pw: e.target.value })} style={inp} /></Field>
        <Field label="Role"><select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })} style={inp}>{ROLE_OPTIONS.map((r) => <option key={r.value} value={r.value} disabled={r.value === "admin" && !isOwner}>{r.label}</option>)}</select></Field>
        <div style={{ gridColumn: "1 / -1" }}><Field label="Department"><select value={f.department_id} onChange={(e) => setF({ ...f, department_id: e.target.value })} style={inp}><option value="">— none —</option>{departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></Field></div>
      </div>
      <div className="flex justify-end gap-2 mt-3">
        <button onClick={onClose} className="text-xs font-semibold rounded border px-3 py-1.5 bg-white" style={{ borderColor: LINE, color: DIM }}>Cancel</button>
        <button onClick={create} disabled={busy} className="text-xs font-bold rounded px-3 py-1.5" style={{ background: ORANGE, color: "#fff", opacity: busy ? 0.6 : 1 }}>{busy ? "Creating…" : "Create user"}</button>
      </div>
    </Shell>
  );
}

/* ───────────────────────── mass edit ───────────────────────── */

type Tri = "" | "on" | "off";

function MassEdit({ rows, users, departments, ownerEmail, isOwner, meEmail, onClose, reload, onDone }: {
  rows: UserRow[]; users: UserRow[]; departments: { id: string; name: string }[]; ownerEmail: string; isOwner: boolean; meEmail: string;
  onClose: () => void; reload: () => Promise<void>; onDone: (n: number) => void;
}) {
  const [apps, setApps] = useState<Record<string, Tri>>({});
  const [role, setRole] = useState("");
  const [dept, setDept] = useState("");
  const [mgr, setMgr] = useState("");
  const [goals, setGoals] = useState("");
  const [status, setStatus] = useState<Tri>("");
  const [rooms, setRooms] = useState<Record<string, Tri>>({});
  const [reset, setReset] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string[]>([]);

  const targets = rows.filter((u) => u.email.toLowerCase() !== ownerEmail);
  const skippedOwner = rows.length - targets.length;
  const commands = useMemo(() => {
    const c: string[] = [];
    for (const a of APPS) if (apps[a.key]) c.push(`${apps[a.key] === "on" ? "grant" : "take away"} ${a.label}`);
    if (role) c.push(`role → ${roleLabel(role)}`);
    if (dept) c.push(`department → ${dept === "-" ? "none" : departments.find((d) => d.id === dept)?.name}`);
    if (mgr) c.push(`reports to → ${mgr === "-" ? "nobody" : users.find((p) => p.id === mgr)?.display_name || "?"}`);
    if (goals) c.push(`goals → ${goals}`);
    for (const g of GROUPS) if (rooms[g.key]) c.push(`${rooms[g.key] === "on" ? "into" : "out of"} ${g.label}`);
    if (status) c.push(status === "on" ? "enable sign-in" : "disable sign-in");
    if (reset) c.push("send password-reset link");
    return c;
  }, [apps, role, dept, mgr, goals, rooms, status, reset, departments, users]);

  const apply = async () => {
    if (!commands.length) return;
    if (!window.confirm(`Apply to ${targets.length} account${targets.length === 1 ? "" : "s"}:\n\n• ${commands.join("\n• ")}`)) return;
    setBusy(true); setProgress([]);
    let done = 0;
    for (const u of targets) {
      const errs: string[] = [];
      const tryDo = async (what: string, body: Record<string, unknown>) => { try { await post(body); } catch (e) { errs.push(`${what}: ${e instanceof Error ? e.message : String(e)}`); } };
      for (const a of APPS) {
        const t = apps[a.key];
        if (!t || implicitApp(u, a.key)) continue;
        if ((t === "on") !== hasApp(u, a.key)) await tryDo(a.label, { action: `${a.key}_access`, id: u.id, grant: t === "on" });
      }
      if (role && role !== u.role) await tryDo("role", { action: "role", id: u.id, role });
      const prof: Record<string, unknown> = {};
      if (dept) prof.department_id = dept === "-" ? null : dept;
      if (mgr && mgr !== u.id) prof.reports_to = mgr === "-" ? "" : mgr;
      if (Object.keys(prof).length) await tryDo("profile", { action: "profile", id: u.id, ...prof });
      if (goals && goals !== u.goals_level) { try { await api.post("/api/admin/goal-access", { person_id: u.id, level: goals }); } catch (e) { errs.push(`goals: ${e instanceof Error ? e.message : String(e)}`); } }
      if (Object.values(rooms).some(Boolean)) {
        const next = { lc: !!u.lc, stratcom: !!u.stratcom, management: !!u.management };
        for (const g of GROUPS) if (rooms[g.key]) next[g.key] = rooms[g.key] === "on";
        await tryDo("rooms", { action: "groups", id: u.id, ...normaliseGroups(next) });
      }
      if (status && (status === "off") !== u.disabled && u.email.toLowerCase() !== meEmail) await tryDo("status", { action: "disable", id: u.id, disabled: status === "off" });
      if (reset) await tryDo("reset link", { action: "reset_email", id: u.id });
      done++;
      setProgress((p) => [...p, `${u.display_name || u.email}${errs.length ? " — " + errs.join("; ") : " ✓"}`]);
    }
    await reload();
    setBusy(false);
    onDone(done);
  };

  const tri = (v: Tri, set: (t: Tri) => void, onLabel = "grant", offLabel = "take away") => (
    <select value={v} onChange={(e) => set(e.target.value as Tri)} style={{ ...inp, width: "auto", padding: "3px 6px", fontSize: 12 }}>
      <option value="">leave as is</option><option value="on">{onLabel}</option><option value="off">{offLabel}</option>
    </select>
  );

  return (
    <Shell onClose={busy ? () => undefined : onClose} width={760} title={`Edit ${rows.length} selected`} sub={<>{targets.map((u) => u.display_name || u.email.split("@")[0]).join(", ")}{skippedOwner ? " · the owner row is left alone" : ""}</>}>
      <div className="grid gap-3" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <Section title="Apps">
          {APPS.map((a) => (
            <div key={a.key} className="flex items-center gap-2 mb-1 text-xs">
              <span className="font-semibold" style={{ color: a.color, minWidth: 110 }}>{a.icon} {a.label}</span>
              {tri(apps[a.key] || "", (t) => setApps({ ...apps, [a.key]: t }))}
            </div>
          ))}
        </Section>
        <div>
          <Section title="Role & rooms">
            <div className="grid gap-2" style={{ gridTemplateColumns: "1fr 1fr" }}>
              <Field label="Role"><select value={role} onChange={(e) => setRole(e.target.value)} style={inp}><option value="">leave as is</option>{ROLE_OPTIONS.map((r) => <option key={r.value} value={r.value} disabled={r.value === "admin" && !isOwner}>{r.label}</option>)}</select></Field>
              <Field label="Goals"><select value={goals} onChange={(e) => setGoals(e.target.value)} style={inp}><option value="">leave as is</option><option value="none">no access</option><option value="view">can view</option><option value="edit">can edit</option></select></Field>
              <Field label="Department"><select value={dept} onChange={(e) => setDept(e.target.value)} style={inp}><option value="">leave as is</option><option value="-">— none —</option>{departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></Field>
              <Field label="Reports to"><select value={mgr} onChange={(e) => setMgr(e.target.value)} style={inp}><option value="">leave as is</option><option value="-">— nobody —</option>{users.filter((p) => !p.disabled).map((p) => <option key={p.id} value={p.id}>{p.display_name || p.email.split("@")[0]}</option>)}</select></Field>
            </div>
            <div className="mt-2">
              {GROUPS.map((g) => (
                <div key={g.key} className="flex items-center gap-2 mb-1 text-xs"><span className="font-semibold" style={{ color: "#1B3A5C", minWidth: 110 }}>{g.label}</span>{tri(rooms[g.key] || "", (t) => setRooms({ ...rooms, [g.key]: t }), "put in", "take out")}</div>
              ))}
            </div>
          </Section>
          <Section title="Account">
            <div className="flex items-center gap-2 mb-1 text-xs"><span className="font-semibold" style={{ minWidth: 110, color: DIM }}>Sign-in</span>{tri(status, setStatus, "enable", "disable")}</div>
            <label className="flex items-center gap-2 text-xs mt-1" style={{ cursor: "pointer" }}><input type="checkbox" checked={reset} onChange={(e) => setReset(e.target.checked)} /> Send each a password-reset link</label>
          </Section>
        </div>
      </div>

      <div className="rounded p-2 text-xs mb-3" style={{ background: commands.length ? "#FFF7E6" : "#F4F2EC", border: `1px solid ${commands.length ? "#F5B32B" : LINE}`, color: commands.length ? "#8A5B00" : FAINT }}>
        {commands.length ? <><b>Will do, for each of the {targets.length}:</b> {commands.join(" · ")}</> : "Choose at least one command above."}
      </div>
      {progress.length > 0 && (
        <div className="rounded border p-2 text-xs mb-3" style={{ borderColor: LINE, maxHeight: 160, overflowY: "auto" }}>
          {progress.map((p, i) => <div key={i} style={{ color: p.endsWith("✓") ? GREEN : RED }}>{p}</div>)}
        </div>
      )}
      <div className="flex justify-end gap-2">
        <button onClick={onClose} disabled={busy} className="text-xs font-semibold rounded border px-3 py-1.5 bg-white" style={{ borderColor: LINE, color: DIM }}>{progress.length ? "Close" : "Cancel"}</button>
        <button onClick={apply} disabled={busy || !commands.length || !targets.length} className="text-xs font-bold rounded px-3 py-1.5" style={{ background: "#1B3A5C", color: "#fff", opacity: busy || !commands.length ? 0.5 : 1 }}>{busy ? `Applying… ${progress.length}/${targets.length}` : `Apply to ${targets.length}`}</button>
      </div>
    </Shell>
  );
}
