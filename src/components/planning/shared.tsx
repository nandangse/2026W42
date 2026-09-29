"use client";
// split out of PlanningSuite.tsx (Genie 5.0.1.1) — one file per tab, loaded when opened
import React from "react";

import { zeroCrew, templateFor } from "@/lib/templates";
import { today, fmtFull, jobNo, initials, type Plan, type PlanMilestone } from "@/lib/schedule";

// The 32 ERP job-status options (verbatim from V1.9), used by the editable
// Job Status dropdowns.
export const STATUSES = [
  "S: Order Received", "S: Client Discussion", "PPC: Pre Kick Off", "PPC: Kick Off",
  "D: GA Approval", "D: Drawing 25%", "D: Drawing 50%", "D: Drawing 75%",
  "D: BOM: TBOM", "D: BOM 50%", "M: Material Kitting Not Started",
  "M: Material Kitting - 25%", "M: Material Kitting - 50%", "M: Material Kitting - 75%",
  "M: Material Recieved", "P: Production Started", "P: Subassembly Fabrication - 50%",
  "P: Subassembly Fabrication - 75%", "P: Assembly Fabrication - 25%",
  "P: Assembly Fabrication - 50%", "P: Assembly Fabrication - 75%",
  "P: Assembly Fabrication - 100%", "P: Hydraulics Stage", "P: Electrical Stage",
  "P: Painting Stage", "Q: Final Inspection", "S: Pending Client Delivery",
  "D: Delivered", "I: Installation Not Started due to Client",
  "I: Installation in progress", "I: Installation Completed", "C: Job Handed Over",
];

export type Role = "admin" | "planner" | "project_owner" | "user" | "viewer" | "sales";

export const TODAY = today();

/** A safe DOM id for a free-text group name off the ERP. */
/**
 * A PASTEL PER OWNER (Dr Raghu, 2 Sep 2026: "Can the colour scheme be made in
 * pastel colours depending on the project owner").
 *
 * The colour is DERIVED from the owner's name, not assigned from a list, so a
 * new planning owner gets a colour the day they appear and nobody has to keep
 * a table in step. Pastel is the point: these sit behind small dark text on a
 * dense grid, so saturation is capped and lightness kept high -- a calendar
 * you cannot read is not a prettier calendar.
 *
 * Overdue still wins. A late job is red whoever owns it: the warning outranks
 * the attribution, and a pastel that hid it would be a worse calendar than one
 * with no colours at all.
 */
export const ownerHue = (who: string): number => {
  let h = 0;
  for (let i = 0; i < who.length; i++) h = (h * 31 + who.charCodeAt(i)) >>> 0;
  return h % 360;
};

export const ownerTint = (who: string | null | undefined) =>
  who ? `hsl(${ownerHue(String(who))} 62% 90%)` : "#ECEFF3";

export const ownerInk = (who: string | null | undefined) =>
  who ? `hsl(${ownerHue(String(who))} 55% 26%)` : "var(--dim)";

/**
 * WHO MAY MOVE A DATE BY DRAGGING (Dr Raghu, 2 Sep 2026: "Dragging is only
 * allowed for Raghu and Pankaj for the TDD change of jobs ... no one else!").
 *
 * Tighter than the lightbox on purpose. Editing a date there is a considered
 * act -- open the job, read it, type the date. A drag is one gesture over a
 * dense grid, it travels to Jobmaster, and the whole works reads that date.
 * The two people who own the plan carry it; everyone else still sees the
 * calendar and still opens any job on it.
 */
export const MAY_DRAG_TDD = ["raghu@nandan.co.in", "pankajs@nandan.co.in"];

export const mayDragTdd = (email: string | null | undefined) =>
  !!email && MAY_DRAG_TDD.includes(String(email).toLowerCase());

export const groupAnchor = (g: string) => "grp-" + encodeURIComponent(g).replace(/%/g, "_");

