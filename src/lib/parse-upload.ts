// ============================================================================
// Excel upload parser — ported VERBATIM from nandan-works-planning-V1.9.jsx
// (the client-side parseUpload / linkTasks / ser2iso). This is the single
// source of truth for turning Shweta's morning workbooks into rows. It is
// battle-tested against the real 105/106-job exports, header quirks, and
// image-markdown in notes, so the logic below is intentionally unchanged —
// only TypeScript types were added.
//
// Recognised workbooks (auto-detected by their headers):
//   - "Job in progress - Jobs"      (row-1 ID + Customer Tag)      -> jobs
//   - "Order in Progress - projects"(row-1 ID + Project Stage)     -> projects
//   - "To Do Dashboard All"         (row-1 Reference Type)         -> tasks
//   - the full PRE Status workbook  (Data Analysis sheet present)  -> jobs+projects
// ============================================================================
import type { WorkBook } from "xlsx";
import * as XLSX from "xlsx";
import type {
  ParseResult,
  ParsedJob,
  ParsedProject,
  ParsedRawTask,
  LinkedTask,
  OwnerInfo,
} from "./types";

type Cell = unknown;
type Row = Cell[];

export const ser2iso = (v: Cell): string | null => {
  if (v == null || v === "") return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const n = Number(v);
  if (!isNaN(n) && n > 40000 && n < 60000)
    return new Date(Date.UTC(1899, 11, 30) + n * 86400000)
      .toISOString()
      .slice(0, 10);
  const sv = String(v).trim();
  let m = sv.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return m[0];
  m = sv.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/); // dd/mm/yyyy
  if (m)
    return m[3] + "-" + m[2].padStart(2, "0") + "-" + m[1].padStart(2, "0");
  const d = new Date(String(v));
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
};

export function parseUpload(wb: WorkBook): ParseResult {
  const out: ParseResult = {};
  for (const name of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json<Row>(wb.Sheets[name], {
      header: 1,
      raw: true,
    });
    if (!rows.length) continue;
    const hdr = Array.from(rows[0] || [], (h) => String(h || "").trim());
    const ix: Record<string, number> = {};
    hdr.forEach((h, i) => {
      if (!(h in ix)) ix[h] = i;
    });
    const g = (r: Row, h: string): Cell =>
      ix[h] != null ? r[ix[h]] : undefined;
    if (ix["Customer Tag"] != null && ix["ID"] != null) {
      out.jobs = rows
        .slice(1)
        .filter((r) => r && g(r, "ID"))
        .map(
          (r): ParsedJob => ({
            id: String(g(r, "ID")),
            tag: String(g(r, "Customer Tag") || "").trim(),
            fam:
              String(g(r, "Product Family") || "Unassigned").trim() ||
              "Unassigned",
            cust: String(g(r, "Customer") || "").trim(),
            val: Number(g(r, "Value") || 0),
            tdd: ser2iso(g(r, "Target Delivery Date Current")),
            otd: ser2iso(g(r, "OTD Date")),
            start: ser2iso(g(r, "Job Start Date")),
            proj: String(g(r, "Project") || ""),
            stat: String(g(r, "Job Status") || "").trim(),
            pct: Number(g(r, "Production Completion %") || 0),
            note: String(g(r, "Current Status") || "")
              .replace(/\s+/g, " ")
              .slice(0, 150),
            own: String(g(r, "Project Owner") || "").trim(),
            mgmt: ser2iso(g(r, "Management Target Date Request")),
            tp: Number(g(r, "Throughput") || 0),
            tpv: Number(g(r, "Throughput Expected Value (Auto)") || 0),
            tpp: Number(g(r, "Throughput Expected pc") || 0),
            kit: Number(g(r, "Kitting percentage") || 0),
          }),
        );
    } else if (ix["Reference Type"] != null) {
      out.rawTasks = rows
        .slice(1)
        .filter(Boolean)
        .map(
          (r): ParsedRawTask => ({
            ref: String(g(r, "Reference Type") || ""),
            refn: String(g(r, "Reference Name") || ""),
            t: String(g(r, "Todo Name") || ""),
            d: String(g(r, "Details of Task") || ""),
            who: String(g(r, "Allocated To") || "").split("@")[0],
            due: ser2iso(g(r, "Due Date")),
            cat: String(g(r, "Related to") || "General").trim() || "General",
          }),
        );
    } else if (name === "Milestones for Delivery") {
      const own: Record<string, OwnerInfo> = {};
      const pjobs: ParsedJob[] = [];
      rows.slice(4).forEach((r) => {
        if (!r) return;
        const id = String(r[0] || "");
        if (!/^20\d{8}$/.test(id)) return;
        const o0 = String(r[9] || "").trim();
        const o = o0 === "#N/A" ? "" : o0;
        const mg = ser2iso(r[3]);
        const tp = Number(r[5] || 0);
        const val = Number(r[4] || 0);
        own[id] = { own: o, mgmt: mg };
        pjobs.push({
          id,
          tag: String(r[1] || "").trim(),
          fam: String(r[2] || "Unassigned").trim() || "Unassigned",
          cust: String(r[7] || "").trim(),
          val,
          tdd: mg,
          otd: null,
          start: null,
          proj: String(r[6] || ""),
          stat: "",
          pct: 0,
          note: String(r[8] || "")
            .replace(/\s+/g, " ")
            .slice(0, 150),
          own: o,
          mgmt: mg,
          tpv: val * tp,
          tpp: Math.round(tp * 100),
          kit: 0,
        });
      });
      out.owners = own;
      out.preJobs = pjobs;
    } else if (name === "Data Analysis") {
      // live PROJECTS block: header on 3rd row, columns from "ID" (NGSE-PROJ-…) onward
      const h3 = Array.from(rows[2] || [], (h) => String(h || "").trim());
      const col = (label: string) =>
        h3.findIndex((h) =>
          String(h || "")
            .toLowerCase()
            .startsWith(label.toLowerCase()),
        );
      const cID = col("ID"),
        cStage = col("Project Stage"),
        cQty = col("Quantity"),
        cCom = col("Customer Committed"),
        cExp = col("Expected End"),
        cSO = col("Sales Order"),
        cMgr = col("Project Manager");
      if (cID >= 0) {
        const pm: Record<string, ParsedProject> = {};
        rows.slice(3).forEach((r) => {
          if (!r) return;
          const pid = String(r[cID] || "").trim();
          if (!/^NGSE-PROJ-/i.test(pid)) return;
          pm[pid] = {
            stage: cStage >= 0 ? String(r[cStage] || "").trim() : "",
            qty: cQty >= 0 ? Number(r[cQty] || 0) : 0,
            committed: cCom >= 0 ? ser2iso(r[cCom]) : null,
            expEnd: cExp >= 0 ? ser2iso(r[cExp]) : null,
            so: cSO >= 0 ? String(r[cSO] || "").trim() : "",
            mgr: cMgr >= 0 ? String(r[cMgr] || "").trim() : "",
          };
        });
        out.projMap = pm;
      }
      // Shweta's morning refresh links (rows under Loom/ERP/Data Folder header)
      const links: ParseResult["sources"] = [];
      rows.slice(3, 16).forEach((r) => {
        if (!r) return;
        const nm = String(r[0] || "").trim(),
          erp = String(r[1] || "").trim(),
          gs = String(r[2] || "").trim(),
          stamp = String(r[3] || "").trim();
        if ((erp.startsWith("http") || gs.startsWith("http")) && nm)
          links.push({ nm, erp, gs, stamp });
      });
      if (links.length) out.sources = links;
      // "Job in progress - Jobs" link data, imported alongside the links in this tab:
      // a full Jobmaster - Planning Reporting mirror starting at the second "ID" header
      let jb = -1;
      h3.forEach((h, i) => {
        if (jb < 0 && h === "ID" && h3.slice(i, i + 6).includes("Customer Tag"))
          jb = i;
      });
      if (jb >= 0) {
        const jc: Record<string, number> = {};
        h3.slice(jb, jb + 36).forEach((h, k) => {
          if (h && !(h in jc)) jc[h] = jb + k;
        });
        const gj = (r: Row, h: string): Cell =>
          jc[h] != null ? r[jc[h]] : undefined;
        const cleanN = (t: Cell) =>
          String(t || "")
            .replace(/!\[\]\([^)]*\)/g, "")
            .replace(/https?:\/\/\S+/g, "")
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 150);
        const dj = rows
          .slice(3)
          .filter((r) => r && /^20\d{8}$/.test(String(gj(r, "ID") || "")))
          .map(
            (r): ParsedJob => ({
              id: String(gj(r, "ID")),
              tag: String(gj(r, "Customer Tag") || "").trim(),
              fam:
                String(gj(r, "Product Family") || "Unassigned").trim() ||
                "Unassigned",
              cust: String(gj(r, "Customer") || "").trim(),
              val: Number(gj(r, "Value") || 0),
              tdd: ser2iso(gj(r, "Target Delivery Date Current")),
              otd: ser2iso(gj(r, "OTD Date")),
              start: ser2iso(gj(r, "Job Start Date")),
              proj: String(gj(r, "Project") || ""),
              stat: String(gj(r, "Job Status") || "").trim(),
              pct: Number(gj(r, "Production Completion %") || 0),
              note: cleanN(gj(r, "Current Status")),
              own: String(gj(r, "Project Owner") || "").trim(),
              mgmt: ser2iso(gj(r, "Management Target Date Request")),
              tp: Number(gj(r, "Throughput") || 0),
              tpv: Number(gj(r, "Throughput Expected Value (Auto)") || 0),
              tpp: Number(gj(r, "Throughput Expected pc") || 0),
              kit: Number(gj(r, "Kitting percentage") || 0),
            }),
          );
        if (dj.length) out.daJobs = dj;
      }
    } else if (
      ix["Project Stage"] != null &&
      ix["ID"] != null &&
      ix["Customer Tag"] == null
    ) {
      // standalone "Order in Progress - projects" export (Open Projects BPP)
      const pm = out.projMap || {};
      const own2 = out.owners || {};
      rows.slice(1).forEach((r) => {
        if (!r) return;
        const pid = String(g(r, "ID") || "").trim();
        if (!/^NGSE-PROJ-/i.test(pid)) return;
        const mgr = String(g(r, "Project Manager") || "").trim();
        pm[pid] = {
          ...(pm[pid] || {}),
          stage: String(g(r, "Project Stage") || "").trim(),
          committed: ser2iso(g(r, "Customer Committed Delivery")),
          expEnd: ser2iso(g(r, "Expected End Date")),
          so: String(g(r, "Sales Order") || "").trim(),
          mgr,
        } as ParsedProject;
        // JobNumbersList lets us assign the manager per job directly
        if (mgr)
          String(g(r, "JobNumbersList") || "")
            .split(/[,\s]+/)
            .forEach((jid) => {
              if (/^20\d{8}$/.test(jid) && !own2[jid]) own2[jid] = { own: mgr };
            });
      });
      out.projMap = pm;
      if (Object.keys(own2).length) out.owners = own2;
    } else if (name === "Jobmaster ERP") {
      // stale embedded ERP copy inside the PRE file — used only to backfill Job Status / Kitting %
      const hdr2 = Array.from(rows[1] || [], (h) => String(h || "").trim());
      const ix2: Record<string, number> = {};
      hdr2.forEach((h, i) => {
        if (!(h in ix2)) ix2[h] = i;
      });
      if (ix2["ID"] != null) {
        const map: Record<string, { stat: string; kit: number }> = {};
        rows.slice(2).forEach((r) => {
          if (!r) return;
          const id = String(r[ix2["ID"]] || "");
          if (!/^20\d{8}$/.test(id)) return;
          map[id] = {
            stat: String(r[ix2["Job Status"]] || "").trim(),
            kit: Number(r[ix2["Kitting percentage"]] || 0),
          };
        });
        out.statMap = map;
      }
    }
  }
  if (!out.jobs && out.daJobs && out.daJobs.length) {
    // PRIMARY: pending jobs extracted from the "Job in progress - Jobs" link data in Data Analysis
    out.jobs = out.daJobs.map((j) => {
      const m: ParsedJob = { ...j };
      const o = out.owners && out.owners[j.id];
      if (o) {
        if (!m.own) m.own = o.own || "";
        if (!m.mgmt) m.mgmt = o.mgmt ?? null;
      }
      const st = out.statMap && out.statMap[j.id];
      if (st) {
        if (!m.stat) m.stat = st.stat;
        if (!m.kit) m.kit = st.kit;
      }
      const p = out.projMap && out.projMap[j.proj];
      if (p) {
        if (!m.otd) m.otd = p.committed;
        if (!m.tdd) m.tdd = p.expEnd;
      }
      return m;
    });
    out.fromPRE = true;
    out.fromDAJobs = true;
  } else if (!out.jobs && out.preJobs && out.preJobs.length) {
    out.jobs = out.preJobs.map((j) => {
      const m: ParsedJob = { ...j, ...((out.statMap && out.statMap[j.id]) || {}) };
      const p = out.projMap && out.projMap[j.proj];
      if (p) {
        if (!m.otd) m.otd = p.committed;
        if (!m.tdd) m.tdd = p.expEnd;
        if (!m.stat && p.stage) m.stat = "Stage " + p.stage;
        if (p.so) m.note = (m.note ? m.note + " · " : "") + p.so;
      }
      return m;
    });
    out.fromPRE = true;
  }
  // final enrichment — fills blanks only, regardless of which sheet supplied the jobs
  if (out.jobs) {
    out.jobs = out.jobs.map((j) => {
      const m: ParsedJob = { ...j };
      const o = out.owners && out.owners[j.id];
      if (o) {
        if (!m.own && o.own) m.own = o.own;
        if (!m.mgmt && o.mgmt) m.mgmt = o.mgmt;
      }
      const st = out.statMap && out.statMap[j.id];
      if (st) {
        if (!m.stat) m.stat = st.stat;
        if (!m.kit) m.kit = st.kit;
      }
      const p = out.projMap && out.projMap[j.proj];
      if (p) {
        if (!m.otd) m.otd = p.committed;
        if (!m.tdd) m.tdd = p.expEnd;
        if (!m.own && p.mgr) m.own = p.mgr;
      }
      return m;
    });
  }
  return out;
}