/** An ISO date shown the way the rest of Genie shows one; anything else as typed. */
export const asHuman = (v: string): string =>
  /^\d{4}-\d{2}-\d{2}$/.test(String(v).trim()) ? fmtFull(String(v).trim()) : String(v);

export interface Person {
  id: string;
  email: string;
  role: string;
  initials: string | null;
  name: string | null;
  erpOwner: string | null;
  /** Line manager (profiles.id), set in Admin → User management. */
  reportsTo: string | null;
}

/** Label for a person: "RK · Ravi Kumar" style, falling back sensibly. */
export const personLabel = (p: Person) =>
  `${p.initials ? p.initials + " · " : ""}${p.name || p.email.split("@")[0]}`;

/** Every string a task's `who` might hold for this person. */
export function myHandles(me: { initials: string | null; displayName: string | null; erpOwner: string | null; email: string }) {
  return new Set(
    [me.initials, me.displayName, me.erpOwner, me.email, me.email.split("@")[0]]
      .filter(Boolean)
      .map((s) => String(s).toLowerCase()),
  );
}

/**
 * People a task can be assigned to: EVERY account that exists, whatever its
 * role — never raw Jobmaster text. (Job ownership is separate and restricted to
 * Project Owners.) Initials are the stored value; accounts without initials yet
 * fall back to their email handle so a new user is still assignable.
 */
export const ROLE_GROUP: Record<string, string> = {
  user: "Users",
  project_owner: "Planning Owners",
  planner: "Planners",
  admin: "Admins",
  sales: "Sales team",
  viewer: "Viewers",
  uploader: "Uploaders",
};

export const GROUP_ORDER = ["Users", "Planning Owners", "Planners", "Admins", "Sales team", "Viewers", "Uploaders"];

export function assignees(board: Board): { value: string; label: string; group: string }[] {
  return (board.assignableUsers || [])
    .map((p) => {
      const handle = p.initials || p.email.split("@")[0];
      const name = p.name || p.email.split("@")[0];
      return {
        value: handle,
        label: p.initials ? `${p.initials} · ${name}` : `${name} (no initials)`,
        group: ROLE_GROUP[p.role] || "Others",
        _sort: (p.initials || name).toLowerCase(),
      };
    })
    .sort(
      (a, b) =>
        GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group) ||
        (a._sort < b._sort ? -1 : 1),
    )
    .map(({ _sort, ...rest }) => rest);
}

/** Date+time stamp for "last updated". */
export const stamp = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata",
        day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
      })
    : "—";

export interface Job {
  id: string;
  tag: string;
  fam: string;
  cust: string;
  val: number;
  tdd: string | null;
  otd: string | null;
  start: string | null;
  proj: string;
  stat: string;
  pct: number;
  note: string;
  own: string;
  mgmt: string | null;
  tp: number;
  tpv: number;
  tpp: number;
  kit: number;
  /** Physically being worked on now — Stratcom's call, not the ERP's. */
  onFloor?: boolean;
  onFloorAt?: string | null;
  qualityOwner?: string | null;
  productionOwner?: string | null;
  kittingOwner?: string | null;
  designOwner?: string | null;
  floorSummary?: string | null;
  floorSummaryAt?: string | null;
  active: boolean;
  archived: boolean;
  delivered?: boolean;
  /** The vehicle it is built on, where it is one — Genie's own (0173). */
  chassisNo?: string | null;
  engineNo?: string | null;
  /** The day it actually went. The board has carried it since 0100; this
   *  type simply never declared it. */
  delivered_on?: string | null;
  updated_at: string | null;
  ownerInitials: string | null;
  ownerName: string | null;
  /** The money side. Null is NOT RECORDED, and never the same as zero. */
  clientUpdate: string | null;
  cashflow: string | null;
  escalation: string | null;
  amtNeeded: number | null;
  payOnDelivery: number | null;
  /** Genie's own band — B/O, 0-50 … 700+. See 0115_job_mandays.sql. */
  mandays?: string | null;
}