export function linkTasks(raw: ParsedRawTask[], jobs: ParsedJob[]): LinkedTask[] {
  const ids = new Set(jobs.map((j) => j.id));
  const last4: Record<string, string> = {};
  jobs.forEach((j) => (last4[j.id.slice(-4)] = j.id));
  const proj: Record<string, string[]> = {};
  jobs.forEach((j) => (proj[j.proj] = proj[j.proj] || []).push(j.id));
  const seen = new Set<string>();
  const tasks: LinkedTask[] = [];
  const clean = (t: string, n: number) =>
    String(t)
      .replace(/!\[\]\([^)]*\)/g, "")
      .replace(/\*\*/g, "")
      .replace(/https?:\/\/\S+/g, "[link]")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, n);
  raw.forEach((r) => {
    const tj = new Set<string>();
    if (r.ref === "Jobmaster" && ids.has(r.refn)) tj.add(r.refn);
    else if (r.ref === "Project" && proj[r.refn])
      proj[r.refn].forEach((x) => tj.add(x));
    const txt = r.t + " " + r.d.slice(0, 300);
    (txt.match(/\b20\d{8}\b/g) || []).forEach((m) => ids.has(m) && tj.add(m));
    (txt.match(/[Jj]ob\s*[Nn]o\.?\s*\d{4}\b/g) || []).forEach((m) => {
      const q = m.match(/(\d{4})$/)![1];
      if (last4[q]) tj.add(last4[q]);
    });
    const head = (r.t.slice(0, 20).match(/\b(\d{4})\b/) || [])[1];
    if (head && last4[head]) tj.add(last4[head]);
    tj.forEach((jid) => {
      const key = jid + "|" + r.t.slice(0, 40);
      if (seen.has(key)) return;
      seen.add(key);
      tasks.push({
        j: jid,
        t: clean(r.t, 140),
        d: clean(r.d, 220),
        who: r.who || "unassigned",
        due: r.due,
        cat: r.cat,
      });
    });
  });
  return tasks;
}