/**
 * Money already sunk into a job: (1 − T%) × Kitting% × Value.
 *
 * (1 − T%) of the value is the material content — what is bought in rather
 * than earned — and the kitting percentage says how much of that has actually
 * been drawn. So this is what the job is holding in steel and parts on the
 * shop floor, and it is the number that says what finishing the job releases.
 * Same arithmetic as the KITTED MATERIAL VALUE card, kept in one place.
 */
/** Set each render by the main component; read by redactMoney below. */
export let HIDE_MONEY = false;
/** The main component sets it once per render from the person's rights and the toggle. */
export const setHideMoney = (v: boolean) => { HIDE_MONEY = v; };

/**
 * Rupee figures inside PROSE — Genie's job reads, floor summaries, client
 * updates. V() masks the numbers it prints, but a sentence like "₹15.2 L
 * pending on delivery" carries its figure in the words, so the words are
 * scrubbed by the same rule that masks the columns.
 */
export const redactMoney = (t: string | null | undefined): string =>
  !t ? "" : HIDE_MONEY ? String(t).replace(/(₹|\bRs\.?)\s?[\d,]+(\.\d+)?\s*(Crores?|Cr|Lakhs?|L|k)?\b/gi, "₹ •••") : String(t);

export const investedIn = (j: Pick<Job, "val" | "tpp" | "kit">): number =>
  j.val * (1 - (j.tpp || 0) / 100) * ((j.kit || 0) / 100);

export interface Task {
  id: string;
  kind: "erp" | "manual";
  j: string;
  t: string;
  d: string;
  who: string;
  due: string | null;
  cat: string;
  esc: string;
  /** Why it was escalated, as typed when the level was set. */
  esc_why?: string | null;
  done: boolean;
  /** Email of whoever raised it. null for ERP ToDos — they have no Genie author. */
  by: string | null;
  /** When it was raised (migration 0074). Blank for rows older than the column. */
  created_at?: string | null;
  comments: number;
  /**
   * The date FIRST promised, and how many times it has been moved since.
   * Lateness is judged on this, never on the date currently showing — a task
   * dragged forward must not stop being late by being dragged.
   */
  original_due?: string | null;
  push_count?: number;
}

/**
 * What a task hangs off, said plainly — the lightbox was not saying it
 * (Dr Raghu, 28 Aug 2026). A task tied to a job names the job, and the
 * project when the job carries one; a task tied to nothing says so.
 */
export const taskJobRef = (board: Board, t: Task): { id: string; label: string; project: string } | null => {
  if (!t.j) return null;
  const j = board.jobs.find((x) => x.id === t.j) || board.archived[t.j];
  if (!j) return { id: t.j, label: `Job ${jobNo(t.j)}`, project: "" };
  return { id: j.id, label: `${jobNo(j.id)} · ${j.tag}`, project: (j.proj || "").trim() };
};

/** Late against the date first committed, not the one on screen. */
export const taskLate = (t: Pick<Task, "due" | "original_due" | "done">, on: string): boolean =>
  !t.done && !!(t.original_due || t.due) && (t.original_due || t.due)! < on;

export interface Board {
  jobs: Job[];
  archived: Record<string, Job>;
  projects: any[];
  tasks: Task[];
  plans: Record<string, Plan & { baseline_on?: string | null; baseline_end?: string | null }>;
  designPlans?: Record<string, { title: string; start: string | null; end: string | null; done: boolean }[]>;
  baselines: Record<string, { idx: number; title: string; start: string; end: string }[]>;
  materials: Record<string, { id: string; item: string; qty: string; status: string; custom: boolean; due?: string | null; who?: string | null; note?: string | null; task_id?: string | null }[]>;
  priority: string[] | null;
  templates: Record<string, any>;
  owners: string[];
  people: Person[];
  projectOwners: Person[];
  assignableUsers: Person[];
  unlinkedOwners: string[];
  lastUpdated: string | null;
  batches: Record<string, { uploaded_at: string; filename: string } | undefined>;
  aggregates: { kittingPct: number; materialValueSum: number; kittedValueSum: number; activeJobCount: number };
}

export interface AdminUser {
  id: string;
  email: string;
  role: string;
  disabled: boolean;
  initials: string | null;
  display_name: string | null;
  erp_owner: string | null;
  reports_to: string | null;
  sales_access: boolean;
  sales_implicit: boolean; // the owner — always yes, not toggleable
  /** Job title and department, read by Goals. */
  designation: string | null;
  department_id: string | null;
  /** From auth.users — null when the account has never signed in. */
  last_sign_in_at: string | null;
  /** Goals access, merged in so a person is one row rather than two tables. */
  goals_level: "none" | "view" | "edit";
  /** HRMS — the people records at /hrms. Owner's grant, nobody by default. */
  hrms_access: boolean;
  hrms_implicit: boolean; // the owner — always yes, not toggleable
  /** The CRM at /crm. Same arrangement. */
  crm_access: boolean;
  crm_implicit: boolean;
  /** Accounts at /accounts — the fourth module (0073). Same arrangement. */
  accounts_access: boolean;
  accounts_implicit: boolean;
  /** Vishwakarma, design, at /vishwakarma (0076). Same arrangement. */
  vishwakarma_access: boolean;
  vishwakarma_implicit: boolean;
  /** Seva, customer service, at /seva (0107). Same arrangement. */
  seva_access: boolean;
  seva_implicit: boolean;
  /** IMS, the management system, at /ims (0111). Same arrangement. */
  ims_access: boolean;
  ims_implicit: boolean;
  /** Saamaan, materials, at /saamaan (0118, material_access). Same arrangement. */
  saamaan_access: boolean;
  saamaan_implicit: boolean;
  marketing_access: boolean;
  marketing_implicit: boolean;
}

export interface ErpLogEntry {
  id: string;
  time: string;
  doctype: string;
  docname: string;
  field: string;
  value: string;
  link: string | null;
}

export const erpJobLink = (id: string) => "https://nandanerp.in/app/jobmaster/" + id;

/** The single account above the admin tier. Mirrors RAGHU_EMAIL on the server. */
export const OWNER_EMAIL = "raghu@nandan.co.in";

/**
 * Who may push the morning Excel from inside the suite: admins, plus Shweta —
 * the one non-admin whose job it is. The server still enforces this (the
 * upload route requires the uploader or admin role); this only decides whether
 * the menu item is worth showing.
 */
export const UPLOADER_EMAIL = "shweta@nandan.co.in";

// Default milestone plan for a product family: admin-saved DB templates first
// (exact name, then partial match), then the "Default" template, then the
// built-in V1.9 fallback. This is what makes admin-added products work.
export function templateMilestones(fam: string, templates: Record<string, any>): PlanMilestone[] {
  const keys = Object.keys(templates || {});
  const f = (fam || "").toLowerCase();
  const hit =
    keys.find((k) => k.toLowerCase() === f) ||
    keys.find(
      (k) =>
        k !== "Default" &&
        (f.includes(k.toLowerCase()) || k.toLowerCase().includes(f)) &&
        f !== "",
    );
  const src = hit ? templates[hit] : templates["Default"];
  if (Array.isArray(src) && src.length) {
    return src.map((m: any, i: number) => ({
      name: String(m.name || `Milestone ${i + 1}`),
      days: Math.max(1, Number(m.days) || 1),
      preds: Array.isArray(m.preds)
        ? m.preds.filter((p: number) => p > 0 && p <= i)
        : m.pred
          ? [m.pred]
          : [],
      crew: { ...zeroCrew(), ...(m.crew || {}) },
      shift: m.shift || "D",
      offset: Number(m.offset) || 0,
    }));
  }
  return templateFor(fam).map((m) => ({
    name: m.name,
    days: m.days,
    preds: m.pred ? [m.pred] : [],
    crew: { ...m.crew },
    shift: "D",
    offset: m.offset,
  }));
}