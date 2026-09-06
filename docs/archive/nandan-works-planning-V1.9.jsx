import { useState, useMemo, useRef, useEffect } from "react";
import * as XLSX from "xlsx";

// ============ EXCEL UPLOAD MODE (interim data source) ============
// Weekly flow: Google Sheet -> File > Download > .xlsx -> upload here.
// Recognised workbooks by their headers:
//   - Jobmaster - Planning Reporting  (jobs)
//   - To Do Dashboard                 (tasks)
//   - PRE Status (Milestones for Delivery sheet) (owners + mgmt dates)
const ser2iso = (v) => {
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
  return isNaN(d) ? null : d.toISOString().slice(0, 10);
};

function parseUpload(wb) {
  const out = {};
  for (const name of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], {
      header: 1,
      raw: true,
    });
    if (!rows.length) continue;
    const hdr = Array.from(rows[0] || [], (h) => String(h || "").trim());
    const ix = {};
    hdr.forEach((h, i) => {
      if (!(h in ix)) ix[h] = i;
    });
    const g = (r, h) => (ix[h] != null ? r[ix[h]] : undefined);
    if (ix["Customer Tag"] != null && ix["ID"] != null) {
      out.jobs = rows
        .slice(1)
        .filter((r) => r && g(r, "ID"))
        .map((r) => ({
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
        }));
    } else if (ix["Reference Type"] != null) {
      out.rawTasks = rows
        .slice(1)
        .filter(Boolean)
        .map((r) => ({
          ref: String(g(r, "Reference Type") || ""),
          refn: String(g(r, "Reference Name") || ""),
          t: String(g(r, "Todo Name") || ""),
          d: String(g(r, "Details of Task") || ""),
          who: String(g(r, "Allocated To") || "").split("@")[0],
          due: ser2iso(g(r, "Due Date")),
          cat: String(g(r, "Related to") || "General").trim() || "General",
        }));
    } else if (name === "Milestones for Delivery") {
      const own = {};
      const pjobs = [];
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
      const col = (label) =>
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
        const pm = {};
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
      const links = [];
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
        const jc = {};
        h3.slice(jb, jb + 36).forEach((h, k) => {
          if (h && !(h in jc)) jc[h] = jb + k;
        });
        const gj = (r, h) => (jc[h] != null ? r[jc[h]] : undefined);
        const cleanN = (t) =>
          String(t || "")
            .replace(/!\[\]\([^)]*\)/g, "")
            .replace(/https?:\/\/\S+/g, "")
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 150);
        const dj = rows
          .slice(3)
          .filter((r) => r && /^20\d{8}$/.test(String(gj(r, "ID") || "")))
          .map((r) => ({
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
          }));
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
        };
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
      const ix2 = {};
      hdr2.forEach((h, i) => {
        if (!(h in ix2)) ix2[h] = i;
      });
      if (ix2["ID"] != null) {
        const map = {};
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
      const m = { ...j };
      const o = out.owners && out.owners[j.id];
      if (o) {
        if (!m.own) m.own = o.own;
        if (!m.mgmt) m.mgmt = o.mgmt;
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
      const m = { ...j, ...((out.statMap && out.statMap[j.id]) || {}) };
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
      const m = { ...j };
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

function linkTasks(raw, jobs) {
  const ids = new Set(jobs.map((j) => j.id));
  const last4 = {};
  jobs.forEach((j) => (last4[j.id.slice(-4)] = j.id));
  const proj = {};
  jobs.forEach((j) => (proj[j.proj] = proj[j.proj] || []).push(j.id));
  const seen = new Set();
  const tasks = [];
  const clean = (t, n) =>
    String(t)
      .replace(/!\[\]\([^)]*\)/g, "")
      .replace(/\*\*/g, "")
      .replace(/https?:\/\/\S+/g, "[link]")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, n);
  raw.forEach((r) => {
    const tj = new Set();
    if (r.ref === "Jobmaster" && ids.has(r.refn)) tj.add(r.refn);
    else if (r.ref === "Project" && proj[r.refn])
      proj[r.refn].forEach((x) => tj.add(x));
    const txt = r.t + " " + r.d.slice(0, 300);
    (txt.match(/\b20\d{8}\b/g) || []).forEach((m) => ids.has(m) && tj.add(m));
    (txt.match(/[Jj]ob\s*[Nn]o\.?\s*\d{4}\b/g) || []).forEach((m) => {
      const q = m.match(/(\d{4})$/)[1];
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

// ================= NANDAN GSE · WORKS PLANNING SUITE · v8 =================
const LOGO =
  "data:image/png;base64,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";
const DATA = {
  jobs: [
    {
      id: "2025262537",
      tag: "TAJ SATS-HL-7.1-FC-#3-BLR",
      fam: "AGSE - Hi Lift",
      cust: "Taj Sats Air Catering Limited",
      val: 2709000.0,
      tdd: "2026-07-18",
      otd: "2026-05-21",
      start: "2026-04-30",
      proj: "NGSE-PROJ-1675",
      stat: "Q: Final Inspection",
      pct: 95.0,
      note: "WK 30: 1. hi lift work completed 2. Touch up & cleaning wip 3. Client inspection on 24th july",
      own: "Alpesh",
      mgmt: "2026-07-14",
      tp: 0.08,
      tpv: 812700.0,
      tpp: 30.0,
      kit: 100.0,
    },
    {
      id: "2026272588",
      tag: "Verni Hydrocarbon- Vayu TL- 350KG- 1Q",
      fam: "MHE - Tail Lift",
      cust: "Verni Hydrocarbons LLP",
      val: 305000.0,
      tdd: "2026-07-18",
      otd: "2026-06-30",
      start: null,
      proj: "NGSE-PROJ-1722",
      stat: "P: Subassembly Fabrication - 50%",
      pct: 70.0,
      note: "W28: Fabrication and painting done, awaiting for client confirmation on vehicle schedule",
      own: "Pankaj Sutar",
      mgmt: "2026-07-14",
      tp: 0.01,
      tpv: 91500.0,
      tpp: 30.0,
      kit: 100.0,
    },
    {
      id: "2025262538",
      tag: "TAJ SATS-HL-7.1-FC-#4-BLR",
      fam: "AGSE - Hi Lift",
      cust: "Taj Sats Air Catering Limited",
      val: 2709000.0,
      tdd: "2026-07-22",
      otd: "2026-05-23",
      start: "2026-06-09",
      proj: "NGSE-PROJ-1675",
      stat: "P: Hydraulics Stage",
      pct: 70.0,
      note: "WK30: 1. Platform mounting wip 2. Body glass fitting wip 3. Body finishing & touch up wip 4. Client inspection on 24th july",
      own: "Alpesh",
      mgmt: "2026-07-24",
      tp: 0.08,
      tpv: 812700.0,
      tpp: 30.0,
      kit: 100.0,
    },
    {
      id: "2025262504",
      tag: "EIH - HL-FC - 5.5 - #1 of 2 - MUM",
      fam: "AGSE - Hi Lift",
      cust: "EIH Limited",
      val: 2515000.0,
      tdd: "2026-07-29",
      otd: "2026-05-19",
      start: "2026-06-29",
      proj: "NGSE-PROJ-1663",
      stat: "P: Production Started",
      pct: 15.0,
      note: "W28 : Angle mounting done Body fabrication in shree balaji wip",
      own: "Alpesh",
      mgmt: "2026-07-29",
      tp: 0.08,
      tpv: 754500.0,
      tpp: 30.0,
      kit: 80.0,
    },
    {
      id: "2025262511",
      tag: "EIH - HL-FC - 6.3 - #2 of 2 -  DEL",
      fam: "AGSE - Hi Lift",
      cust: "EIH Limited",
      val: 2735000.0,
      tdd: "2026-07-29",
      otd: "2026-04-20",
      start: "2026-07-07",
      proj: "NGSE-PROJ-1664",
      stat: "P: Production Started",
      pct: 20.0,
      note: "W30:- 1. vehicle sent to shree balaji for body finishing 2. Electrical wiring harness ready",
      own: "Alpesh",
      mgmt: "2026-07-29",
      tp: 0.08,
      tpv: 820500.0,
      tpp: 30.0,
      kit: 30.0,
    },
    {
      id: "2026272589",
      tag: "Benninger-SL-1.2T-Pune - #1",
      fam: "MHE - Single Scissor Lift",
      cust: "Benninger India Pvt Ltd",
      val: 695000.0,
      tdd: "2026-07-30",
      otd: "2026-07-20",
      start: "2026-05-25",
      proj: "NGSE-PROJ-1724",
      stat: "S: Order Received",
      pct: 0.0,
      note: "W28 - GA approval done from client BOM and Manufacturing Drawing released material kitting in progress",
      own: "vikash",
      mgmt: "2026-07-30",
      tp: 0.02,
      tpv: 208500.0,
      tpp: 30.0,
      kit: 10.0,
    },
    {
      id: "2026272590",
      tag: "Benninger-SL-1.2T-Pune - #2",
      fam: "MHE - Single Scissor Lift",
      cust: "Benninger India Pvt Ltd",
      val: 695000.0,
      tdd: "2026-07-30",
      otd: "2026-07-20",
      start: "2026-05-25",
      proj: "NGSE-PROJ-1724",
      stat: "S: Order Received",
      pct: 0.0,
      note: "W28 - GA approval done from client BOM and Manufacturing Drawing released material kitting in progress",
      own: "vikash",
      mgmt: "2026-07-30",
      tp: 0.02,
      tpv: 208500.0,
      tpp: 30.0,
      kit: 10.0,
    },
    {
      id: "2025262539",
      tag: "8 BRD - TMC - Chennai - #1",
      fam: "MHE - Truck Mounted Crane",
      cust: "8 BRD Chennai",
      val: 5100000.0,
      tdd: "2026-07-31",
      otd: "2026-07-02",
      start: "2026-04-30",
      proj: "NGSE-PROJ-1679",
      stat: "P: Production Started",
      pct: 0.0,
      note: "W28: Crane fabrication and assembly in progress at hydrolift. Ladder fabrication and Mud guard fabrication will be done at NGSE. 8 BRD person can for ",
      own: "vikash",
      mgmt: "2026-07-24",
      tp: 0.15,
      tpv: 1530000.0,
      tpp: 30.0,
      kit: 90.0,
    },
    {
      id: "2025262540",
      tag: "8 BRD - TMC - Chennai - #2",
      fam: "MHE - Truck Mounted Crane",
      cust: "8 BRD Chennai",
      val: 5100000.0,
      tdd: "2026-07-31",
      otd: "2026-07-02",
      start: "2026-04-30",
      proj: "NGSE-PROJ-1679",
      stat: "P: Production Started",
      pct: 0.0,
      note: "W28: Crane fabrication and assembly in progress at hydrolift. Ladder fabrication and Mud guard fabrication will be done at NGSE. 8 BRD person can for ",
      own: "vikash",
      mgmt: "2026-07-24",
      tp: 0.15,
      tpv: 1530000.0,
      tpp: 30.0,
      kit: 90.0,
    },
    {
      id: "2026272567",
      tag: "ZOKO - H PALLET - 2T #1",
      fam: "MHE - Others",
      cust: "Zoko Aviation Solutions,DBA Tractors and Equipement (I.T.E)",
      val: 38437.0,
      tdd: "2026-07-31",
      otd: "2026-06-30",
      start: "2026-04-22",
      proj: "NGSE-PROJ-1711",
      stat: "D: GA Approval",
      pct: 0.0,
      note: "WK 27: Vendor awaiting payment to start production.",
      own: "Anil Shinde",
      mgmt: "2026-08-04",
      tp: 0.0,
      tpv: 15374.8,
      tpp: 40.0,
      kit: 40.0,
    },
    {
      id: "2026272568",
      tag: "ZOKO - H PALLET - 2T #2",
      fam: "MHE - Others",
      cust: "Zoko Aviation Solutions,DBA Tractors and Equipement (I.T.E)",
      val: 38437.0,
      tdd: "2026-07-31",
      otd: "2026-06-30",
      start: "2026-04-22",
      proj: "NGSE-PROJ-1711",
      stat: "D: GA Approval",
      pct: 0.0,
      note: "WK 27: Vendor awaiting payment to start production.",
      own: "Anil Shinde",
      mgmt: "2026-08-04",
      tp: 0.0,
      tpv: 15374.8,
      tpp: 40.0,
      kit: 40.0,
    },
    {
      id: "2026272569",
      tag: "ZOKO - H PALLET - ELEC #1",
      fam: "MHE - Others",
      cust: "Zoko Aviation Solutions,DBA Tractors and Equipement (I.T.E)",
      val: 241402.0,
      tdd: "2026-07-31",
      otd: "2026-06-30",
      start: "2026-04-22",
      proj: "NGSE-PROJ-1712",
      stat: "D: GA Approval",
      pct: 0.0,
      note: "WK 27: Vendor awaiting payment to start production.",
      own: "Anil Shinde",
      mgmt: "2026-08-04",
      tp: 0.01,
      tpv: 98974.82,
      tpp: 41.0,
      kit: 40.0,
    },
    {
      id: "2026272570",
      tag: "ZOKO - H PALLET - ELEC #2",
      fam: "MHE - Others",
      cust: "Zoko Aviation Solutions,DBA Tractors and Equipement (I.T.E)",
      val: 241402.0,
      tdd: "2026-07-31",
      otd: "2026-06-30",
      start: "2026-04-22",
      proj: "NGSE-PROJ-1712",
      stat: "D: GA Approval",
      pct: 0.0,
      note: "WK 27: Vendor awaiting payment to start production.",
      own: "Anil Shinde",
      mgmt: "2026-08-04",
      tp: 0.01,
      tpv: 98974.82,
      tpp: 41.0,
      kit: 40.0,
    },
    {
      id: "2026272571",
      tag: "ZOKO - WALKIE ESTACKER - 1.5T #1",
      fam: "MHE - Others",
      cust: "Zoko Aviation Solutions,DBA Tractors and Equipement (I.T.E)",
      val: 749517.0,
      tdd: "2026-07-31",
      otd: "2026-06-30",
      start: "2026-04-22",
      proj: "NGSE-PROJ-1713",
      stat: "D: GA Approval",
      pct: 0.0,
      note: "WK 27: Vendor awaiting payment to start production.",
      own: "Anil Shinde",
      mgmt: "2026-08-04",
      tp: 0.03,
      tpv: 269826.12,
      tpp: 36.0,
      kit: 40.0,
    },
    {
      id: "2026272572",
      tag: "ZOKO - WALKIE ESTACKER - 1.5T #2",
      fam: "MHE - Others",
      cust: "Zoko Aviation Solutions,DBA Tractors and Equipement (I.T.E)",
      val: 749517.0,
      tdd: "2026-07-31",
      otd: "2026-06-30",
      start: "2026-04-22",
      proj: "NGSE-PROJ-1713",
      stat: "D: GA Approval",
      pct: 0.0,
      note: "WK 27: Vendor awaiting payment to start production.",
      own: "Anil Shinde",
      mgmt: "2026-08-04",
      tp: 0.03,
      tpv: 269826.12,
      tpp: 36.0,
      kit: 40.0,
    },
    {
      id: "2026272573",
      tag: "ZOKO - BATTERY POWERED TRUCK - 2T #1",
      fam: "MHE - Others",
      cust: "Zoko Aviation Solutions,DBA Tractors and Equipement (I.T.E)",
      val: 1101542.0,
      tdd: "2026-07-31",
      otd: "2026-06-30",
      start: "2026-04-22",
      proj: "NGSE-PROJ-1714",
      stat: "D: GA Approval",
      pct: 0.0,
      note: "WK 27: Vendor awaiting payment to start production.",
      own: "Anil Shinde",
      mgmt: "2026-08-04",
      tp: 0.05,
      tpv: 451632.22,
      tpp: 41.0,
      kit: 40.0,
    },
    {
      id: "2026272574",
      tag: "ZOKO - BATTERY POWERED TRUCK - 2T #2",
      fam: "MHE - Others",
      cust: "Zoko Aviation Solutions,DBA Tractors and Equipement (I.T.E)",
      val: 1101542.0,
      tdd: "2026-07-31",
      otd: "2026-06-30",
      start: "2026-04-22",
      proj: "NGSE-PROJ-1714",
      stat: "D: GA Approval",
      pct: 0.0,
      note: "WK 27: Vendor awaiting payment to start production.",
      own: "Anil Shinde",
      mgmt: "2026-08-04",
      tp: 0.05,
      tpv: 451632.22,
      tpp: 41.0,
      kit: 40.0,
    },
    {
      id: "2026272575",
      tag: "Fuel Bowsers 990 Ltr Karnavati Aviation (Adani Group) - #1 of 2",
      fam: "AGSE - Fuel Bowser",
      cust: "Karnavati Aviation Pvt Ltd",
      val: 2611000.0,
      tdd: "2026-07-31",
      otd: "2026-07-31",
      start: "2026-04-28",
      proj: "NGSE-PROJ-1715",
      stat: "S: Order Received",
      pct: 20.0,
      note: "W28: Technocart has started SS tank fabrication, chassis received at vendors place",
      own: "Pankaj Sutar",
      mgmt: "2026-07-31",
      tp: 0.07,
      tpv: 704970.0,
      tpp: 27.0,
      kit: 50.0,
    },
    {
      id: "2026272594",
      tag: "BINWA-DEER RAMP-1T-1Q-#Ville Bhagad",
      fam: "Ramp",
      cust: "Binwa Automobiles & Engineering Pvt Ltd",
      val: 979400.0,
      tdd: "2026-07-31",
      otd: "2026-07-31",
      start: null,
      proj: "NGSE-PROJ-1735",
      stat: "S: Order Received",
      pct: 0.0,
      note: "WK 29: GAD approval awaited from customer. Full BOM released 13.07.2026.",
      own: "Pratish Govind",
      mgmt: "2026-07-29",
      tp: 0.03,
      tpv: 293820.0,
      tpp: 30.0,
      kit: 10.0,
    },
    {
      id: "2025262468",
      tag: "RRR-TIPL-Navy#58(IMDM - II / 1803)",
      fam: "Rapid Runway Repair",
      cust: "Transweigh (International) Pvt Ltd",
      val: 5073000.0,
      tdd: "2026-08-01",
      otd: "2026-04-15",
      start: "2026-04-01",
      proj: "NGSE-PROJ-1637",
      stat: "S: Order Received",
      pct: 40.0,
      note: "W26: We have started fabrication of base frame and stabilzer, dedicated team put for the same, Raigad to confirm delivery schedule for hopper, mixer, ",
      own: "Pankaj Sutar",
      mgmt: "2026-08-10",
      tp: 0.23,
      tpv: 2282850.0,
      tpp: 45.0,
      kit: 80.0,
    },
    {
      id: "2025262469",
      tag: "RRR-TIPL-Navy#59(IMDM - II / 1804)",
      fam: "Rapid Runway Repair",
      cust: "Transweigh (International) Pvt Ltd",
      val: 5073000.0,
      tdd: "2026-08-04",
      otd: "2026-04-15",
      start: "2026-04-01",
      proj: "NGSE-PROJ-1637",
      stat: "S: Order Received",
      pct: 20.0,
      note: "W26: We have started fabrication of base frame and stabilzer, dedicated team put for the same, Raigad to confirm delivery schedule for hopper, mixer, ",
      own: "Pankaj Sutar",
      mgmt: "2026-08-10",
      tp: 0.23,
      tpv: 2282850.0,
      tpp: 45.0,
      kit: 80.0,
    },
    {
      id: "2025262483",
      tag: "RRR-TIPL-IAF#71(IMDM - I / 1588)",
      fam: "Rapid Runway Repair",
      cust: "Transweigh (International) Pvt Ltd",
      val: 4299400.0,
      tdd: "2026-08-06",
      otd: "2026-04-15",
      start: "2026-04-01",
      proj: "NGSE-PROJ-1644",
      stat: "S: Order Received",
      pct: 40.0,
      note: "W28: Parts are under final painting, till 16th 8th and 9th unit assembly done , this job assembly will start, till the time parts shot blasting and pa",
      own: "Pankaj Sutar",
      mgmt: "2026-07-25",
      tp: 0.19,
      tpv: 1934730.0,
      tpp: 45.0,
      kit: 90.0,
    },
    {
      id: "2025262512",
      tag: "EIH - HL-FC - 6.3 - #1 of 6 - MUM",
      fam: "AGSE - Hi Lift",
      cust: "EIH Limited",
      val: 2735000.0,
      tdd: "2026-08-06",
      otd: "2026-04-20",
      start: "2026-06-17",
      proj: "NGSE-PROJ-1664",
      stat: "P: Subassembly Fabrication - 75%",
      pct: 35.0,
      note: "W30:- Electrical work - cable tray fitting wip hydraulic routing wip vehicle will send to shree balaji on 23th july",
      own: "Alpesh",
      mgmt: "2026-07-24",
      tp: 0.08,
      tpv: 820500.0,
      tpp: 30.0,
      kit: 50.0,
    },
    {
      id: "2026272560",
      tag: "EHPL-(Encalm)-HL-FC-6.3-#1-DEL",
      fam: "AGSE - Hi Lift",
      cust: "Encalm Hospitality Pvt Ltd",
      val: 3522500.0,
      tdd: "2026-08-06",
      otd: "2026-05-10",
      start: "2026-06-07",
      proj: "NGSE-PROJ-1705",
      stat: "P: Subassembly Fabrication - 50%",
      pct: 0.0,
      note: "W30 :- Scissor cutting & fabrication wip Body panel mounting done & finishing wip (in path).",
      own: "Pratish Govind",
      mgmt: "2026-08-06",
      tp: 0.11,
      tpv: 1056750.0,
      tpp: 30.0,
      kit: 20.0,
    },
    {
      id: "2025262505",
      tag: "EIH - MUM - HL-FC - 5.5 - #2 of 2",
      fam: "AGSE - Hi Lift",
      cust: "EIH Limited",
      val: 2515000.0,
      tdd: "2026-08-08",
      otd: "2026-04-20",
      start: "2026-01-01",
      proj: "NGSE-PROJ-1663",
      stat: "P: Production Started",
      pct: 0.0,
      note: "W27 : Chassis received material kitting wip Production is not stated yet",
      own: "Alpesh",
      mgmt: "2026-08-08",
      tp: 0.08,
      tpv: 754500.0,
      tpp: 30.0,
      kit: 20.0,
    },
    {
      id: "2025262555",
      tag: "TAJ SATS - FC-HL - 6.3 - #2 of 2- DEL",
      fam: "AGSE - Hi Lift",
      cust: "Taj Sats Air Catering Limited",
      val: 2709000.0,
      tdd: "2026-08-08",
      otd: "2026-05-31",
      start: "2026-06-17",
      proj: "NGSE-PROJ-1702",
      stat: "P: Subassembly Fabrication - 50%",
      pct: 15.0,
      note: "W29:- Scissor frame with cylinder transfered to EIH 6.3 hl (job no. 2511)",
      own: "Alpesh",
      mgmt: "2026-07-30",
      tp: 0.09,
      tpv: 948150.0,
      tpp: 35.0,
      kit: 60.0,
    },
    {
      id: "2023242159",
      tag: "Veda APL - Drone Transport Vehicle - #3",
      fam: "DEF - GSE",
      cust: "Veda Aeronautics Pvt Ltd",
      val: 5500000.0,
      tdd: "2026-08-11",
      otd: "2024-09-30",
      start: "2026-06-19",
      proj: "NGSE-PROJ-1086",
      stat: "M: Material Kitting Not Started",
      pct: 30.0,
      note: "W28: Base frame and runner frame fabrication completed, Body panel under procurement, design under modification for trolley and rack",
      own: "Pankaj Sutar",
      mgmt: "2026-08-08",
      tp: 0.17,
      tpv: 1650000.0,
      tpp: 30.0,
      kit: 40.0,
    },
    {
      id: "2023242162",
      tag: "Veda APL - Mobile Ground control System - #2",
      fam: "DEF - GSE",
      cust: "Veda Aeronautics Pvt Ltd",
      val: 4674500.0,
      tdd: "2026-08-11",
      otd: "2024-09-30",
      start: "2026-06-19",
      proj: "NGSE-PROJ-1087",
      stat: "M: Material Kitting Not Started",
      pct: 20.0,
      note: "W28: Base frame and body fabrication done, DG frame fabrication WIP, DG modification talk in WIP, body panel under procurement. Design modification di",
      own: "Pankaj Sutar",
      mgmt: "2026-07-30",
      tp: 0.14,
      tpv: 1402350.0,
      tpp: 30.0,
      kit: 40.0,
    },
    {
      id: "2026272576",
      tag: "Fuel Bowsers 990 Ltr Karnavati Aviation (Adani Group) - #2 of 2",
      fam: "AGSE - Fuel Bowser",
      cust: "Karnavati Aviation Pvt Ltd",
      val: 2611000.0,
      tdd: "2026-08-12",
      otd: "2026-07-31",
      start: "2026-04-28",
      proj: "NGSE-PROJ-1715",
      stat: "S: Order Received",
      pct: 0.0,
      note: "W28: Technocart has started SS tank fabrication, chassis received at vendors place",
      own: "Pankaj Sutar",
      mgmt: "2026-07-31",
      tp: 0.07,
      tpv: 704970.0,
      tpp: 27.0,
      kit: 50.0,
    },
    {
      id: "2025262513",
      tag: "EIH - HL-FC - 6.3 - #2 of 6 - MUM",
      fam: "AGSE - Hi Lift",
      cust: "EIH Limited",
      val: 2735000.0,
      tdd: "2026-08-13",
      otd: "2026-04-20",
      start: "2026-01-01",
      proj: "NGSE-PROJ-1664",
      stat: "S: Order Received",
      pct: 5.0,
      note: "W29:- chassis received material kitting wip production not started yet",
      own: "Alpesh",
      mgmt: "2026-08-18",
      tp: 0.08,
      tpv: 820500.0,
      tpp: 30.0,
      kit: 15.0,
    },
    {
      id: "2025262484",
      tag: "RRR-TIPL-IAF#72(IMDM - I / 1589)",
      fam: "Rapid Runway Repair",
      cust: "Transweigh (International) Pvt Ltd",
      val: 4299400.0,
      tdd: "2026-08-14",
      otd: "2026-04-15",
      start: "2026-04-01",
      proj: "NGSE-PROJ-1644",
      stat: "S: Order Received",
      pct: 40.0,
      note: "W28: Parts are under final painting, till 16th 8th and 9th unit assembly done , this job assembly will start, till the time parts shot blasting and pa",
      own: "Pankaj Sutar",
      mgmt: "2026-07-25",
      tp: 0.19,
      tpv: 1934730.0,
      tpp: 45.0,
      kit: 90.0,
    },
    {
      id: "2025262541",
      tag: "Afcon - Truck mounted Scissor lift - 1.5T - Maldives",
      fam: "MHE - Double Scissor Lift",
      cust: "Afcons Infrastructure Limited",
      val: 13862349.0,
      tdd: "2026-08-14",
      otd: "2026-06-30",
      start: "2026-04-27",
      proj: "NGSE-PROJ-1690",
      stat: "P: Production Started",
      pct: 0.0,
      note: "WK 29: Scissor and frame fabrication completed. Platform and railing drawings released on 11.07.26. Stabilizer drawings pending. Vehicle order pending",
      own: "Pratish Govind",
      mgmt: "2026-08-04",
      tp: 0.42,
      tpv: 4158704.7,
      tpp: 30.0,
      kit: 50.0,
    },
    {
      id: "2026272586",
      tag: "Mobile SL - Fixo - 3.5 Tons (3set of SL) #1 of 3",
      fam: "MHE - Single Scissor Lift",
      cust: "Fixotec Pipe Supports Pvt Ltd",
      val: 3245000.0,
      tdd: "2026-08-14",
      otd: "2026-06-20",
      start: "2026-06-23",
      proj: "NGSE-PROJ-1717",
      stat: "M: Material Kitting - 25%",
      pct: 0.0,
      note: "W28: 1 SL assembly done and scissor mtg bracket welding WIP, next 2 SL due to manpower still not started and lagging planned schedule. Some design cha",
      own: "Pankaj Sutar",
      mgmt: "2026-08-04",
      tp: 0.13,
      tpv: 1298000.0,
      tpp: 40.0,
      kit: 10.0,
    },
    {
      id: "2026272595",
      tag: "Mobile SL - Fixo - 3.5 Tons (3set of SL) #2 of 3",
      fam: "MHE - Single Scissor Lift",
      cust: "Fixotec Pipe Supports Pvt Ltd",
      val: 3245000.0,
      tdd: "2026-08-14",
      otd: "2026-06-20",
      start: "2026-06-23",
      proj: "NGSE-PROJ-1717",
      stat: "M: Material Kitting - 25%",
      pct: 0.0,
      note: "W28: 1 SL assembly done and scissor mtg bracket welding WIP, next 2 SL due to manpower still not started and lagging planned schedule. Some design cha",
      own: "Pankaj Sutar",
      mgmt: "2026-07-19",
      tp: 0.13,
      tpv: 1298000.0,
      tpp: 40.0,
      kit: 10.0,
    },
    {
      id: "2026272596",
      tag: "Mobile SL - Fixo - 3.5 Tons (3set of SL) #3 of 3",
      fam: "MHE - Single Scissor Lift",
      cust: "Fixotec Pipe Supports Pvt Ltd",
      val: 3245000.0,
      tdd: "2026-08-14",
      otd: "2026-06-20",
      start: "2026-06-23",
      proj: "NGSE-PROJ-1717",
      stat: "M: Material Kitting - 25%",
      pct: 0.0,
      note: "W28: 1 SL assembly done and scissor mtg bracket welding WIP, next 2 SL due to manpower still not started and lagging planned schedule. Some design cha",
      own: "Pankaj Sutar",
      mgmt: "2026-07-19",
      tp: 0.13,
      tpv: 1298000.0,
      tpp: 40.0,
      kit: 10.0,
    },
    {
      id: "2023242115",
      tag: "Spruce Engineering Co - K-Loader - Vishakhapatnam - #2",
      fam: "AGSE- LOADER",
      cust: "Spruce Engineering Co",
      val: 26900000.0,
      tdd: "2026-08-15",
      otd: "2025-06-30",
      start: "2024-05-31",
      proj: "NGSE-PROJ-1056",
      stat: "M: Material Kitting Not Started",
      pct: 0.0,
      note: "W28: After Ist K Loader",
      own: "vikash",
      mgmt: "2026-11-16",
      tp: 0.81,
      tpv: 8070000.0,
      tpp: 30.0,
      kit: 20.0,
    },
    {
      id: "2023242114",
      tag: "Spruce Engineering Co - K-Loader - Vishakhapatnam - #1",
      fam: "AGSE- LOADER",
      cust: "Spruce Engineering Co",
      val: 26900000.0,
      tdd: "2026-08-17",
      otd: "2025-04-30",
      start: "2024-05-31",
      proj: "NGSE-PROJ-1056",
      stat: "P: Assembly Fabrication - 75%",
      pct: 50.0,
      note: "W28 : top platform fixing in progress, Coupling of engine and transmission done by indo firing of engine not done",
      own: "vikash",
      mgmt: "2026-08-14",
      tp: 0.81,
      tpv: 8070000.0,
      tpp: 30.0,
      kit: 70.0,
    },
    {
      id: "2023242116",
      tag: "Spruce Engineering co - Portable Loading Ramp With Container - Vishakhapatnam - #1",
      fam: "DEF - GSE",
      cust: "Spruce Engineering Co",
      val: 450000.0,
      tdd: "2026-08-17",
      otd: "2025-04-30",
      start: "2024-02-16",
      proj: "NGSE-PROJ-1057",
      stat: "D: GA Approval",
      pct: 0.0,
      note: "W28 : Fabrication WIP",
      own: "vikash",
      mgmt: "2026-09-14",
      tp: 0.01,
      tpv: 135000.0,
      tpp: 30.0,
      kit: 90.0,
    },
    {
      id: "2023242117",
      tag: "Spruce Engineering co - Portable Loading Ramp With Container Container - Vishakhapatnam - #2",
      fam: "DEF - GSE",
      cust: "Spruce Engineering Co",
      val: 450000.0,
      tdd: "2026-08-17",
      otd: "2025-04-30",
      start: "2024-02-16",
      proj: "NGSE-PROJ-1057",
      stat: "D: GA Approval",
      pct: 0.0,
      note: "W28 : Fabrication WIP",
      own: "vikash",
      mgmt: "2026-09-14",
      tp: 0.01,
      tpv: 135000.0,
      tpp: 30.0,
      kit: 90.0,
    },
    {
      id: "2023242120",
      tag: "Spruce Eng - Container Cradle Frame 40 FT - Vishakhapatnam - #1",
      fam: "DEF - GSE",
      cust: "Spruce Engineering Co",
      val: 450000.0,
      tdd: "2026-08-17",
      otd: "2025-04-30",
      start: "2024-05-31",
      proj: "NGSE-PROJ-1058",
      stat: "D: GA Approval",
      pct: 10.0,
      note: "W28: fabrication done shot blasting and primer to be done",
      own: "vikash",
      mgmt: "2026-09-14",
      tp: 0.02,
      tpv: 157500.0,
      tpp: 35.0,
      kit: 100.0,
    },
    {
      id: "2024252266",
      tag: "Spruce Engineering Co - Container Cradle Frame 10 FT #1",
      fam: "DEF-MHE",
      cust: "Spruce Engineering Co",
      val: 150000.0,
      tdd: "2026-08-17",
      otd: "2025-04-30",
      start: "2024-10-01",
      proj: "NGSE-PROJ-1261",
      stat: "D: GA Approval",
      pct: 90.0,
      note: "W28: Fabrication complete. primer and painting to be done",
      own: "vikash",
      mgmt: "2026-09-14",
      tp: 0.0,
      tpv: 45000.0,
      tpp: 30.0,
      kit: 100.0,
    },
    {
      id: "2024252267",
      tag: "Spruce Engineering Co - Container Cradle Frame 10 FT #2",
      fam: "DEF-MHE",
      cust: "Spruce Engineering Co",
      val: 150000.0,
      tdd: "2026-08-17",
      otd: "2025-04-30",
      start: "2024-10-01",
      proj: "NGSE-PROJ-1261",
      stat: "D: GA Approval",
      pct: 80.0,
      note: "W28: Fabrication Complete. Painting to be done",
      own: "vikash",
      mgmt: "2026-09-14",
      tp: 0.0,
      tpv: 45000.0,
      tpp: 30.0,
      kit: 100.0,
    },
    {
      id: "2024252268",
      tag: "Spruce Engineering Co - Container Cradle Frame 10 FT #3",
      fam: "DEF-MHE",
      cust: "Spruce Engineering Co",
      val: 150000.0,
      tdd: "2026-08-17",
      otd: "2025-06-30",
      start: "2024-10-01",
      proj: "NGSE-PROJ-1261",
      stat: "D: GA Approval",
      pct: 90.0,
      note: "W28: Fabrication Complete. Painting to be done",
      own: "vikash",
      mgmt: "2026-09-14",
      tp: 0.0,
      tpv: 45000.0,
      tpp: 30.0,
      kit: 100.0,
    },
    {
      id: "2025262517",
      tag: "EIH - HL-FC - 6.3 - #6 of 6 - MUM",
      fam: "AGSE - Hi Lift",
      cust: "EIH Limited",
      val: 2735000.0,
      tdd: "2026-08-17",
      otd: "2026-04-20",
      start: "2026-07-09",
      proj: "NGSE-PROJ-1664",
      stat: "P: Production Started",
      pct: 5.0,
      note: "W30:- chassis received material kitting wip production not started yet",
      own: "Alpesh",
      mgmt: "2026-07-14",
      tp: 0.08,
      tpv: 820500.0,
      tpp: 30.0,
      kit: 20.0,
    },
    {
      id: "2023242160",
      tag: "Veda APL - Drone Transport Vehicle - #4",
      fam: "DEF - GSE",
      cust: "Veda Aeronautics Pvt Ltd",
      val: 5500000.0,
      tdd: "2026-08-18",
      otd: "2024-09-30",
      start: "2026-06-19",
      proj: "NGSE-PROJ-1086",
      stat: "M: Material Kitting Not Started",
      pct: 0.0,
      note: "W28: Base frame and runner frame fabrication completed, Body panel under procurement, design under modification for trolley and rack",
      own: "Pankaj Sutar",
      mgmt: "2026-08-18",
      tp: 0.17,
      tpv: 1650000.0,
      tpp: 30.0,
      kit: 100.0,
    },
    {
      id: "2025262548",
      tag: "TAJ SATS - FC-HL - 6.3 - #3 of 6 BOM",
      fam: "AGSE - Hi Lift",
      cust: "Taj Sats Air Catering Limited",
      val: 2700000.0,
      tdd: "2026-08-18",
      otd: "2026-06-04",
      start: "2026-07-20",
      proj: "NGSE-PROJ-1702",
      stat: "P: Production Started",
      pct: 10.0,
      note: "W30 :- Angle cutting wip Scissor cutting & fabrication wip",
      own: "Alpesh",
      mgmt: "2026-08-09",
      tp: 0.09,
      tpv: 945000.0,
      tpp: 35.0,
      kit: 20.0,
    },
    {
      id: "2023242133",
      tag: "Veda Def - Catapult - #7 - Noida",
      fam: "DEF-Customised",
      cust: "Veda Aeronautics Pvt Ltd",
      val: 2595000.0,
      tdd: "2026-08-19",
      otd: "2024-09-30",
      start: "2026-06-25",
      proj: "NGSE-PROJ-1063",
      stat: "P: Production Started",
      pct: 30.0,
      note: "W25: Fabrication of sub-assemblies will start by 23rd June, whereas the client still has not confirmed the bought out components expected date. DRJ to",
      own: "Pankaj Sutar",
      mgmt: "2026-07-29",
      tp: 0.08,
      tpv: 778500.0,
      tpp: 30.0,
      kit: 95.0,
    },
    {
      id: "2025262514",
      tag: "EIH - HL-FC - 6.3 - #3 of 6 - MUM",
      fam: "AGSE - Hi Lift",
      cust: "EIH Limited",
      val: 2735000.0,
      tdd: "2026-08-21",
      otd: "2026-04-20",
      start: "2026-06-25",
      proj: "NGSE-PROJ-1664",
      stat: "P: Production Started",
      pct: 10.0,
      note: "W30: chassis dismantling wip Scissor cutting done & bushing pending",
      own: "Alpesh",
      mgmt: "2026-08-21",
      tp: 0.08,
      tpv: 820500.0,
      tpp: 30.0,
      kit: 30.0,
    },
    {
      id: "2025262485",
      tag: "RRR-TIPL-IAF#73(IMDM - I / 1590)",
      fam: "Rapid Runway Repair",
      cust: "Transweigh (International) Pvt Ltd",
      val: 4299400.0,
      tdd: "2026-08-22",
      otd: "2026-04-15",
      start: "2026-04-01",
      proj: "NGSE-PROJ-1644",
      stat: "S: Order Received",
      pct: 0.0,
      note: "W26: We have started fabrication of base frame and stabilzer, dedicated team put for the same, Raigad to confirm delivery schedule for hopper, mixer, ",
      own: "Pankaj Sutar",
      mgmt: "2026-08-19",
      tp: 0.19,
      tpv: 3015000.0,
      tpp: 45.0,
      kit: 25.0,
    },
    {
      id: "2025262486",
      tag: "RRR-TIPL-IAF#74(IMDM - I / 1591)",
      fam: "Rapid Runway Repair",
      cust: "Transweigh (International) Pvt Ltd",
      val: 4299400.0,
      tdd: "2026-08-22",
      otd: "2026-05-15",
      start: "2026-04-01",
      proj: "NGSE-PROJ-1644",
      stat: "S: Order Received",
      pct: 0.0,
      note: "W25: We have started fabrication of base frame and stabilzer, dedicated team put for the same, Raigad to confirm delivery schedule for hopper, mixer, ",
      own: "Pankaj Sutar",
      mgmt: "2026-08-19",
      tp: 0.19,
      tpv: 3015000.0,
      tpp: 45.0,
      kit: 25.0,
    },
    {
      id: "2024252315",
      tag: "ACE - Mobile Workshop Van - Kenya - 1 Qty",
      fam: "BB -  Workshop Van",
      cust: "ACTION CONSTRUCTION EQUIPMENT LTD",
      val: 9000000.0,
      tdd: "2026-08-24",
      otd: "2026-06-30",
      start: "2026-02-06",
      proj: "NGSE-PROJ-1353",
      stat: "M: Material Kitting - 25%",
      pct: 0.0,
      note: "W26: Manufacturing drgs released, AL chassis may have on July end no confirmation on date from AL. Client is not accepting delivery date by August end",
      own: "Pankaj Sutar",
      mgmt: "2026-07-29",
      tp: 0.36,
      tpv: 3600000.0,
      tpp: 40.0,
      kit: 0.0,
    },
    {
      id: "2025262549",
      tag: "TAJ SATS -FC- HL - 6.3 - #4 of 6 BOM",
      fam: "AGSE - Hi Lift",
      cust: "Taj Sats Air Catering Limited",
      val: 2700000.0,
      tdd: "2026-08-24",
      otd: "2026-06-11",
      start: "2026-07-20",
      proj: "NGSE-PROJ-1702",
      stat: "S: Order Received",
      pct: 5.0,
      note: "W30 :- Angle cutting wip scissor cutting & fabrication wip",
      own: "Alpesh",
      mgmt: "2026-08-14",
      tp: 0.09,
      tpv: 945000.0,
      tpp: 35.0,
      kit: 10.0,
    },
    {
      id: "2026272610",
      tag: "FAZE 3 - SL - 5.5T - 1Q - PANIPAT",
      fam: "MHE - Single Scissor Lift",
      cust: "FAZE Three Limited",
      val: 1501738.0,
      tdd: "2026-08-24",
      otd: "2026-09-10",
      start: null,
      proj: "NGSE-PROJ-1751",
      stat: "S: Order Received",
      pct: 0.0,
      note: "WK 29: Order recd.",
      own: "",
      mgmt: null,
      tp: 0.05,
      tpv: 450521.4,
      tpp: 30.0,
      kit: 10.0,
    },
    {
      id: "2026272611",
      tag: "FAZE 3 - SL - 8T - 1Q - PANIPAT",
      fam: "Unassigned",
      cust: "FAZE Three Limited",
      val: 2009081.0,
      tdd: "2026-08-24",
      otd: "2026-09-10",
      start: null,
      proj: "NGSE-PROJ-1750",
      stat: "S: Order Received",
      pct: 0.0,
      note: "WK 29: Order recd.",
      own: "",
      mgmt: null,
      tp: 0.06,
      tpv: 602724.3,
      tpp: 30.0,
      kit: 10.0,
    },
    {
      id: "2025262515",
      tag: "EIH - HL-FC - 6.3 - #4 of 6 - MUM",
      fam: "AGSE - Hi Lift",
      cust: "EIH Limited",
      val: 2735000.0,
      tdd: "2026-08-25",
      otd: "2026-04-20",
      start: "2026-01-01",
      proj: "NGSE-PROJ-1664",
      stat: "M: Material Kitting - 75%",
      pct: 5.0,
      note: "W30:- chassis received material kitting wip production not started yet",
      own: "Alpesh",
      mgmt: "2026-08-25",
      tp: 0.08,
      tpv: 820500.0,
      tpp: 30.0,
      kit: 10.0,
    },
    {
      id: "2023242134",
      tag: "Veda Def - Catapult - #8 - Noida",
      fam: "DEF-Customised",
      cust: "Veda Aeronautics Pvt Ltd",
      val: 2595000.0,
      tdd: "2026-08-26",
      otd: "2024-09-30",
      start: "2025-01-01",
      proj: "NGSE-PROJ-1063",
      stat: "P: Production Started",
      pct: 30.0,
      note: "W25: Fabrication of sub-assemblies will start by 23rd June, whereas the client still has not confirmed the bought out components expected date. DRJ to",
      own: "Pankaj Sutar",
      mgmt: "2026-08-12",
      tp: 0.08,
      tpv: 778500.0,
      tpp: 30.0,
      kit: 95.0,
    },
    {
      id: "2025262516",
      tag: "EIH - HL-FC - 6.3 - #5 of 6 - MUM",
      fam: "AGSE - Hi Lift",
      cust: "EIH Limited",
      val: 2735000.0,
      tdd: "2026-08-29",
      otd: "2026-04-20",
      start: null,
      proj: "NGSE-PROJ-1664",
      stat: "M: Material Kitting - 75%",
      pct: 5.0,
      note: "W30:- chassis received material kitting wip production not started yet",
      own: "Alpesh",
      mgmt: "2026-08-29",
      tp: 0.08,
      tpv: 820500.0,
      tpp: 30.0,
      kit: 20.0,
    },
    {
      id: "2025262470",
      tag: "RRR-TIPL-Navy#60(IMDM - II / 1805)",
      fam: "Rapid Runway Repair",
      cust: "Transweigh (International) Pvt Ltd",
      val: 6000000.0,
      tdd: "2026-08-30",
      otd: "2026-04-15",
      start: "2026-04-01",
      proj: "NGSE-PROJ-1637",
      stat: "S: Order Received",
      pct: 5.0,
      note: "W25: We have started fabrication of base frame and stabilzer, dedicated team put for the same, Raigad to confirm delivery schedule for hopper, mixer, ",
      own: "Pankaj Sutar",
      mgmt: "2026-09-06",
      tp: 0.27,
      tpv: 2700000.0,
      tpp: 45.0,
      kit: 30.0,
    },
    {
      id: "2025262471",
      tag: "RRR-TIPL-Navy#61(IMDM - II / 1806)",
      fam: "Rapid Runway Repair",
      cust: "Transweigh (International) Pvt Ltd",
      val: 6000000.0,
      tdd: "2026-08-30",
      otd: "2026-05-15",
      start: "2026-04-01",
      proj: "NGSE-PROJ-1637",
      stat: "S: Order Received",
      pct: 5.0,
      note: "W25: We have started fabrication of base frame and stabilzer, dedicated team put for the same, Raigad to confirm delivery schedule for hopper, mixer, ",
      own: "Pankaj Sutar",
      mgmt: "2026-09-06",
      tp: 0.27,
      tpv: 2700000.0,
      tpp: 45.0,
      kit: 30.0,
    },
    {
      id: "2023242118",
      tag: "Spruce Engineering co - Portable Loading Ramp With Container - Vishakhapatnam - #3",
      fam: "DEF - GSE",
      cust: "Spruce Engineering Co",
      val: 450000.0,
      tdd: "2026-08-31",
      otd: "2025-06-30",
      start: "2024-02-16",
      proj: "NGSE-PROJ-1057",
      stat: "D: GA Approval",
      pct: 0.0,
      note: "W28: With 2nd K Loader",
      own: "vikash",
      mgmt: "2026-09-14",
      tp: 0.01,
      tpv: 135000.0,
      tpp: 30.0,
      kit: 25.0,
    },
    {
      id: "2023242119",
      tag: "Spruce Engineering co - Portable Loading Ramp With Container - Vishakhapatnam - #4",
      fam: "DEF - GSE",
      cust: "Spruce Engineering Co",
      val: 450000.0,
      tdd: "2026-08-31",
      otd: "2025-06-30",
      start: "2024-02-16",
      proj: "NGSE-PROJ-1057",
      stat: "D: GA Approval",
      pct: 0.0,
      note: "W28: With 2nd K loader",
      own: "vikash",
      mgmt: "2026-09-14",
      tp: 0.01,
      tpv: 135000.0,
      tpp: 30.0,
      kit: 25.0,
    },
    {
      id: "2023242121",
      tag: "Spruce Eng - Container Cradle Frame 40 FT - Vishakhapatnam - #2",
      fam: "DEF - GSE",
      cust: "Spruce Engineering Co",
      val: 450000.0,
      tdd: "2026-08-31",
      otd: "2025-06-30",
      start: "2024-05-31",
      proj: "NGSE-PROJ-1058",
      stat: "D: GA Approval",
      pct: 0.0,
      note: "W28: With 2nd K Loader",
      own: "vikash",
      mgmt: "2026-09-14",
      tp: 0.02,
      tpv: 157500.0,
      tpp: 35.0,
      kit: 10.0,
    },
    {
      id: "2024252269",
      tag: "Spruce Engineering Co - Container Cradle Frame 10 FT #4",
      fam: "DEF-MHE",
      cust: "Spruce Engineering Co",
      val: 150000.0,
      tdd: "2026-08-31",
      otd: "2025-06-30",
      start: "2024-10-01",
      proj: "NGSE-PROJ-1261",
      stat: "D: GA Approval",
      pct: 0.0,
      note: "W28: With 2nd K Loader",
      own: "vikash",
      mgmt: "2026-09-14",
      tp: 0.0,
      tpv: 45000.0,
      tpp: 30.0,
      kit: 0.0,
    },
    {
      id: "2024252270",
      tag: "Spruce Engineering Co - Container Cradle Frame 10 FT #5",
      fam: "DEF-MHE",
      cust: "Spruce Engineering Co",
      val: 150000.0,
      tdd: "2026-08-31",
      otd: "2025-07-30",
      start: "2024-10-01",
      proj: "NGSE-PROJ-1261",
      stat: "D: GA Approval",
      pct: 0.0,
      note: "W28: With 2nd K Loader",
      own: "vikash",
      mgmt: "2026-09-14",
      tp: 0.0,
      tpv: 45000.0,
      tpp: 30.0,
      kit: 0.0,
    },
    {
      id: "2024252271",
      tag: "Spruce Engineering Co - Container Cradle Frame 10 FT #6",
      fam: "DEF-MHE",
      cust: "Spruce Engineering Co",
      val: 150000.0,
      tdd: "2026-08-31",
      otd: "2025-07-30",
      start: "2024-10-01",
      proj: "NGSE-PROJ-1261",
      stat: "D: GA Approval",
      pct: 0.0,
      note: "W27: With 2nd K Loader",
      own: "vikash",
      mgmt: "2026-09-14",
      tp: 0.0,
      tpv: 45000.0,
      tpp: 30.0,
      kit: 0.0,
    },
    {
      id: "2026272578",
      tag: "Single Stage Scissor Lift - 500 kg - Formertron Engg #2 of 9",
      fam: "MHE - Single Scissor Lift",
      cust: "FORMERTRON ENGINEERING (INDIA) PVT LTD",
      val: 790000.0,
      tdd: "2026-08-31",
      otd: "2026-07-31",
      start: "2026-05-06",
      proj: "NGSE-PROJ-1716",
      stat: "S: Order Received",
      pct: 0.0,
      note: "WK 27: Customer approval on GAD pending",
      own: "Anil Shinde",
      mgmt: "2026-08-14",
      tp: 0.02,
      tpv: 237000.0,
      tpp: 30.0,
      kit: 10.0,
    },
    {
      id: "2026272579",
      tag: "Single Stage Scissor Lift - 500 kg - Formertron Engg #3 of 9",
      fam: "MHE - Single Scissor Lift",
      cust: "FORMERTRON ENGINEERING (INDIA) PVT LTD",
      val: 790000.0,
      tdd: "2026-08-31",
      otd: "2026-07-31",
      start: "2026-05-06",
      proj: "NGSE-PROJ-1716",
      stat: "S: Order Received",
      pct: 0.0,
      note: "WK 27: Customer approval on GAD pending.",
      own: "Anil Shinde",
      mgmt: "2026-08-14",
      tp: 0.02,
      tpv: 237000.0,
      tpp: 30.0,
      kit: 10.0,
    },
    {
      id: "2026272580",
      tag: "Single Stage Scissor Lift - 500 kg - Formertron Engg #4 of 9",
      fam: "MHE - Single Scissor Lift",
      cust: "FORMERTRON ENGINEERING (INDIA) PVT LTD",
      val: 790000.0,
      tdd: "2026-08-31",
      otd: "2026-08-31",
      start: "2026-05-06",
      proj: "NGSE-PROJ-1716",
      stat: "S: Order Received",
      pct: 0.0,
      note: "WK 27: Customer approval on GAD pending",
      own: "Anil Shinde",
      mgmt: "2026-08-14",
      tp: 0.02,
      tpv: 237000.0,
      tpp: 30.0,
      kit: 10.0,
    },
    {
      id: "2026272581",
      tag: "Single Stage Scissor Lift - 500 kg - Formertron Engg #5 of 9",
      fam: "MHE - Single Scissor Lift",
      cust: "FORMERTRON ENGINEERING (INDIA) PVT LTD",
      val: 790000.0,
      tdd: "2026-08-31",
      otd: "2026-08-31",
      start: "2026-05-06",
      proj: "NGSE-PROJ-1716",
      stat: "S: Order Received",
      pct: 0.0,
      note: "WK 27: Customer approval on GAD pending",
      own: "Anil Shinde",
      mgmt: "2026-08-14",
      tp: 0.02,
      tpv: 237000.0,
      tpp: 30.0,
      kit: 10.0,
    },
    {
      id: "2026272582",
      tag: "Single Stage Scissor Lift - 500 kg - Formertron Engg #6 of 9",
      fam: "MHE - Single Scissor Lift",
      cust: "FORMERTRON ENGINEERING (INDIA) PVT LTD",
      val: 790000.0,
      tdd: "2026-08-31",
      otd: "2026-08-31",
      start: "2026-05-06",
      proj: "NGSE-PROJ-1716",
      stat: "S: Order Received",
      pct: 0.0,
      note: "WK 27: Customer approval on GAD pending",
      own: "Anil Shinde",
      mgmt: "2026-08-14",
      tp: 0.02,
      tpv: 237000.0,
      tpp: 30.0,
      kit: 10.0,
    },
    {
      id: "2026272601",
      tag: "Globe - SL - 300 Kg - #1 of 5 - Faridabad",
      fam: "MHE - Single Scissor Lift",
      cust: "GLOBE HI-FABS PVT LTD",
      val: 540000.0,
      tdd: "2026-08-31",
      otd: "2026-08-31",
      start: null,
      proj: "NGSE-PROJ-1745",
      stat: "S: Order Received",
      pct: 0.0,
      note: "W28 : Ord rcd",
      own: "Pankaj Sutar",
      mgmt: null,
      tp: 0.02,
      tpv: 243000.0,
      tpp: 45.0,
      kit: 10.0,
    },
    {
      id: "2026272602",
      tag: "Globe - SL - 300 Kg - #2 of 5 - Faridabad",
      fam: "MHE - Single Scissor Lift",
      cust: "GLOBE HI-FABS PVT LTD",
      val: 540000.0,
      tdd: "2026-08-31",
      otd: "2026-08-31",
      start: null,
      proj: "NGSE-PROJ-1745",
      stat: "S: Order Received",
      pct: 0.0,
      note: "W28 : Ord rcd",
      own: "Pankaj Sutar",
      mgmt: null,
      tp: 0.02,
      tpv: 243000.0,
      tpp: 45.0,
      kit: 10.0,
    },
    {
      id: "2026272603",
      tag: "Globe - SL - 300 Kg - #3 of 5 - Faridabad",
      fam: "MHE - Single Scissor Lift",
      cust: "GLOBE HI-FABS PVT LTD",
      val: 540000.0,
      tdd: "2026-08-31",
      otd: "2026-08-31",
      start: null,
      proj: "NGSE-PROJ-1745",
      stat: "S: Order Received",
      pct: 0.0,
      note: "W28 : Ord rcd",
      own: "Pankaj Sutar",
      mgmt: null,
      tp: 0.02,
      tpv: 243000.0,
      tpp: 45.0,
      kit: 10.0,
    },
    {
      id: "2026272604",
      tag: "Globe - SL - 300 Kg - #4 of 5 - Faridabad",
      fam: "MHE - Single Scissor Lift",
      cust: "GLOBE HI-FABS PVT LTD",
      val: 540000.0,
      tdd: "2026-08-31",
      otd: "2026-08-31",
      start: null,
      proj: "NGSE-PROJ-1745",
      stat: "S: Order Received",
      pct: 0.0,
      note: "W28 : Ord rcd",
      own: "Pankaj Sutar",
      mgmt: null,
      tp: 0.02,
      tpv: 243000.0,
      tpp: 45.0,
      kit: 10.0,
    },
    {
      id: "2026272605",
      tag: "Globe - SL - 300 Kg - #5 of 5 - Faridabad",
      fam: "MHE - Single Scissor Lift",
      cust: "GLOBE HI-FABS PVT LTD",
      val: 540000.0,
      tdd: "2026-08-31",
      otd: "2026-08-31",
      start: null,
      proj: "NGSE-PROJ-1745",
      stat: "S: Order Received",
      pct: 0.0,
      note: "W28 : Ord rcd",
      own: "Pankaj Sutar",
      mgmt: null,
      tp: 0.02,
      tpv: 243000.0,
      tpp: 45.0,
      kit: 10.0,
    },
    {
      id: "2025262550",
      tag: "TAJ SATS -FC- HL - 6.3 - #5 of 6 BOM",
      fam: "AGSE - Hi Lift",
      cust: "Taj Sats Air Catering Limited",
      val: 2700000.0,
      tdd: "2026-09-01",
      otd: "2026-06-18",
      start: "2026-02-15",
      proj: "NGSE-PROJ-1702",
      stat: "S: Order Received",
      pct: 0.0,
      note: "W30 :- chassis received production not started yet advance received",
      own: "Alpesh",
      mgmt: "2026-08-19",
      tp: 0.09,
      tpv: 945000.0,
      tpp: 35.0,
      kit: 10.0,
    },
    {
      id: "2026272598",
      tag: "Engine Oil Service Unit - Airbus - Spain #1 of 1 (2026)",
      fam: "AGSE - Others",
      cust: "Airbus Defence and Space",
      val: 619631.0,
      tdd: "2026-09-01",
      otd: "2026-08-14",
      start: "2026-07-03",
      proj: "NGSE-PROJ-1742",
      stat: "PPC: Pre Kick Off",
      pct: 95.0,
      note: "W27: Ord rcd",
      own: "Pankaj Sutar",
      mgmt: "2026-08-14",
      tp: 0.06,
      tpv: 588649.45,
      tpp: 95.0,
      kit: 100.0,
    },
    {
      id: "2025262551",
      tag: "TAJ SATS -FC- HL - 6.3 - #6 of 6 BOM",
      fam: "AGSE - Hi Lift",
      cust: "Taj Sats Air Catering Limited",
      val: 2700000.0,
      tdd: "2026-09-03",
      otd: "2026-06-25",
      start: "2026-02-15",
      proj: "NGSE-PROJ-1702",
      stat: "M: Material Kitting - 75%",
      pct: 0.0,
      note: "W30 :- chassis received production not started yet Advance received",
      own: "Alpesh",
      mgmt: "2026-08-31",
      tp: 0.09,
      tpv: 945000.0,
      tpp: 35.0,
      kit: 10.0,
    },
    {
      id: "2026272561",
      tag: "EHPL-(Encalm)-HL-FC-6.3-#2-DEL",
      fam: "AGSE - Hi Lift",
      cust: "Encalm Hospitality Pvt Ltd",
      val: 3522500.0,
      tdd: "2026-09-05",
      otd: "2026-05-10",
      start: "2026-05-10",
      proj: "NGSE-PROJ-1705",
      stat: "S: Order Received",
      pct: 0.0,
      note: "W30:- scissor cutting & fabrication wip",
      own: "Pratish Govind",
      mgmt: "2026-08-06",
      tp: 0.11,
      tpv: 1056750.0,
      tpp: 30.0,
      kit: 20.0,
    },
    {
      id: "2026272577",
      tag: "Single Stage Scissor Lift - 500 kg - Formertron Engg #1 of 9",
      fam: "MHE - Single Scissor Lift",
      cust: "FORMERTRON ENGINEERING (INDIA) PVT LTD",
      val: 790000.0,
      tdd: "2026-09-05",
      otd: "2026-07-31",
      start: "2026-05-06",
      proj: "NGSE-PROJ-1716",
      stat: "S: Order Received",
      pct: 0.0,
      note: "WK 27: Customer approval on GAD pending",
      own: "Anil Shinde",
      mgmt: "2026-08-14",
      tp: 0.02,
      tpv: 237000.0,
      tpp: 30.0,
      kit: 10.0,
    },
    {
      id: "2025262472",
      tag: "RRR-TIPL-Navy#62(IMDM - II / 1807)",
      fam: "Rapid Runway Repair",
      cust: "Transweigh (International) Pvt Ltd",
      val: 6000000.0,
      tdd: "2026-09-07",
      otd: "2026-05-15",
      start: "2026-04-01",
      proj: "NGSE-PROJ-1637",
      stat: "S: Order Received",
      pct: 0.0,
      note: "W25: We have started fabrication of base frame and stabilzer, dedicated team put for the same, Raigad to confirm delivery schedule for hopper, mixer, ",
      own: "Pankaj Sutar",
      mgmt: "2026-09-06",
      tp: 0.27,
      tpv: 2700000.0,
      tpp: 45.0,
      kit: 25.0,
    },
    {
      id: "2025262473",
      tag: "RRR-TIPL-Navy#63(IMDM - II / 1808)",
      fam: "Rapid Runway Repair",
      cust: "Transweigh (International) Pvt Ltd",
      val: 6000000.0,
      tdd: "2026-09-07",
      otd: "2026-05-15",
      start: "2026-04-01",
      proj: "NGSE-PROJ-1637",
      stat: "S: Order Received",
      pct: 0.0,
      note: "W25: We have started fabrication of base frame and stabilzer, dedicated team put for the same, Raigad to confirm delivery schedule for hopper, mixer, ",
      own: "Pankaj Sutar",
      mgmt: "2026-09-06",
      tp: 0.27,
      tpv: 2700000.0,
      tpp: 45.0,
      kit: 25.0,
    },
    {
      id: "2023242156",
      tag: "Veda APL - Mobile Field Briefing, Planning & Analysis - #2",
      fam: "DEF - GSE",
      cust: "Veda Aeronautics Pvt Ltd",
      val: 3972000.0,
      tdd: "2026-09-14",
      otd: "2024-09-30",
      start: "2026-06-19",
      proj: "NGSE-PROJ-1089",
      stat: "M: Material Kitting Not Started",
      pct: 0.0,
      note: "W26: BoM has been shared with Kites engineering, Pooja done on 19/06, drgs shared with Kites and explained by Rajesh. Outsourcing file handed over to ",
      own: "Pankaj Sutar",
      mgmt: "2026-08-20",
      tp: 0.12,
      tpv: 1191600.0,
      tpp: 30.0,
      kit: 10.0,
    },
    {
      id: "2025262487",
      tag: "RRR-TIPL-IAF#75(IMDM - I / 1592)",
      fam: "Rapid Runway Repair",
      cust: "Transweigh (International) Pvt Ltd",
      val: 4299400.0,
      tdd: "2026-09-15",
      otd: "2026-05-15",
      start: "2026-04-01",
      proj: "NGSE-PROJ-1644",
      stat: "S: Order Received",
      pct: 25.0,
      note: "W25: We have started fabrication of base frame and stabilzer, dedicated team put for the same, Raigad to confirm delivery schedule for hopper, mixer, ",
      own: "Pankaj Sutar",
      mgmt: "2026-08-29",
      tp: 0.19,
      tpv: 3015000.0,
      tpp: 45.0,
      kit: 25.0,
    },
    {
      id: "2025262488",
      tag: "RRR-TIPL-IAF#76(IMDM - I / 1593)",
      fam: "Rapid Runway Repair",
      cust: "Transweigh (International) Pvt Ltd",
      val: 4299400.0,
      tdd: "2026-09-15",
      otd: "2026-03-31",
      start: "2026-04-01",
      proj: "NGSE-PROJ-1644",
      stat: "S: Order Received",
      pct: 30.0,
      note: "W25: We have started fabrication of base frame and stabilzer, dedicated team put for the same, Raigad to confirm delivery schedule for hopper, mixer, ",
      own: "Pankaj Sutar",
      mgmt: "2026-08-29",
      tp: 0.19,
      tpv: 3015000.0,
      tpp: 45.0,
      kit: 25.0,
    },
    {
      id: "2026272583",
      tag: "Single Stage Scissor Lift - 500 kg - Formertron Engg #7 of 9",
      fam: "MHE - Single Scissor Lift",
      cust: "FORMERTRON ENGINEERING (INDIA) PVT LTD",
      val: 790000.0,
      tdd: "2026-09-15",
      otd: "2026-09-15",
      start: "2026-05-06",
      proj: "NGSE-PROJ-1716",
      stat: "S: Order Received",
      pct: 0.0,
      note: "WK 27: Customer approval on GAD pending",
      own: "Anil Shinde",
      mgmt: "2026-08-14",
      tp: 0.02,
      tpv: 237000.0,
      tpp: 30.0,
      kit: 10.0,
    },
    {
      id: "2026272584",
      tag: "Single Stage Scissor Lift - 500 kg - Formertron Engg #8 of 9",
      fam: "MHE - Single Scissor Lift",
      cust: "FORMERTRON ENGINEERING (INDIA) PVT LTD",
      val: 790000.0,
      tdd: "2026-09-15",
      otd: "2026-09-15",
      start: "2026-05-06",
      proj: "NGSE-PROJ-1716",
      stat: "S: Order Received",
      pct: 0.0,
      note: "WK 27: Customer approval on GAD pending",
      own: "Anil Shinde",
      mgmt: "2026-08-14",
      tp: 0.02,
      tpv: 237000.0,
      tpp: 30.0,
      kit: 10.0,
    },
    {
      id: "2026272585",
      tag: "Single Stage Scissor Lift - 500 kg - Formertron Engg #9 of 9",
      fam: "MHE - Single Scissor Lift",
      cust: "FORMERTRON ENGINEERING (INDIA) PVT LTD",
      val: 790000.0,
      tdd: "2026-09-15",
      otd: "2026-09-15",
      start: "2026-05-06",
      proj: "NGSE-PROJ-1716",
      stat: "S: Order Received",
      pct: 0.0,
      note: "WK 27: Customer approval on GAD pending",
      own: "Anil Shinde",
      mgmt: "2026-08-14",
      tp: 0.02,
      tpv: 237000.0,
      tpp: 30.0,
      kit: 10.0,
    },
    {
      id: "2023242168",
      tag: "Veda APL - Munition Transport Vehicle - #2",
      fam: "DEF - GSE",
      cust: "Veda Aeronautics Pvt Ltd",
      val: 3496800.0,
      tdd: "2026-09-21",
      otd: "2024-09-30",
      start: "2026-06-19",
      proj: "NGSE-PROJ-1090",
      stat: "D: Drawing 25%",
      pct: 0.0,
      note: "W26: BoM has been shared with Kites engineering, Pooja done on 19/06, drgs shared with Kites and explained by Rajesh. Outsourcing file handed over to ",
      own: "Pankaj Sutar",
      mgmt: "2026-09-11",
      tp: 0.1,
      tpv: 1049040.0,
      tpp: 30.0,
      kit: 0.0,
    },
    {
      id: "2025262489",
      tag: "RRR-TIPL-IAF#77(IMDM - I / 1594)",
      fam: "Rapid Runway Repair",
      cust: "Transweigh (International) Pvt Ltd",
      val: 4299400.0,
      tdd: "2026-09-23",
      otd: "2026-03-31",
      start: "2026-04-01",
      proj: "NGSE-PROJ-1644",
      stat: "S: Order Received",
      pct: 85.0,
      note: "W25: We have started fabrication of base frame and stabilzer, dedicated team put for the same, Raigad to confirm delivery schedule for hopper, mixer, ",
      own: "Pankaj Sutar",
      mgmt: "2026-08-29",
      tp: 0.19,
      tpv: 3015000.0,
      tpp: 45.0,
      kit: 25.0,
    },
    {
      id: "2025262490",
      tag: "RRR-TIPL-IAF#78(IMDM - I / 1595)",
      fam: "Rapid Runway Repair",
      cust: "Transweigh (International) Pvt Ltd",
      val: 4299400.0,
      tdd: "2026-09-23",
      otd: "2026-03-31",
      start: "2026-04-01",
      proj: "NGSE-PROJ-1644",
      stat: "S: Order Received",
      pct: 99.0,
      note: "W25: We have started fabrication of base frame and stabilzer, dedicated team put for the same, Raigad to confirm delivery schedule for hopper, mixer, ",
      own: "Pankaj Sutar",
      mgmt: "2026-08-29",
      tp: 0.19,
      tpv: 3015000.0,
      tpp: 45.0,
      kit: 25.0,
    },
    {
      id: "2026272606",
      tag: "FAZE 3 - GL - 3T - 2Q - PANIPAT #1 OF 2",
      fam: "MHE - Goods Lift",
      cust: "FAZE Three Limited",
      val: 5227880.0,
      tdd: "2026-09-24",
      otd: "2026-09-10",
      start: null,
      proj: "NGSE-PROJ-1747",
      stat: "S: Order Received",
      pct: 0.0,
      note: "WK 29: Order recd.",
      own: "Anil Shinde",
      mgmt: null,
      tp: 0.16,
      tpv: 1568364.0,
      tpp: 30.0,
      kit: 10.0,
    },
    {
      id: "2026272607",
      tag: "FAZE 3 - GL - 3T - 2Q - PANIPAT #2 OF 2",
      fam: "MHE - Goods Lift",
      cust: "FAZE Three Limited",
      val: 5227880.0,
      tdd: "2026-09-24",
      otd: "2026-09-10",
      start: null,
      proj: "NGSE-PROJ-1747",
      stat: "S: Order Received",
      pct: 0.0,
      note: "WK 29: Order recd.",
      own: "Anil Shinde",
      mgmt: null,
      tp: 0.16,
      tpv: 1568364.0,
      tpp: 30.0,
      kit: 10.0,
    },
    {
      id: "2026272608",
      tag: "FAZE 3 - GL - 3T - 1Q - PANIPAT",
      fam: "Unassigned",
      cust: "FAZE Three Limited",
      val: 5026017.0,
      tdd: "2026-09-24",
      otd: "2026-09-10",
      start: null,
      proj: "NGSE-PROJ-1748",
      stat: "S: Order Received",
      pct: 0.0,
      note: "WK 29: Order recd.",
      own: "Anil Shinde",
      mgmt: null,
      tp: 0.15,
      tpv: 1507805.1,
      tpp: 30.0,
      kit: 10.0,
    },
    {
      id: "2023242135",
      tag: "Veda Def - Catapult - #9 - Noida",
      fam: "DEF-Customised",
      cust: "Veda Aeronautics Pvt Ltd",
      val: 2595000.0,
      tdd: "2026-09-25",
      otd: "2024-09-30",
      start: "2025-01-01",
      proj: "NGSE-PROJ-1063",
      stat: "M: Material Recieved",
      pct: 40.0,
      note: "W25: Fabrication of sub-assemblies will start by 23rd June, whereas the client still has not confirmed the bought out components expected date. DRJ to",
      own: "Pankaj Sutar",
      mgmt: "2026-08-12",
      tp: 0.08,
      tpv: 778500.0,
      tpp: 30.0,
      kit: 90.0,
    },
    {
      id: "2025262525",
      tag: "MALAWI CSL - HL - 5.5 - 1Q - MALAWI",
      fam: "AGSE - Export Hi Lift",
      cust: "Malawi Catering Services Limited",
      val: 10914210.0,
      tdd: "2026-09-25",
      otd: "2026-06-30",
      start: "2026-05-09",
      proj: "NGSE-PROJ-1668",
      stat: "S: Order Received",
      pct: 0.0,
      note: "W28- advance received tds sign off done production not started",
      own: "Alpesh",
      mgmt: "2026-09-04",
      tp: 0.65,
      tpv: 6548526.0,
      tpp: 60.0,
      kit: 50.0,
    },
    {
      id: "2023242166",
      tag: "Veda APL - Mobiel field crew room(Foldable) - #2",
      fam: "DEF - GSE",
      cust: "Veda Aeronautics Pvt Ltd",
      val: 6680000.0,
      tdd: "2026-09-28",
      otd: "2024-09-30",
      start: "2026-06-19",
      proj: "NGSE-PROJ-1088",
      stat: "M: Material Kitting - 25%",
      pct: 0.0,
      note: "W26: BoM has been shared with Kites engineering, Pooja done on 19/06, drgs shared with Kites and explained by Rajesh. Outsourcing file handed over to ",
      own: "Pankaj Sutar",
      mgmt: "2026-08-29",
      tp: 0.2,
      tpv: 2004000.0,
      tpp: 30.0,
      kit: 0.0,
    },
    {
      id: "2026272562",
      tag: "EHPL-(Encalm)-HL-FC-6.3-#3-DEL",
      fam: "AGSE - Hi Lift",
      cust: "Encalm Hospitality Pvt Ltd",
      val: 3522500.0,
      tdd: "2026-09-28",
      otd: "2026-05-10",
      start: "2026-05-10",
      proj: "NGSE-PROJ-1705",
      stat: "S: Order Received",
      pct: 0.0,
      note: "W29:- Chassis received production not started yet",
      own: "Pratish Govind",
      mgmt: "2026-08-06",
      tp: 0.11,
      tpv: 1056750.0,
      tpp: 30.0,
      kit: 20.0,
    },
    {
      id: "2023242136",
      tag: "Veda Def - Catapult - #10 - Noida",
      fam: "DEF-Customised",
      cust: "Veda Aeronautics Pvt Ltd",
      val: 2595000.0,
      tdd: "2026-09-29",
      otd: "2024-09-30",
      start: "2025-01-01",
      proj: "NGSE-PROJ-1063",
      stat: "M: Material Recieved",
      pct: 40.0,
      note: "W25: Fabrication of sub-assemblies will start by 23rd June, whereas the client still has not confirmed the bought out components expected date. DRJ to",
      own: "Pankaj Sutar",
      mgmt: "2026-08-12",
      tp: 0.08,
      tpv: 778500.0,
      tpp: 30.0,
      kit: 90.0,
    },
    {
      id: "2026272599",
      tag: "Self Propelled Articulating Boom - Airbus - Spain - #1 of 2",
      fam: "AAE - JCB - Boomlift",
      cust: "Airbus Defence and Space",
      val: 9887824.0,
      tdd: "2026-10-01",
      otd: "2026-12-11",
      start: "2025-11-29",
      proj: "NGSE-PROJ-1743",
      stat: "S: Order Received",
      pct: 70.0,
      note: "W27: Ord rcd",
      own: "Pankaj Sutar",
      mgmt: "2026-08-14",
      tp: 0.41,
      tpv: 4054007.84,
      tpp: 41.0,
      kit: 100.0,
    },
    {
      id: "2026272600",
      tag: "Self Propelled Articulating Boom - Airbus - Spain - #2 of 2",
      fam: "AAE - JCB - Boomlift",
      cust: "Airbus Defence and Space",
      val: 9887824.0,
      tdd: "2026-10-01",
      otd: "2026-12-11",
      start: "2025-11-29",
      proj: "NGSE-PROJ-1743",
      stat: "S: Order Received",
      pct: 70.0,
      note: "W27: Ord rcd",
      own: "Pankaj Sutar",
      mgmt: "2026-08-15",
      tp: 0.41,
      tpv: 4054007.84,
      tpp: 41.0,
      kit: 100.0,
    },
    {
      id: "2023242163",
      tag: "Veda APL - Mobile Ground control System - #3",
      fam: "DEF - GSE",
      cust: "Veda Aeronautics Pvt Ltd",
      val: 4674500.0,
      tdd: "2026-10-12",
      otd: "2024-09-30",
      start: "2026-06-19",
      proj: "NGSE-PROJ-1087",
      stat: "M: Material Kitting Not Started",
      pct: 0.0,
      note: "W26: BoM has been shared with Kites engineering, Pooja done on 19/06, drgs shared with Kites and explained by Rajesh. Outsourcing file handed over to ",
      own: "Pankaj Sutar",
      mgmt: "2026-09-20",
      tp: 0.14,
      tpv: 1402350.0,
      tpp: 30.0,
      kit: 0.0,
    },
    {
      id: "2023242164",
      tag: "Veda APL - Mobile Ground control System - #4",
      fam: "DEF - GSE",
      cust: "Veda Aeronautics Pvt Ltd",
      val: 4674500.0,
      tdd: "2026-10-20",
      otd: "2024-09-30",
      start: "2026-06-19",
      proj: "NGSE-PROJ-1087",
      stat: "M: Material Kitting Not Started",
      pct: 0.0,
      note: "W26: BoM has been shared with Kites engineering, Pooja done on 19/06, drgs shared with Kites and explained by Rajesh. Outsourcing file handed over to ",
      own: "Pankaj Sutar",
      mgmt: "2026-09-20",
      tp: 0.14,
      tpv: 1402350.0,
      tpp: 30.0,
      kit: 0.0,
    },
    {
      id: "2026272609",
      tag: "FAZE 3 - GL - 3T - 1Q - PANIPAT",
      fam: "MHE - Goods Lift",
      cust: "FAZE Three Limited",
      val: 0.0,
      tdd: "2026-10-24",
      otd: "2026-09-10",
      start: null,
      proj: "NGSE-PROJ-1749",
      stat: "S: Order Received",
      pct: 0.0,
      note: "WK 29: Order recd.",
      own: "Anil Shinde",
      mgmt: null,
      tp: 0.0,
      tpv: 0.0,
      tpp: 30.0,
      kit: 10.0,
    },
    {
      id: "2026272597",
      tag: "Druk air - HL- FC - 6.3 - 1Q Bhutan",
      fam: "AGSE - Export Hi Lift",
      cust: "DrukAir Corporation Limited",
      val: 6300000.0,
      tdd: "2026-11-27",
      otd: "2026-09-23",
      start: null,
      proj: "NGSE-PROJ-1740",
      stat: "S: Order Received",
      pct: 0.0,
      note: "",
      own: "Alpesh",
      mgmt: "2026-09-26",
      tp: 0.38,
      tpv: 3780000.0,
      tpp: 60.0,
      kit: 10.0,
    },
  ],
  tasks: [
    {
      j: "2025262537",
      t: "Taj 2537 Pending Task",
      d: "| | | | | | | Initial - Task | Photograph | | \u2610 Gressing Required Before Load testing | | | \u2610 Cabing cleaning required | | | \u2610 Cleaning required | | | \u2610 cleaning required | | | \u2610 Cleaning Required | | | \u2610 Railing not fit",
      who: "manjunathshetty",
      due: "2026-04-28",
      cat: "Projects",
    },
    {
      j: "2026272584",
      t: "1716 Formertron Scissor Lift 500kg Design Review Point ,",
      d: "1. Drive system calculations and drive mechanism review with AP and RJ sir 2. T-BOM generation 3. Part drawings generation for scissor asm, platform asm, ladder asm, drive system 4. BOM generation 5. Manufacturing drawin",
      who: "riteesh",
      due: "2026-06-01",
      cat: "Projects",
    },
    {
      j: "2026272582",
      t: "1716 Formertron Scissor Lift 500kg Design Review Point ,",
      d: "1. Drive system calculations and drive mechanism review with AP and RJ sir 2. T-BOM generation 3. Part drawings generation for scissor asm, platform asm, ladder asm, drive system 4. BOM generation 5. Manufacturing drawin",
      who: "riteesh",
      due: "2026-06-01",
      cat: "Projects",
    },
    {
      j: "2026272583",
      t: "1716 Formertron Scissor Lift 500kg Design Review Point ,",
      d: "1. Drive system calculations and drive mechanism review with AP and RJ sir 2. T-BOM generation 3. Part drawings generation for scissor asm, platform asm, ladder asm, drive system 4. BOM generation 5. Manufacturing drawin",
      who: "riteesh",
      due: "2026-06-01",
      cat: "Projects",
    },
    {
      j: "2026272578",
      t: "1716 Formertron Scissor Lift 500kg Design Review Point ,",
      d: "1. Drive system calculations and drive mechanism review with AP and RJ sir 2. T-BOM generation 3. Part drawings generation for scissor asm, platform asm, ladder asm, drive system 4. BOM generation 5. Manufacturing drawin",
      who: "riteesh",
      due: "2026-06-01",
      cat: "Projects",
    },
    {
      j: "2026272577",
      t: "1716 Formertron Scissor Lift 500kg Design Review Point ,",
      d: "1. Drive system calculations and drive mechanism review with AP and RJ sir 2. T-BOM generation 3. Part drawings generation for scissor asm, platform asm, ladder asm, drive system 4. BOM generation 5. Manufacturing drawin",
      who: "riteesh",
      due: "2026-06-01",
      cat: "Projects",
    },
    {
      j: "2026272581",
      t: "1716 Formertron Scissor Lift 500kg Design Review Point ,",
      d: "1. Drive system calculations and drive mechanism review with AP and RJ sir 2. T-BOM generation 3. Part drawings generation for scissor asm, platform asm, ladder asm, drive system 4. BOM generation 5. Manufacturing drawin",
      who: "riteesh",
      due: "2026-06-01",
      cat: "Projects",
    },
    {
      j: "2026272580",
      t: "1716 Formertron Scissor Lift 500kg Design Review Point ,",
      d: "1. Drive system calculations and drive mechanism review with AP and RJ sir 2. T-BOM generation 3. Part drawings generation for scissor asm, platform asm, ladder asm, drive system 4. BOM generation 5. Manufacturing drawin",
      who: "riteesh",
      due: "2026-06-01",
      cat: "Projects",
    },
    {
      j: "2026272585",
      t: "1716 Formertron Scissor Lift 500kg Design Review Point ,",
      d: "1. Drive system calculations and drive mechanism review with AP and RJ sir 2. T-BOM generation 3. Part drawings generation for scissor asm, platform asm, ladder asm, drive system 4. BOM generation 5. Manufacturing drawin",
      who: "riteesh",
      due: "2026-06-01",
      cat: "Projects",
    },
    {
      j: "2026272579",
      t: "1716 Formertron Scissor Lift 500kg Design Review Point ,",
      d: "1. Drive system calculations and drive mechanism review with AP and RJ sir 2. T-BOM generation 3. Part drawings generation for scissor asm, platform asm, ladder asm, drive system 4. BOM generation 5. Manufacturing drawin",
      who: "riteesh",
      due: "2026-06-01",
      cat: "Projects",
    },
    {
      j: "2026272593",
      t: "Sunlight-TL-1T-#1Q-Navi Mumbaiekjvbeflkjvbefjkvbefvjkbefjkv",
      d: "",
      who: "mukesh",
      due: "2026-07-17",
      cat: "Projects",
    },
  ],
};

// ---------- date helpers ----------
const DAY = 86400000;
const TODAY = (() => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 10);
})();
const toISO = (d) => d.toISOString().slice(0, 10);
const parseISO = (s) => new Date(s + "T00:00:00Z");
const addDays = (iso, n) => toISO(new Date(parseISO(iso).getTime() + n * DAY));
const diffDays = (a, b) => Math.round((parseISO(b) - parseISO(a)) / DAY);
const fmt = (iso) =>
  iso
    ? parseISO(iso).toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        timeZone: "UTC",
      })
    : "—";
const fmtFull = (iso) =>
  iso
    ? parseISO(iso).toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "2-digit",
        timeZone: "UTC",
      })
    : "—";
const lakh = (v) =>
  v >= 10000000
    ? (v / 10000000).toFixed(2) + " Cr"
    : (v / 100000).toFixed(1) + " L";
const initials = (s) =>
  (s || "?")
    .split(/[._\s]/)
    .map((x) => x[0])
    .join("")
    .slice(0, 3)
    .toUpperCase();
const jobNo = (id) => id.slice(-4);

// ---------- trades ----------
const TRADES = [
  { key: "fitter", label: "Fitter", short: "FIT", tiny: "F", color: "#2563EB" },
  { key: "helper", label: "Helper", short: "HLP", tiny: "H", color: "#64748B" },
  { key: "welder", label: "Welder", short: "WLD", tiny: "W", color: "#D97706" },
  {
    key: "painter",
    label: "Painter",
    short: "PNT",
    tiny: "P",
    color: "#0D9488",
  },
  {
    key: "electrician",
    label: "Electrician",
    short: "ELE",
    tiny: "E",
    color: "#DC2626",
  },
  {
    key: "hydraulic",
    label: "Hydraulic",
    short: "HYD",
    tiny: "Hd",
    color: "#7C3AED",
  },
];
const zeroCrew = () => ({
  fitter: 0,
  helper: 0,
  welder: 0,
  painter: 0,
  hydraulic: 0,
  electrician: 0,
});
const crew = (f, h, w, p, hy, e) => ({
  fitter: f,
  helper: h,
  welder: w,
  painter: p,
  hydraulic: hy,
  electrician: e,
});
const M = (name, days, pred, c) => ({ name, days, pred, crew: c, offset: 0 });

// ---------- default milestone templates by product family ----------
function templateFor(fam) {
  const F = fam || "";
  if (F.includes("Hi Lift"))
    return [
      M("Order review & BOM release", 3, 0, zeroCrew()),
      M("Chassis receipt & inspection", 2, 1, crew(1, 1, 0, 0, 0, 0)),
      M("Material kitting", 7, 1, crew(0, 2, 0, 0, 0, 0)),
      M("Scissor frame fabrication", 8, 3, crew(2, 2, 3, 0, 0, 0)),
      M("Sub-assembly fabrication", 6, 3, crew(2, 2, 2, 0, 0, 0)),
      M("Scissor assembly & cylinder mtg", 5, 4, crew(3, 2, 1, 0, 1, 0)),
      M("Van body fabrication", 8, 3, crew(2, 2, 3, 0, 0, 0)),
      M("Body mounting on chassis", 3, 7, crew(3, 2, 1, 0, 0, 0)),
      M("Hydraulic piping & powerpack", 5, 6, crew(1, 1, 0, 0, 3, 0)),
      M("Electrical wiring & panels", 5, 8, crew(0, 1, 0, 0, 0, 3)),
      M("Platform & stabilizer fitment", 4, 9, crew(2, 2, 1, 0, 1, 0)),
      M("Painting & body finishing", 6, 8, crew(0, 2, 0, 3, 0, 0)),
      M("Final assembly & decals", 4, 12, crew(3, 2, 0, 1, 0, 1)),
      M("Rain test & load test", 2, 13, crew(1, 1, 0, 0, 1, 1)),
      M("Final inspection & dispatch", 2, 14, crew(1, 2, 0, 0, 0, 0)),
    ];
  if (F.includes("Runway"))
    return [
      M("Order review & BOM release", 3, 0, zeroCrew()),
      M("Material kitting", 10, 1, crew(0, 2, 0, 0, 0, 0)),
      M("Base frame fabrication", 8, 2, crew(2, 3, 4, 0, 0, 0)),
      M("Stabilizer fabrication", 6, 2, crew(1, 2, 2, 0, 0, 0)),
      M("Hopper / mixer sub-assembly", 8, 2, crew(2, 2, 3, 0, 0, 0)),
      M("Platform fabrication", 5, 3, crew(1, 2, 2, 0, 0, 0)),
      M("Trial assembly", 5, 5, crew(3, 2, 1, 0, 0, 0)),
      M("Shot blasting & primer", 3, 7, crew(0, 2, 0, 2, 0, 0)),
      M("Final painting", 4, 8, crew(0, 1, 0, 3, 0, 0)),
      M("Hydraulic system fitment", 5, 9, crew(2, 1, 0, 0, 3, 0)),
      M("Electrical & controls", 4, 9, crew(0, 1, 0, 0, 0, 2)),
      M("Final assembly", 5, 10, crew(3, 3, 0, 1, 1, 1)),
      M("Testing & trials", 3, 12, crew(2, 1, 0, 0, 1, 1)),
      M("Inspection & dispatch", 2, 13, crew(1, 2, 0, 0, 0, 0)),
    ];
  if (
    F.includes("Scissor") ||
    F.includes("Tail Lift") ||
    F.includes("Goods Lift")
  )
    return [
      M("Order review & GA approval", 4, 0, zeroCrew()),
      M("BOM & drawing release", 3, 1, zeroCrew()),
      M("Material kitting", 7, 2, crew(0, 2, 0, 0, 0, 0)),
      M("Cutting & profiling", 3, 3, crew(1, 2, 0, 0, 0, 0)),
      M("Scissor / frame fabrication", 6, 4, crew(2, 2, 3, 0, 0, 0)),
      M("Platform fabrication", 4, 4, crew(1, 1, 2, 0, 0, 0)),
      M("Cylinder & pin assembly", 3, 5, crew(2, 1, 0, 0, 1, 0)),
      M("Trial assembly", 3, 7, crew(2, 2, 0, 0, 0, 0)),
      M("Surface prep & painting", 4, 8, crew(0, 1, 0, 2, 0, 0)),
      M("Powerpack & hydraulics", 3, 9, crew(1, 1, 0, 0, 2, 0)),
      M("Electrical & controls", 3, 9, crew(0, 1, 0, 0, 0, 2)),
      M("Final assembly & safety items", 3, 10, crew(2, 1, 0, 1, 0, 1)),
      M("Load test & QC", 2, 12, crew(1, 1, 0, 0, 1, 1)),
      M("Inspection & dispatch", 1, 13, crew(1, 1, 0, 0, 0, 0)),
    ];
  return [
    M("Order review & BOM release", 3, 0, zeroCrew()),
    M("Material kitting", 7, 1, crew(0, 2, 0, 0, 0, 0)),
    M("Cutting & profiling", 3, 2, crew(1, 2, 0, 0, 0, 0)),
    M("Main structure fabrication", 7, 3, crew(2, 2, 3, 0, 0, 0)),
    M("Sub-assembly fabrication", 5, 3, crew(1, 2, 2, 0, 0, 0)),
    M("Trial assembly", 4, 5, crew(2, 2, 1, 0, 0, 0)),
    M("Shot blasting & painting", 4, 6, crew(0, 2, 0, 2, 0, 0)),
    M("Hydraulic fitment", 3, 7, crew(1, 1, 0, 0, 2, 0)),
    M("Electrical fitment", 3, 7, crew(0, 1, 0, 0, 0, 2)),
    M("Final assembly", 3, 8, crew(2, 2, 0, 1, 0, 0)),
    M("Testing & QC", 2, 10, crew(1, 1, 0, 0, 1, 1)),
    M("Inspection & dispatch", 1, 11, crew(1, 1, 0, 0, 0, 0)),
  ];
}
const newPlan = (job) => ({
  start: job.start || TODAY,
  milestones: templateFor(job.fam).map((m) => ({
    ...m,
    crew: { ...m.crew },
    preds: m.pred ? [m.pred] : [],
    shift: "D",
  })),
});

// ---------- schedule (multiple predecessors: start = latest pred end + 1) ----------
function computeSchedule(plan) {
  const rows = [];
  plan.milestones.forEach((m, i) => {
    const preds = (m.preds || []).filter((p) => p > 0 && p <= i);
    let start;
    if (preds.length) {
      let latest = null;
      preds.forEach((p) => {
        const e = rows[p - 1].end;
        if (!latest || e > latest) latest = e;
      });
      start = addDays(latest, 1);
    } else start = addDays(plan.start, m.offset || 0);
    const end = addDays(start, Math.max(1, m.days) - 1);
    rows.push({ ...m, idx: i + 1, start, end });
  });
  return rows;
}
const isoWeek = (iso) => {
  const d = parseISO(iso);
  const t = new Date(d);
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t - y0) / DAY + 1) / 7);
};
const otdDelay = (j) =>
  j.otd && j.otd < TODAY && j.tdd && j.tdd > j.otd
    ? diffDays(j.otd, j.tdd)
    : null;
const otdColor = (otd) =>
  !otd
    ? "#8A94A0"
    : otd < TODAY
      ? "#B3261E"
      : diffDays(TODAY, otd) <= 14
        ? "#D97706"
        : "#0D7A3F";
const planEnd = (s) =>
  s.reduce((mx, r) => (r.end > mx ? r.end : mx), s[0] ? s[0].end : TODAY);
const manDays = (m) =>
  TRADES.reduce((s, t) => s + (m.crew[t.key] || 0), 0) * Math.max(1, m.days);

// due-date color: overdue red · today white · tomorrow yellow
const dueStyle = (due) => {
  if (!due) return { background: "#F4F2EC", color: "#5A6672" };
  if (due < TODAY) return { background: "#B3261E", color: "#fff" };
  if (due === TODAY)
    return {
      background: "#FFFFFF",
      color: "#22303C",
      border: "1px solid #22303C",
    };
  if (due === addDays(TODAY, 1))
    return { background: "#F5B32B", color: "#3B2A00" };
  return { background: "#DCE8F5", color: "#1B3A5C" };
};

const num = (v) => (v === 0 ? "" : v);
function CrewCell({ value, onChange, color }) {
  return (
    <input
      type="number"
      min="0"
      max="99"
      value={num(value)}
      placeholder="·"
      onChange={(e) =>
        onChange(Math.max(0, parseInt(e.target.value || "0", 10)))
      }
      className="w-9 text-center text-xs py-1 rounded border bg-white focus:outline-none"
      style={{
        borderColor: "#E2E0DA",
        color: value > 0 ? color : "#B8B5AC",
        fontWeight: value > 0 ? 700 : 400,
        fontVariantNumeric: "tabular-nums",
      }}
    />
  );
}

const TASK_CATS = [
  "Projects",
  "Production",
  "Quality",
  "Material",
  "Design",
  "Electrical",
  "Hydraulic",
  "Dispatch",
];
const ESC_LEVELS = [
  "None",
  "L1 — Supervisor",
  "L2 — Production Head",
  "L3 — Management",
];

function TaskCard({ t, onOpen }) {
  return (
    <div
      onClick={() => onOpen(t)}
      className="rounded p-2 mb-1.5 cursor-pointer border"
      style={{
        ...dueStyle(t.done ? null : t.due),
        borderColor: "rgba(0,0,0,0.08)",
        opacity: t.done ? 0.45 : 1,
      }}
    >
      <div
        className="text-xs font-semibold"
        style={{
          display: "-webkit-box",
          WebkitLineClamp: 3,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
          textDecoration: t.done ? "line-through" : "none",
        }}
      >
        {t.t}
      </div>
      <div
        className="flex items-center justify-between mt-1 text-xs"
        style={{ opacity: 0.85 }}
      >
        <span
          className="font-bold rounded px-1"
          style={{ background: "rgba(0,0,0,0.12)" }}
        >
          {initials(t.who)}
        </span>
        {t.esc && t.esc !== "None" && (
          <span
            className="font-bold rounded px-1"
            style={{ background: "#B3261E", color: "#fff", fontSize: 9 }}
          >
            ⚠ {t.esc.slice(0, 2)}
          </span>
        )}
        <span style={{ fontSize: 10 }}>{(t.cat || "").toLowerCase()}</span>
        <span style={{ fontVariantNumeric: "tabular-nums" }}>{fmt(t.due)}</span>
      </div>
    </div>
  );
}

function AddTaskFormC({ form, setForm, onSubmit, onCancel, owners = [] }) {
  return (
    <div
      className="rounded border p-2 mt-1 bg-white"
      style={{ borderColor: "#E8600A" }}
    >
      <input
        autoFocus
        placeholder="Task…"
        value={form.t}
        onChange={(e) => setForm({ ...form, t: e.target.value })}
        className="w-full text-xs border rounded px-1 py-1 mb-1"
        style={{ borderColor: "#E2E0DA" }}
      />
      <div className="flex gap-1 mb-1">
        <select
          value={form.who}
          onChange={(e) => setForm({ ...form, who: e.target.value })}
          className="w-1/2 text-xs border rounded px-1 py-1 bg-white"
          style={{ borderColor: "#E2E0DA" }}
          title="Who — project owners from the Jobmaster"
        >
          <option value="">Who?</option>
          {owners.map((o) => (
            <option key={o} value={o}>
              {initials(o)} — {o}
            </option>
          ))}
        </select>
        <input
          type="date"
          value={form.due}
          onChange={(e) => setForm({ ...form, due: e.target.value })}
          className="w-1/2 text-xs border rounded px-1 py-1"
          style={{ borderColor: "#E2E0DA" }}
        />
      </div>
      <div className="mb-1">
        <div className="text-xs mb-0.5" style={{ color: "#8A94A0" }}>
          Escalation Log
        </div>
        <select
          value={form.esc}
          onChange={(e) => setForm({ ...form, esc: e.target.value })}
          className="w-full text-xs border rounded px-1 py-1 bg-white"
          style={{ borderColor: "#E2E0DA" }}
        >
          {ESC_LEVELS.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </div>
      <div className="flex gap-1">
        <select
          value={form.cat}
          onChange={(e) => setForm({ ...form, cat: e.target.value })}
          className="flex-1 text-xs border rounded px-1 py-1 bg-white"
          style={{ borderColor: "#E2E0DA" }}
        >
          {TASK_CATS.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <button
          onClick={onSubmit}
          className="text-xs font-bold rounded px-2"
          style={{ background: "#E8600A", color: "#fff" }}
        >
          Add
        </button>
        <button
          onClick={onCancel}
          className="text-xs rounded px-1"
          style={{ color: "#8A94A0" }}
        >
          ✕
        </button>
      </div>
    </div>
  );
}

const DEFAULT_SOURCES = [
  {
    key: "jobs",
    nm: "Job in progress - Jobs",
    desc: "All active jobs — TDD, OTD, Job Status, Prod %, value, Mgmt dates (primary file)",
    erp: "https://nandanerp.in/app/jobmaster/view/report/Jobmaster%20-%20Planning%20Reporting",
    gs: "https://docs.google.com/spreadsheets/d/1OURpJfBCohWDRWTBwkBJep0AVUCqGTPWJqsz69sGwl8/edit",
  },
  {
    key: "projects",
    nm: "Order in Progress - projects",
    desc: "Project Managers (job owners) + Customer Committed / Expected End dates",
    erp: "https://nandanerp.in/app/project/view/report/Open%20Projects%20BPP",
    gs: "https://docs.google.com/spreadsheets/d/1zsFATRDFyt1SEIc7bh2MrWPGjE-XKqFW8qhZy4x7Vkg/edit",
  },
  {
    key: "tasks",
    nm: "To Do Dashboard All",
    desc: "ERP ToDos → task cards on the boards",
    erp: "https://nandanerp.in/app/todo/view/report/ToDo%20Dashboard%20All",
    gs: "https://docs.google.com/spreadsheets/d/18jCqt8d_sIHsYOYPkHFnavWwclfEMIsqCoOCVJsCxrY/edit",
  },
];

// ================================================================
export default function NandanPlanningSuite() {
  const [jobs, setJobs] = useState(DATA.jobs);
  const patchJob = (id, patch) =>
    setJobs((js) => js.map((j) => (j.id === id ? { ...j, ...patch } : j)));
  const [srcInfo, setSrcInfo] = useState(
    "embedded snapshot \u00b7 W30 Jul 2026 (upload the latest PRE to refresh)",
  );
  const [srcKind, setSrcKind] = useState("embedded");
  const [showSrc, setShowSrc] = useState(false);
  const [ownersCache, setOwnersCache] = useState({});
  const jobsRef = useRef(jobs);
  useEffect(() => {
    jobsRef.current = jobs;
  }, [jobs]);
  const fileRef = useRef(null);
  const [sources, setSources] = useState([]);
  const [showLinks, setShowLinks] = useState(false);
  const gsExport = (u) => {
    const m = String(u).match(/\/d\/([\w-]+)/);
    return m
      ? "https://docs.google.com/spreadsheets/d/" + m[1] + "/export?format=xlsx"
      : u;
  };
  const tryAutoFetch = async (src) => {
    try {
      const res = await fetch(gsExport(src.gs));
      if (!res.ok) throw new Error("HTTP " + res.status);
      const buf = await res.arrayBuffer();
      const wb2 = XLSX.read(buf, { type: "array" });
      applyParsed(parseUpload(wb2), "auto: " + src.nm, wb2.SheetNames);
    } catch (err) {
      alert(
        "Direct fetch is blocked by the browser (Google Sheets does not allow cross-site reads from a web page).\n\nUse 'Download sheet' below — it opens the same link Shweta maintains as an .xlsx download — then click Upload Excel.\n\nOnce deployed on the VPS, a small server-side fetcher does this automatically every morning.\n\n(" +
          err.message +
          ")",
      );
    }
  };
  const applyParsed = (p, label, sheetNames) => {
    if (p.sources) setSources(p.sources);
    const now = new Date().toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
    });
    setLoadedSrc((ls) => ({
      jobs: p.jobs ? now : ls.jobs,
      projects: p.projMap || p.fromPRE ? now : ls.projects,
      tasks: p.rawTasks ? now : ls.tasks,
    }));
    if (p.jobs) {
      // jobs that left the export (delivered/closed) but have a plan are
      // archived, so their baselines & proposed-vs-real remain accessible
      const newIds = new Set(p.jobs.map((j) => j.id));
      setArchived((a) => {
        const add = {};
        jobsRef.current.forEach((j) => {
          if (!newIds.has(j.id) && plans[j.id]) add[j.id] = j;
        });
        return Object.keys(add).length ? { ...a, ...add } : a;
      });
      setJobs(p.jobs.map((j) => ({ ...j, ...(ownersCache[j.id] || {}) })));
      setPrio((pr) => {
        if (!pr) return pr;
        const ids = new Set(p.jobs.map((j) => j.id));
        const kept = pr.filter((id) => ids.has(id));
        return kept.length ? kept : null;
      });
      setSrcKind(p.fromPRE ? "pre" : "jobmaster");
      setSrcInfo(
        label +
          " · " +
          p.jobs.length +
          " jobs" +
          (p.fromPRE ? " (from PRE + Data Analysis)" : "") +
          " · " +
          new Date().toLocaleTimeString("en-IN", {
            hour: "2-digit",
            minute: "2-digit",
          }),
      );
    }
    if (p.owners) {
      setOwnersCache(p.owners);
      setJobs((js) => js.map((j) => ({ ...j, ...(p.owners[j.id] || {}) })));
      setSrcInfo((x) => x + " · owners merged");
    }
    if (p.projMap && !p.jobs) {
      setJobs((js) =>
        js.map((j) => {
          const pm = p.projMap[j.proj];
          if (!pm) return j;
          return {
            ...j,
            own: j.own || pm.mgr || "",
            otd: j.otd || pm.committed,
            tdd: j.tdd || pm.expEnd,
          };
        }),
      );
      setSrcInfo((x) => x + " · project managers & dates merged");
    }
    if (p.rawTasks) {
      const lt = linkTasks(p.rawTasks, p.jobs || jobsRef.current);
      setTasks((old) => {
        // manual tasks (added in-app) are ALWAYS kept;
        // ERP-derived tasks are refreshed, carrying over ✓-done and comments
        const manual = old.filter((t) => String(t.id).startsWith("n"));
        const keyOf = (t) => t.j + "||" + (t.t || "").slice(0, 60);
        const prev = {};
        old.forEach((t) => {
          if (!String(t.id).startsWith("n")) prev[keyOf(t)] = t;
        });
        const stamp = Date.now();
        const fresh = lt.map((t, i) => {
          const pv = prev[keyOf(t)];
          return {
            ...t,
            id: "u" + stamp + "_" + i,
            done: pv ? pv.done : false,
            comments: pv && pv.comments ? pv.comments : [],
          };
        });
        return [...fresh, ...manual];
      });
      setSrcInfo(
        (x) =>
          x +
          " · " +
          lt.length +
          " ERP tasks merged (manual tasks, ✓ & comments preserved)",
      );
    }
    if (!p.jobs && !p.rawTasks && !p.owners)
      alert(
        "Workbook not recognised.\n\nSheets found: " +
          (sheetNames || []).join(", ") +
          "\n\nI accept any of Shweta's morning sheets or the full PRE:\n· 'Job in progress - Jobs' export — first row has 'ID' + 'Customer Tag' (jobs)\n· 'Order in Progress - projects' export — first row has 'ID' + 'Project Stage' (owners & committed dates)\n· 'To Do Dashboard All' export — first row has 'Reference Type' (tasks)\n· the full PRE Status workbook (Data Analysis tab)\nNone of these matched.",
      );
    else
      alert(
        "Loaded ✓ (" +
          label +
          ")\n" +
          (p.jobs
            ? "· " +
              p.jobs.length +
              " jobs from " +
              (p.fromDAJobs
                ? "PRE > Data Analysis > 'Job in progress - Jobs' link data (full Jobmaster mirror: TDD, OTD, Prod %, Job Status, Owner & Mgmt date all direct)"
                : p.fromPRE
                  ? "PRE Milestones for Delivery (fallback - Jobs-in-Progress block not found; TDD = Mgmt target; OTD from Customer Committed Date)"
                  : "Jobmaster sheet") +
              "\n"
            : "") +
          (p.owners ? "· owners/mgmt dates merged from PRE\n" : "") +
          (p.rawTasks ? "· ToDo rows parsed and linked to jobs\n" : "") +
          (p.sources
            ? "· " +
              p.sources.length +
              " morning refresh links captured (🔗 button)\n"
            : "") +
          (p.jobs && erpLog.some((e2) => e2.status === "queued")
            ? "\n⚠ " +
              erpLog.filter((e2) => e2.status === "queued").length +
              " of your logged changes are still 'to apply' in ERP — the boards now show the file's values, but nothing is lost: your full change log with ERP links is safe in the Update to ERP tab."
            : ""),
      );
  };
  const onFile = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    const rd = new FileReader();
    rd.onload = (ev) => {
      try {
        const wb = XLSX.read(ev.target.result, { type: "array" });
        applyParsed(parseUpload(wb), f.name, wb.SheetNames);
      } catch (err) {
        alert("Could not read the file: " + err.message);
      }
    };
    rd.readAsArrayBuffer(f);
    e.target.value = "";
  };
  const DEFAULT_USERS = [
    { email: "raghu@nandan.co.in", pw: "nandan100", role: "admin" },
    { email: "medhansh@nandan.co.in", pw: "nandan100", role: "admin" },
    { email: "priya@example.com", pw: "nandan100", role: "planner" },
    { email: "shweta@nandan.co.in", pw: "nandan100", role: "uploader" },
  ];
  const [users, setUsers] = useState(DEFAULT_USERS);
  const saveUsers = async (list) => {
    setUsers(list);
    try {
      if (window.storage)
        await window.storage.set("nandan-suite-users", JSON.stringify(list), true);
    } catch (e) {}
  };
  const [user, setUser] = useState(null);
  const [loginForm, setLoginForm] = useState({
    email: "raghu@nandan.co.in",
    pw: "",
    err: "",
  });
  const tryLogin = () => {
    const e = loginForm.email.trim().toLowerCase();
    const hit = users.find((u) => u.email === e && u.pw === loginForm.pw);
    if (hit) {
      setUser(e);
      setLoginForm({ email: "", pw: "", err: "" });
    } else setLoginForm((f) => ({ ...f, err: "Invalid email or password" }));
  };
  const isRaghu = user === "raghu@nandan.co.in";
  const role = user
    ? (users.find((u) => u.email === user) || {}).role ||
      (isRaghu ? "admin" : "planner")
    : null;
  const isAdmin = role === "admin";
  const [showVal, setShowVal] = useState(true);
  const V = (rupees) => (showVal ? "₹" + lakh(rupees) : "₹ •••");
  const [sync, setSync] = useState("");
  const statuses = useMemo(
    () => [
      "S: Order Received",
      "S: Client Discussion",
      "PPC: Pre Kick Off",
      "PPC: Kick Off",
      "D: GA Approval",
      "D: Drawing 25%",
      "D: Drawing 50%",
      "D: Drawing 75%",
      "D: BOM: TBOM",
      "D: BOM 50%",
      "M: Material Kitting Not Started",
      "M: Material Kitting - 25%",
      "M: Material Kitting - 50%",
      "M: Material Kitting - 75%",
      "M: Material Recieved",
      "P: Production Started",
      "P: Subassembly Fabrication - 50%",
      "P: Subassembly Fabrication - 75%",
      "P: Assembly Fabrication - 25%",
      "P: Assembly Fabrication - 50%",
      "P: Assembly Fabrication - 75%",
      "P: Assembly Fabrication - 100%",
      "P: Hydraulics Stage",
      "P: Electrical Stage",
      "P: Painting Stage",
      "Q: Final Inspection",
      "S: Pending Client Delivery",
      "D: Delivered",
      "I: Installation Not Started due to Client",
      "I: Installation in progress",
      "I: Installation Completed",
      "C: Job Handed Over",
    ],
    [],
  );
  const byTDD = useMemo(
    () =>
      [...jobs].sort((a, b) =>
        (a.tdd || "9999") < (b.tdd || "9999") ? -1 : 1,
      ),
    [jobs],
  );
  const [tab, setTab] = useState("delivery");
  const [activeId, setActiveId] = useState(byTDD[0].id);
  const [plans, setPlans] = useState(() => {
    const p = {};
    byTDD
      .slice(0, 3)
      .forEach(
        (j) =>
          (p[j.id] = newPlan({
            ...j,
            start: j.start && j.start >= TODAY ? j.start : TODAY,
          })),
      );
    return p;
  });
  const [tasks, setTasks] = useState(() =>
    DATA.tasks.map((t, i) => ({ ...t, id: "t" + i, done: false })),
  );
  const [bucket, setBucket] = useState("weekly");
  const [collapsed, setCollapsed] = useState(
    () => new Set(DATA.jobs.map((j) => j.id)),
  );
  const [subTab, setSubTab] = useState("priority");
  const [lightbox, setLightbox] = useState(null);
  const [filterCust, setFilterCust] = useState("all");
  const [filterFam, setFilterFam] = useState("all");
  const [addingTask, setAddingTask] = useState(null); // jobId when form open
  const [form, setForm] = useState({
    t: "",
    who: "",
    due: TODAY,
    cat: "Production",
    esc: "None",
  });

  const job = jobs.find((j) => j.id === activeId) || archived[activeId];
  const MAT_ITEMS = [
    "Chassis / base frame steel",
    "Structural sections & plates",
    "Hydraulic powerpack",
    "Hydraulic cylinders & hoses",
    "Control panel & wiring loom",
    "Bought-out wheels / castors",
    "Paint & consumables",
    "Fasteners & hardware",
  ];
  const [materials, setMaterials] = useState({});
  const [matForm, setMatForm] = useState({ item: "", qty: "" });
  const [planView, setPlanView] = useState("plan");
  const [erpLog, setErpLog] = useState([]);
  const [warned, setWarned] = useState(new Set());
  const [shiftSplit, setShiftSplit] = useState(false);
  const [prio, setPrio] = useState(null);
  const [archived, setArchived] = useState({});
  const [customT, setCustomT] = useState({});
  const mkPlan = (job) => ({
    start: job.start || TODAY,
    milestones: (
      customT[job.fam] ||
      null ||
      templateFor(job.fam).map((m) => ({
        ...m,
        preds: m.pred ? [m.pred] : [],
        shift: "D",
      }))
    ).map((m) => ({ ...m, crew: { ...m.crew }, preds: [...(m.preds || [])] })),
  });
  const [adminFam, setAdminFam] = useState("");
  const [uForm, setUForm] = useState({ email: "", pw: "", role: "planner" });
  const [adminRows, setAdminRows] = useState(null);
  const [newFam, setNewFam] = useState("");
  const loadAdminFam = (f) => {
    setAdminFam(f);
    setAdminRows(
      (
        customT[f] ||
        templateFor(f).map((m) => ({ ...m, preds: m.pred ? [m.pred] : [] }))
      ).map((m) => ({
        ...m,
        crew: { ...m.crew },
        preds: [...(m.preds || [])],
      })),
    );
  };
  // ---- persistence: state survives closing/reopening this artifact (per user) ----
  const [restored, setRestored] = useState(false);
  useEffect(() => {
    (async () => {
      try {
        if (!window.storage) {
          setRestored(true);
          return;
        }
        try {
          const ru = await window.storage.get("nandan-suite-users", true);
          if (ru && ru.value) {
            const ul = JSON.parse(ru.value);
            if (Array.isArray(ul) && ul.length) setUsers(ul);
          }
        } catch (e2) {}
        let r = null;
        try {
          r = await window.storage.get("nandan-suite-v1", true);
        } catch (e3) {}
        if (!r || !r.value) {
          try {
            r = await window.storage.get("nandan-suite-v1");
          } catch (e4) {}
        }
        if (r && r.value) {
          const st = JSON.parse(r.value);
          if (st.jobs && st.jobs.length) setJobs(st.jobs);
          if (st.plans) setPlans(st.plans);
          if (st.tasks) setTasks(st.tasks);
          if (st.prio) setPrio(st.prio);
          if (st.archived) setArchived(st.archived);
          if (st.erpLog) setErpLog(st.erpLog);
          if (st.materials) setMaterials(st.materials);
          if (st.srcInfo) setSrcInfo(st.srcInfo + " · restored");
          if (st.srcKind) setSrcKind(st.srcKind);
          if (st.sources) setSources(st.sources);
          if (st.customT) setCustomT(st.customT);
        }
      } catch (e) {}
      setRestored(true);
    })();
  }, []);
  useEffect(() => {
    if (!restored || !window.storage) return;
    const t = setTimeout(() => {
      try {
        window.storage.set(
          "nandan-suite-v1",
          // shared team board: everyone sees the same data (last save wins)
          JSON.stringify({
            jobs,
            plans,
            tasks,
            prio,
            archived,
            erpLog,
            materials,
            srcInfo,
            srcKind,
            sources,
            customT,
          }),
          true,
        );
      } catch (e) {}
    }, 800);
    return () => clearTimeout(t);
  }, [
    restored,
    jobs,
    plans,
    tasks,
    prio,
    archived,
    erpLog,
    materials,
    srcInfo,
    srcKind,
    sources,
    customT,
  ]);

  const [dragIdx, setDragIdx] = useState(null);
  const [delOwn, setDelOwn] = useState("all");
  const erpLinkFor = (docname) => {
    const dn = String(docname);
    if (/^20\d{8}$/.test(dn)) return "https://nandanerp.in/app/jobmaster/" + dn;
    const m4 = dn.match(/JOB\s*(\d{4})/i);
    if (m4) {
      const hit = jobsRef.current.find((j) => j.id.slice(-4) === m4[1]);
      if (hit) return "https://nandanerp.in/app/jobmaster/" + hit.id;
    }
    return null;
  };
  const pushERP = (doctype, docname, field, value) => {
    setSync(`${field} of ${docname} → "${value}" logged ✓`);
    setErpLog((l) => [
      {
        id: Date.now() + Math.random(),
        time: new Date().toLocaleTimeString("en-IN"),
        doctype,
        docname,
        field,
        value: String(value),
        status: "queued",
        link: erpLinkFor(docname),
      },
      ...l,
    ]);
  };
  const loadScrollRef = useRef(null);
  useEffect(() => {
    if (tab !== "load") return;
    const t = setTimeout(() => {
      const c = loadScrollRef.current;
      const el = c && c.querySelector && c.querySelector('[data-today="1"]');
      if (el) c.scrollLeft = Math.max(0, el.offsetLeft - c.clientWidth / 2);
    }, 60);
    return () => clearTimeout(t);
  }, [tab, bucket]);
  const [navSt, setNavSt] = useState({
    stack: [{ tab: "delivery", id: null }],
    i: 0,
  });
  const navPush = (v) =>
    setNavSt((n) => {
      const stack = n.stack.slice(0, n.i + 1);
      stack.push(v);
      return { stack, i: stack.length - 1 };
    });
  const applyNav = (v) => {
    setTab(v.tab);
    if (v.id) {
      setActiveId(v.id);
      setPlans((p) =>
        p[v.id] ? p : { ...p, [v.id]: mkPlan(jobs.find((j) => j.id === v.id)) },
      );
    }
  };
  const go = (t) => {
    setTab(t);
    navPush({ tab: t, id: activeId });
  };
  const navBack = () => {
    if (navSt.i <= 0) return;
    applyNav(navSt.stack[navSt.i - 1]);
    setNavSt({ ...navSt, i: navSt.i - 1 });
  };
  const navFwd = () => {
    if (navSt.i >= navSt.stack.length - 1) return;
    applyNav(navSt.stack[navSt.i + 1]);
    setNavSt({ ...navSt, i: navSt.i + 1 });
  };
  const openJob = (id) => {
    setActiveId(id);
    const jb = jobs.find((j) => j.id === id);
    setPlans((p) => (p[id] ? p : { ...p, [id]: newPlan(jb) }));
    setMaterials((ms) => {
      if (ms[id]) return ms;
      const recv = Math.round((MAT_ITEMS.length * (jb.kit || 0)) / 100);
      return {
        ...ms,
        [id]: MAT_ITEMS.map((it, i) => ({
          id: "mat" + i,
          item: it,
          qty: "as BOM",
          status: i < recv ? "Received" : "Pending",
        })),
      };
    });
    setPlanView("plan");
    setTab("plan");
  };
  const plan = plans[activeId];
  const setPlan = (fn) =>
    setPlans((p) => ({ ...p, [activeId]: fn(p[activeId]) }));
  const setMilestone = (mi, patch) =>
    setPlan((pl) => ({
      ...pl,
      milestones: pl.milestones.map((m, i) =>
        i === mi ? { ...m, ...patch } : m,
      ),
    }));
  const togglePred = (mi, p) =>
    setPlan((pl) => ({
      ...pl,
      milestones: pl.milestones.map((m, i) =>
        i === mi
          ? {
              ...m,
              preds: (m.preds || []).includes(p)
                ? (m.preds || []).filter((x) => x !== p)
                : [...(m.preds || []), p].sort((a, b) => a - b),
            }
          : m,
      ),
    }));
  const setCrewVal = (mi, key, v) =>
    setPlan((pl) => ({
      ...pl,
      milestones: pl.milestones.map((m, i) =>
        i === mi ? { ...m, crew: { ...m.crew, [key]: v } } : m,
      ),
    }));
  const addMilestone = () =>
    plan.milestones.length < 50 &&
    setPlan((pl) => ({
      ...pl,
      milestones: [
        ...pl.milestones,
        {
          name: `Milestone ${pl.milestones.length + 1}`,
          days: 3,
          preds: [pl.milestones.length],
          crew: zeroCrew(),
          offset: 0,
          shift: "D",
        },
      ],
    }));
  const addMilestoneNamed = (name, days) => {
    if (!plan || plan.milestones.length >= 50) return;
    setPlan((pl) => ({
      ...pl,
      milestones: [
        ...pl.milestones,
        {
          name: (name || "").trim() || `Milestone ${pl.milestones.length + 1}`,
          days: Math.max(1, parseInt(days, 10) || 1),
          preds: pl.milestones.length ? [pl.milestones.length] : [],
          crew: zeroCrew(),
          offset: 0,
          shift: "D",
        },
      ],
    }));
    pushERP(
      "Job Plan",
      "JOB " + jobNo(activeId),
      "new_milestone",
      (name || "").trim() || "Milestone",
    );
  };
  const toggleMsDone = (jid, mi) =>
    setPlans((p) => {
      const pl = p[jid];
      if (!pl) return p;
      return {
        ...p,
        [jid]: {
          ...pl,
          milestones: pl.milestones.map((m, k) =>
            k === mi
              ? {
                  ...m,
                  done: !m.done,
                  doneOn: !m.done ? TODAY : undefined,
                }
              : m,
          ),
        },
      };
    });
  const removeMilestone = (mi) =>
    setPlan((pl) => ({
      ...pl,
      milestones: pl.milestones
        .filter((_, i) => i !== mi)
        .map((m) => ({
          ...m,
          preds: (m.preds || [])
            .filter((p) => p !== mi + 1)
            .map((p) => (p > mi + 1 ? p - 1 : p)),
        })),
    }));
  const [dragMi, setDragMi] = useState(null);
  const moveMilestoneTo = (from, to) => {
    if (from == null || to == null || from === to) return;
    setPlan((pl) => {
      const oldArr = pl.milestones;
      const arr = [...oldArr];
      const [mv] = arr.splice(from, 1);
      arr.splice(to, 0, mv);
      const posMap = {};
      oldArr.forEach((m, i) => {
        posMap[i + 1] = arr.indexOf(m) + 1;
      });
      const remapped = arr.map((m) => ({
        ...m,
        preds: (m.preds || []).map((p) => posMap[p]).filter(Boolean),
      }));
      return {
        ...pl,
        milestones: remapped.map((m, idx) => ({
          ...m,
          preds: (m.preds || []).filter((p) => p <= idx),
        })),
      };
    });
  };
  const moveMilestone = (mi, dir) =>
    setPlan((pl) => {
      const j2 = mi + dir;
      if (j2 < 0 || j2 >= pl.milestones.length) return pl;
      const arr = [...pl.milestones];
      [arr[mi], arr[j2]] = [arr[j2], arr[mi]];
      const p1 = mi + 1,
        p2 = j2 + 1;
      const remapped = arr.map((m) => ({
        ...m,
        preds: (m.preds || []).map((p) => (p === p1 ? p2 : p === p2 ? p1 : p)),
      }));
      return {
        ...pl,
        milestones: remapped.map((m, idx) => ({
          ...m,
          preds: (m.preds || []).filter((p) => p <= idx),
        })),
      };
    });
  const toggleCollapse = (id) =>
    setCollapsed((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  const toggleDone = (tid) =>
    setTasks((ts) =>
      ts.map((t) => (t.id === tid ? { ...t, done: !t.done } : t)),
    );
  const addComment = (tid) => {
    const txt = cmt.trim();
    if (!txt) return;
    setTasks((ts) =>
      ts.map((t) =>
        t.id === tid
          ? {
              ...t,
              comments: [
                ...(t.comments || []),
                {
                  by: user || "user",
                  at: new Date().toLocaleString("en-IN", {
                    day: "2-digit",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  }),
                  txt,
                },
              ],
            }
          : t,
      ),
    );
    setCmt("");
  };
  const submitTask = (jid) => {
    if (!form.t.trim()) return;
    setTasks((ts) => [
      ...ts,
      {
        id: "n" + Date.now(),
        j: jid,
        t: form.t.trim(),
        d: "",
        who: form.who || "unassigned",
        due: form.due,
        cat: form.cat,
        esc: form.esc,
        done: false,
      },
    ]);
    setForm({ t: "", who: "", due: TODAY, cat: form.cat, esc: "None" });
    setAddingTask(null);
  };

  const sched = useMemo(() => (plan ? computeSchedule(plan) : []), [plan]);
  const successors = useMemo(() => {
    const map = {};
    sched.forEach((m) =>
      (m.preds || []).forEach((p) => (map[p] = map[p] || []).push(m.idx)),
    );
    return map;
  }, [sched]);
  const tradeTotals = useMemo(() => {
    const t = zeroCrew();
    sched.forEach((m) =>
      TRADES.forEach(
        (tr) => (t[tr.key] += (m.crew[tr.key] || 0) * Math.max(1, m.days)),
      ),
    );
    return t;
  }, [sched]);
  const grandTotal = TRADES.reduce((s, t) => s + tradeTotals[t.key], 0);
  const ends = sched.length ? planEnd(sched) : TODAY;
  const jobTasks = tasks.filter((t) => t.j === activeId);
  const jobCats = [...new Set(jobTasks.map((t) => t.cat))];
  const saveBaseline = () => {
    if (!plan || !sched.length) return;
    if (
      plan.baseline &&
      !window.confirm(
        "A baseline saved on " +
          fmtFull(plan.baseline.on) +
          " already exists for this job. Overwrite it with today's planned timeline?",
      )
    )
      return;
    const bl = {
      on: TODAY,
      end: ends,
      ms: sched.map((m) => ({ name: m.name, start: m.start, end: m.end })),
    };
    setPlan((pl) => ({ ...pl, baseline: bl }));
    pushERP(
      "Job Plan Baseline",
      "JOB " + jobNo(activeId),
      "baseline_end",
      fmtFull(bl.end),
    );
  };
  const msDoneCount = sched.filter((m) => m.done).length;
  const allMsDone = sched.length > 0 && msDoneCount === sched.length;
  const realEnd = allMsDone
    ? sched.reduce((mx, m) => (m.doneOn && m.doneOn > mx ? m.doneOn : mx), "")
    : null;

  // ---------- load board data ----------
  const plannedJobs = useMemo(
    () =>
      byTDD.map((j) => ({
        job: j,
        saved: !!plans[j.id],
        plan:
          plans[j.id] ||
          mkPlan({
            ...j,
            start: j.start && j.start >= TODAY ? j.start : TODAY,
          }),
      })),
    [plans, byTDD],
  );
  const load = useMemo(() => {
    const perJob = plannedJobs.map(({ job: j, plan: pl }) => ({
      job: j,
      sched: computeSchedule(pl),
    }));
    let min = null,
      max = null;
    perJob.forEach(({ sched: s }) =>
      s.forEach((m) => {
        if (!min || m.start < min) min = m.start;
        if (!max || m.end > max) max = m.end;
      }),
    );
    if (!min)
      return {
        buckets: [],
        rows: [],
        shopTrades: [],
        shopTotal: [],
        peak: 1,
        totPeak: 1,
      };
    const totalDays = diffDays(min, max) + 1;
    const dayLoad = perJob.map(({ sched: s }) => {
      const byTrade = {};
      TRADES.forEach((t) => (byTrade[t.key] = new Array(totalDays).fill(0)));
      s.forEach((m) => {
        const a = diffDays(min, m.start),
          b = diffDays(min, m.end);
        TRADES.forEach((t) => {
          const n = m.crew[t.key] || 0;
          if (!n) return;
          for (let d = a; d <= b; d++) byTrade[t.key][d] += n;
        });
      });
      return byTrade;
    });
    const buckets = [];
    const hasToday = (a, b) =>
      addDays(min, a) <= TODAY && TODAY <= addDays(min, b);
    if (bucket === "daily") {
      // no cap — every week from first to last milestone is shown
      const span = totalDays;
      for (let d = 0; d < span; d++) {
        const iso = addDays(min, d);
        buckets.push({
          a: d,
          b: d,
          label: fmt(iso),
          wk: isoWeek(iso),
          wkStart: parseISO(iso).getUTCDay() === 1 || d === 0,
          today: iso === TODAY,
        });
      }
    } else if (bucket === "weekly") {
      for (let d = 0; d < totalDays; d += 7) {
        const e = Math.min(d + 6, totalDays - 1);
        buckets.push({
          a: d,
          b: e,
          label: "W" + isoWeek(addDays(min, d)),
          sub: fmt(addDays(min, d)) + "–" + fmt(addDays(min, e)),
          wkStart: true,
          today: hasToday(d, e),
        });
      }
    } else {
      let d = 0;
      while (d < totalDays) {
        const dt = parseISO(addDays(min, d));
        const label = dt.toLocaleDateString("en-IN", {
          month: "short",
          year: "2-digit",
          timeZone: "UTC",
        });
        const nm = new Date(
          Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() + 1, 1),
        );
        const b = Math.min(diffDays(min, toISO(nm)) - 1, totalDays - 1);
        buckets.push({ a: d, b, label, today: hasToday(d, b) });
        d = b + 1;
      }
    }
    const cellVal = (arr, a, b) => {
      if (bucket === "daily") return arr[a];
      let s = 0;
      for (let d = a; d <= b; d++) s += arr[d];
      return s;
    };
    const rows = perJob.map((pj, ji) => {
      const trades = TRADES.map((t) => ({
        trade: t,
        cells: buckets.map(({ a, b }) => cellVal(dayLoad[ji][t.key], a, b)),
      }));
      const totals = buckets.map((_, bi) =>
        trades.reduce((s, tr) => s + tr.cells[bi], 0),
      );
      return { job: pj.job, trades, totals };
    });
    const shopTrades = TRADES.map((t, ti) => ({
      trade: t,
      cells: buckets.map((_, bi) =>
        rows.reduce((s, r) => s + r.trades[ti].cells[bi], 0),
      ),
    }));
    const shopTotal = buckets.map((_, bi) =>
      shopTrades.reduce((s, tr) => s + tr.cells[bi], 0),
    );
    const peak = Math.max(
      1,
      ...rows.flatMap((r) => r.trades.flatMap((tr) => tr.cells)),
    );
    const totPeak = Math.max(1, ...rows.flatMap((r) => r.totals));
    return { buckets, rows, shopTrades, shopTotal, peak, totPeak };
  }, [plannedJobs, bucket]);

  const heat = (v, peak) => {
    if (!v) return { background: "#FFFFFF", color: "#D5D2C9" };
    const r = Math.min(1, v / peak);
    if (r > 0.85) return { background: "#B3261E", color: "#fff" };
    if (r > 0.65) return { background: "#E8600A", color: "#fff" };
    if (r > 0.4) return { background: "#F5B32B", color: "#3B2A00" };
    return { background: "#DCE8F5", color: "#1B3A5C" };
  };

  // ---------- tasking board data ----------
  const custs = useMemo(
    () => [...new Set(jobs.map((j) => j.cust))].sort(),
    [jobs],
  );
  const fams = useMemo(
    () => [...new Set(jobs.map((j) => j.fam))].sort(),
    [jobs],
  );
  const owners = useMemo(
    () => [...new Set(jobs.map((j) => j.own).filter(Boolean))].sort(),
    [jobs],
  );
  const [filterOwn, setFilterOwn] = useState("all");
  const [taskAll, setTaskAll] = useState(false);
  const [showPastMs, setShowPastMs] = useState(false);
  const [msForm, setMsForm] = useState({ open: false, name: "", days: 3 });
  const [taskView, setTaskView] = useState("board");
  const [loadedSrc, setLoadedSrc] = useState({
    jobs: null,
    projects: null,
    tasks: null,
  });
  const [cmt, setCmt] = useState("");
  const [calMonth, setCalMonth] = useState(TODAY.slice(0, 7));
  const taskingJobs = useMemo(() => {
    const withTasks = taskAll
      ? jobs
      : jobs.filter((j) => tasks.some((t) => t.j === j.id));
    return withTasks
      .filter(
        (j) =>
          (filterCust === "all" || j.cust === filterCust) &&
          (filterFam === "all" || j.fam === filterFam) &&
          (filterOwn === "all" || j.own === filterOwn),
      )
      .sort((a, b) => ((a.tdd || "9999") < (b.tdd || "9999") ? -1 : 1));
  }, [jobs, tasks, filterCust, filterFam, filterOwn, taskAll]);

  // ---------- delivery board groupings ----------
  const groupBy = (key) => {
    const g = {};
    byTDD.forEach((j) => (g[j[key]] = g[j[key]] || []).push(j));
    return Object.entries(g).sort((a, b) =>
      (a[1][0].tdd || "9999") < (b[1][0].tdd || "9999") ? -1 : 1,
    );
  };

  const JobLink = ({ j }) => (
    <button
      onClick={() => openJob(j.id)}
      className="font-bold underline decoration-dotted"
      style={{ color: "#1B3A5C" }}
      title={"Open milestone plan for " + j.tag}
    >
      {jobNo(j.id)}
    </button>
  );
  const Chip = ({ label, value, color, bg }) => (
    <div className="rounded px-2 py-1" style={{ background: bg || "#F4F2EC" }}>
      <div className="text-xs" style={{ color: "#8A94A0" }}>
        {label}
      </div>
      <div
        className="text-sm font-bold"
        style={{
          color: color || "#22303C",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </div>
    </div>
  );

  if (!user)
    return (
      <div
        className="min-h-screen flex items-center justify-center p-4"
        style={{
          background: "#16232F",
          fontFamily: "'Segoe UI', system-ui, sans-serif",
        }}
      >
        <div
          className="bg-white rounded-lg p-6 w-full"
          style={{ maxWidth: 380, borderTop: "4px solid #E8600A" }}
        >
          <div className="flex justify-center mb-3">
            <img src={LOGO} alt="Nandan GSE" style={{ height: 40 }} />
          </div>
          <div
            className="text-center font-bold text-lg"
            style={{ color: "#16232F" }}
          >
            Works Planning Suite
          </div>
          <div
            className="text-center text-xs mb-4"
            style={{ color: "#8A94A0" }}
          >
            🔒 Restricted access — authorised users only
          </div>
          <input
            placeholder="Email"
            value={loginForm.email}
            onChange={(e) =>
              setLoginForm({ ...loginForm, email: e.target.value, err: "" })
            }
            className="w-full border rounded px-3 py-2 text-sm mb-2"
            style={{ borderColor: "#D9D6CD" }}
          />
          <input
            type="password"
            placeholder="Password"
            value={loginForm.pw}
            onKeyDown={(e) => e.key === "Enter" && tryLogin()}
            onChange={(e) =>
              setLoginForm({ ...loginForm, pw: e.target.value, err: "" })
            }
            className="w-full border rounded px-3 py-2 text-sm mb-2"
            style={{ borderColor: "#D9D6CD" }}
          />
          {loginForm.err && (
            <div
              className="text-xs font-bold mb-2"
              style={{ color: "#B3261E" }}
            >
              {loginForm.err}
            </div>
          )}
          <button
            onClick={tryLogin}
            className="w-full py-2 rounded font-bold text-sm"
            style={{ background: "#E8600A", color: "#fff" }}
          >
            Sign in
          </button>
          <div
            className="text-xs mt-3 text-center"
            style={{ color: "#B8B5AC" }}
          >
            In ERPNext this screen is the ERP login itself — one session,
            role-based access. Note: this prototype keeps one shared team board
            — data you upload or edit is visible to all authorised users.
          </div>
        </div>
      </div>
    );

  if (role === "uploader")
    return (
      <div
        className="min-h-screen"
        style={{
          background: "#F1EFE9",
          fontFamily: "'Segoe UI', system-ui, sans-serif",
          color: "#22303C",
        }}
      >
        <div
          style={{ background: "#16232F", borderBottom: "3px solid #E8600A" }}
          className="px-4 py-2.5 flex items-center justify-between flex-wrap gap-2"
        >
          <div className="flex items-center gap-3">
            <div className="rounded bg-white px-2 py-1">
              <img src={LOGO} alt="Nandan GSE" style={{ height: 30 }} />
            </div>
            <div>
              <div
                className="text-xs tracking-widest font-bold"
                style={{ color: "#E8600A" }}
              >
                WORKS PLANNING SUITE · V 1.9
              </div>
              <div className="text-white font-bold">
                🌅 Morning Data Update
              </div>
            </div>
          </div>
          <span
            className="text-xs rounded px-2 py-1.5"
            style={{
              background: "#0D161F",
              color: "#8FA1B3",
              border: "1px solid #22303C",
            }}
          >
            👤 {user} · uploader{" "}
            <button
              onClick={() => setUser(null)}
              className="ml-1 font-bold"
              style={{ color: "#E8600A" }}
            >
              Logout
            </button>
          </span>
        </div>
        <div className="p-4" style={{ maxWidth: 860, margin: "0 auto" }}>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls"
            onChange={onFile}
            style={{ display: "none" }}
          />
          <div
            className="bg-white rounded-lg border p-4"
            style={{ borderColor: "#E2E0DA", borderTop: "4px solid #E8600A" }}
          >
            <div className="font-bold mb-1" style={{ color: "#16232F" }}>
              Good morning! 3 files, 3 clicks — after the 7:30 AM refresh
            </div>
            <div className="text-xs mb-3" style={{ color: "#8A94A0" }}>
              For each row: ⬇ Download the sheet, then ⬆ Upload the file you
              just downloaded. I detect which file it is automatically. When all
              three show ✓, you are done for the day.
            </div>
            <table className="w-full text-xs">
              <tbody>
                {DEFAULT_SOURCES.map((src, i) => (
                  <tr
                    key={src.key}
                    className="border-t align-top"
                    style={{
                      borderColor: "#EFEDE7",
                      background: i % 2 ? "#FAF9F5" : "#fff",
                    }}
                  >
                    <td
                      className="px-2 py-2.5 font-bold text-center"
                      style={{ color: "#E8600A", width: 26 }}
                    >
                      {i + 1}
                    </td>
                    <td className="px-2 py-2.5" style={{ minWidth: 180 }}>
                      <div className="font-bold" style={{ color: "#1B3A5C" }}>
                        {src.nm}
                      </div>
                      <div style={{ color: "#8A94A0" }}>{src.desc}</div>
                    </td>
                    <td className="px-2 py-2.5">
                      <div className="flex gap-1.5 flex-wrap items-center">
                        <a
                          href={gsExport(src.gs)}
                          className="font-bold rounded px-2.5 py-1.5"
                          style={{
                            background: "#1B3A5C",
                            color: "#fff",
                            textDecoration: "none",
                          }}
                        >
                          ⬇ Download
                        </a>
                        <button
                          onClick={() =>
                            fileRef.current && fileRef.current.click()
                          }
                          className="font-bold rounded px-2.5 py-1.5"
                          style={{ background: "#E8600A", color: "#fff" }}
                        >
                          ⬆ Upload
                        </button>
                        {loadedSrc[src.key] ? (
                          <span
                            className="font-bold rounded px-2 py-1.5"
                            style={{ background: "#E6F4EA", color: "#0D7A3F" }}
                          >
                            ✓ loaded {loadedSrc[src.key]}
                          </span>
                        ) : (
                          <span
                            className="rounded px-2 py-1.5"
                            style={{ background: "#FFF3E0", color: "#D97706" }}
                          >
                            ⏳ pending
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div
              className="text-xs mt-3 rounded px-2 py-1.5"
              style={{ background: "#F4F2EC", color: "#5A6672" }}
            >
              Data: {srcInfo}
            </div>
          </div>
        </div>
      </div>
    );

  return (
    <div
      className="min-h-screen"
      style={{
        background: "#F1EFE9",
        fontFamily: "'Segoe UI', system-ui, sans-serif",
        color: "#22303C",
      }}
    >
      {/* ===== header (frozen) ===== */}
      <div
        style={{
          background: "#16232F",
          borderBottom: "3px solid #E8600A",
          position: "sticky",
          top: 0,
          zIndex: 45,
        }}
        className="px-4 py-2.5"
      >
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <div className="rounded bg-white px-2 py-1">
              <img src={LOGO} alt="Nandan GSE" style={{ height: 34 }} />
            </div>
            <div>
              <div
                className="text-xs tracking-widest font-bold"
                style={{ color: "#E8600A" }}
              >
                WORKS PLANNING SUITE{" "}
                <span
                  style={{
                    background: "#E8600A",
                    color: "#fff",
                    borderRadius: 3,
                    padding: "1px 5px",
                    marginLeft: 6,
                  }}
                >
                  V 1.9
                </span>
              </div>
              <h1 className="text-lg font-bold text-white leading-tight">
                Milestones · Load · Tasking · Delivery
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={navBack}
              disabled={navSt.i <= 0}
              className="text-sm rounded px-2 py-1.5 font-bold"
              style={{
                background: "#0D161F",
                color: navSt.i <= 0 ? "#3A4A5A" : "#F5B32B",
                border: "1px solid #22303C",
              }}
              title="Back"
            >
              ◀
            </button>
            <button
              onClick={navFwd}
              disabled={navSt.i >= navSt.stack.length - 1}
              className="text-sm rounded px-2 py-1.5 font-bold"
              style={{
                background: "#0D161F",
                color:
                  navSt.i >= navSt.stack.length - 1 ? "#3A4A5A" : "#F5B32B",
                border: "1px solid #22303C",
              }}
              title="Forward"
            >
              ▶
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={onFile}
              style={{ display: "none" }}
            />
            <button
              onClick={() => fileRef.current && fileRef.current.click()}
              className="text-xs rounded px-3 py-1.5 font-bold"
              style={{ background: "#E8600A", color: "#fff" }}
            >
              ⬆ Upload Excel
            </button>
            <button
              onClick={() => setShowSrc(true)}
              className="text-xs rounded px-2 py-1.5 font-bold"
              style={{
                background: "#0D161F",
                color: "#8FA1B3",
                border: "1px solid #22303C",
              }}
              title="Where each field comes from in the uploaded Excel"
            >
              ⓘ Source
            </button>
            <button
              onClick={() => setShowLinks(true)}
              className="text-xs rounded px-2 py-1.5 font-bold"
              style={{
                background: "#0D161F",
                color: sources.length ? "#7BC67E" : "#8FA1B3",
                border: "1px solid #22303C",
              }}
              title="Shweta's morning refresh links from the PRE Data Analysis tab"
            >
              🌅 Morning update{" "}
              {Object.values(loadedSrc).filter(Boolean).length}/3
            </button>
            <select
              value={showVal ? "with" : "without"}
              onChange={(e) => setShowVal(e.target.value === "with")}
              className="text-xs rounded px-2 py-1.5 font-semibold"
              style={{
                background: "#0D161F",
                color: "#F5B32B",
                border: "1px solid #22303C",
              }}
            >
              <option value="with">With value ₹</option>
              <option value="without">Without value</option>
            </select>
            <span
              className="text-xs rounded px-2 py-1.5"
              style={{
                background: "#0D161F",
                color: "#8FA1B3",
                border: "1px solid #22303C",
              }}
            >
              👤 {user}{" "}
              <button
                onClick={() => setUser(null)}
                className="ml-1 font-bold"
                style={{ color: "#E8600A" }}
              >
                Logout
              </button>
            </span>
            <div
              className="flex gap-1 rounded p-1 flex-wrap"
              style={{ background: "#0D161F" }}
            >
              {[
                ["delivery", "Job Delivery Board"],
                ["load", "Load Board"],
                ["plan", "Job Plan"],
                ["tasking", "Nandan Tasking"],
                [
                  "erp",
                  `Update to ERP${erpLog.filter((l) => l.status === "queued").length ? " (" + erpLog.filter((l) => l.status === "queued").length + ")" : ""}`,
                ],
                ...(isAdmin ? [["admin", "Admin ⚙"]] : []),
              ].map(([k, l]) => (
                <button
                  key={k}
                  onClick={() => go(k)}
                  className="px-3 py-1.5 rounded text-sm font-semibold"
                  style={
                    tab === k
                      ? { background: "#E8600A", color: "#fff" }
                      : { color: "#8FA1B3" }
                  }
                >
                  {l}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div
          className="text-xs mt-1 flex gap-3 flex-wrap"
          style={{ color: "#3A4A5A" }}
        >
          <span>🔒 Restricted — visible only to authorised planning users</span>
          <span style={{ color: "#F5B32B" }}>Data: {srcInfo}</span>
        </div>
      </div>

      {/* ================= JOB PLAN ================= */}
      {tab === "plan" && job && plan && (
        <div className="p-4">
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <select
              value={activeId}
              onChange={(e) => openJob(e.target.value)}
              className="px-2 py-1.5 rounded border bg-white text-sm font-semibold"
              style={{ borderColor: "#D9D6CD", maxWidth: 420 }}
            >
              {byTDD.map((j) => (
                <option key={j.id} value={j.id}>
                  {jobNo(j.id)} · {j.tag}
                </option>
              ))}
              {Object.keys(archived).length > 0 && (
                <optgroup label="— delivered / no longer in the export (plans archived) —">
                  {Object.values(archived).map((j) => (
                    <option key={j.id} value={j.id}>
                      ✓ {jobNo(j.id)} · {j.tag}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
            <span className="text-xs" style={{ color: "#8A94A0" }}>
              {Object.keys(plans).length} of {jobs.length} jobs planned · pick
              any job to start its plan
            </span>
          </div>

          {/* job header card — Job No + Customer Tag + ERP dates */}
          <div
            className="bg-white rounded-lg p-3 mb-3 border"
            style={{ borderColor: "#E2E0DA", borderLeft: "5px solid #E8600A" }}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span
                    className="text-2xl font-bold"
                    style={{ color: "#16232F" }}
                  >
                    JOB {jobNo(job.id)}
                  </span>
                  <span className="text-xs" style={{ color: "#8A94A0" }}>
                    {job.id}
                  </span>
                </div>
                <div
                  className="text-sm font-semibold"
                  style={{ color: "#1B3A5C" }}
                >
                  {job.tag}
                </div>
                <div className="text-xs mt-0.5" style={{ color: "#8A94A0" }}>
                  {job.cust} · {job.fam} · {V(job.val)} · {job.stat}
                </div>
              </div>
              <div className="flex gap-2 flex-wrap">
                <div
                  className="rounded px-2 py-1"
                  style={{ background: "#FBEDEA" }}
                >
                  <div className="text-xs" style={{ color: "#8A94A0" }}>
                    TARGET DELIVERY (ERP) ✎
                  </div>
                  <input
                    type="date"
                    value={job.tdd || ""}
                    onChange={(e) => {
                      patchJob(job.id, { tdd: e.target.value });
                      pushERP(
                        "Jobmaster",
                        "JOB " + jobNo(job.id),
                        "target_delivery_date_current",
                        fmtFull(e.target.value),
                      );
                    }}
                    className="text-sm font-bold bg-transparent"
                    style={{ color: "#B3261E", border: "none" }}
                  />
                </div>
                <Chip
                  label="OTD DATE (ERP)"
                  value={
                    fmtFull(job.otd) +
                    (otdDelay(job) ? " · +" + otdDelay(job) + "d late" : "")
                  }
                  color={otdColor(job.otd)}
                />
                <div
                  className="rounded px-2 py-1"
                  style={{ background: isRaghu ? "#F3EEFB" : "#F4F2EC" }}
                  title={
                    isRaghu
                      ? "Editable — you are raghu@nandan.co.in"
                      : "Editable only by raghu@nandan.co.in"
                  }
                >
                  <div className="text-xs" style={{ color: "#8A94A0" }}>
                    MGMT TARGET {isRaghu ? "✎" : "🔒"}
                  </div>
                  {isRaghu ? (
                    <input
                      type="date"
                      value={job.mgmt || ""}
                      onChange={(e) => {
                        patchJob(job.id, { mgmt: e.target.value });
                        pushERP(
                          "Jobmaster",
                          "JOB " + jobNo(job.id),
                          "mgmt_target_date",
                          fmtFull(e.target.value),
                        );
                      }}
                      className="text-sm font-bold bg-transparent"
                      style={{ color: "#7C3AED", border: "none" }}
                    />
                  ) : (
                    <div
                      className="text-sm font-bold"
                      style={{ color: "#7C3AED" }}
                    >
                      {fmtFull(job.mgmt)}
                    </div>
                  )}
                </div>
                <Chip
                  label="PLAN END"
                  value={fmtFull(ends)}
                  color={ends > (job.tdd || "9999") ? "#B3261E" : "#0D7A3F"}
                />
                <Chip
                  label="TOTAL MAN-DAYS"
                  value={grandTotal + " md"}
                  color="#E8600A"
                />
                <Chip label="COMPLETION" value={job.pct + "%"} />
                {job.own && (
                  <Chip label="PROJECT OWNER" value={job.own} color="#1B3A5C" />
                )}
                {plan && (
                  <Chip
                    label="MILESTONES DONE"
                    value={msDoneCount + " / " + sched.length}
                    color={allMsDone ? "#0D7A3F" : "#22303C"}
                  />
                )}
                {plan && plan.baseline && (
                  <div
                    className="rounded px-2 py-1"
                    style={{ background: "#EFF6EF", border: "1px dashed #0D7A3F" }}
                  >
                    <div className="text-xs" style={{ color: "#8A94A0" }}>
                      📌 BASELINE ({fmt(plan.baseline.on)})
                    </div>
                    <div className="text-sm font-bold" style={{ color: "#0D7A3F" }}>
                      ends {fmtFull(plan.baseline.end)}
                      {(() => {
                        const d = diffDays(plan.baseline.end, ends);
                        return d ? (
                          <span style={{ color: d > 0 ? "#B3261E" : "#0D7A3F" }}>
                            {" "}· {d > 0 ? "+" : ""}{d}d now
                          </span>
                        ) : null;
                      })()}
                    </div>
                  </div>
                )}
                {plan && plan.baseline && allMsDone && (
                  <div
                    className="rounded px-2 py-1"
                    style={{ background: "#F3EEFB", border: "1px solid #7C3AED" }}
                    title="Planned timeline captured at baseline vs the day the last milestone was checked off"
                  >
                    <div className="text-xs font-bold" style={{ color: "#7C3AED" }}>
                      PROPOSED vs REAL
                    </div>
                    <div className="text-sm font-bold" style={{ color: "#22303C" }}>
                      {fmt(plan.baseline.end)} → {fmt(realEnd || TODAY)}{" "}
                      {(() => {
                        const d = diffDays(plan.baseline.end, realEnd || TODAY);
                        return (
                          <span style={{ color: d > 0 ? "#B3261E" : "#0D7A3F" }}>
                            ({d > 0 ? "+" : ""}{d}d)
                          </span>
                        );
                      })()}
                    </div>
                  </div>
                )}
                <button
                  onClick={saveBaseline}
                  title="Capture today's planned timeline — it becomes the 'proposed' side of proposed-vs-real when the last milestone is checked off"
                  className="rounded px-2 py-1 text-xs font-bold self-start"
                  style={
                    plan && plan.baseline
                      ? {
                          background: "#F4F2EC",
                          color: "#0D7A3F",
                          border: "1px solid #0D7A3F",
                        }
                      : { background: "#0D7A3F", color: "#fff" }
                  }
                >
                  📌 {plan && plan.baseline ? "Re-save Baseline" : "Save as Baseline"}
                </button>
              </div>
            </div>
            {sync && (
              <div
                className="mt-2 text-xs font-bold rounded px-2 py-1 inline-block"
                style={{ background: "#0D7A3F", color: "#fff" }}
              >
                {sync}{" "}
                <span className="font-normal opacity-80">
                  (apply by hand via the job's ERP link — Update to ERP tab)
                </span>
              </div>
            )}
            {job.tdd && ends > job.tdd && (
              <div
                className="mt-2 text-xs font-bold rounded px-2 py-1 inline-block"
                style={{ background: "#B3261E", color: "#fff" }}
              >
                ⚠ Plan ends {diffDays(job.tdd, ends)} days after Target Delivery
                — compress durations or add crew
              </div>
            )}
          </div>

          {/* plan / materials sub-tabs */}
          <div
            className="flex gap-1 rounded p-1 bg-white border mb-3"
            style={{ borderColor: "#E2E0DA", width: "fit-content" }}
          >
            {[
              ["plan", "Milestone Plan"],
              ["mat", "Materials"],
            ].map(([k, l]) => (
              <button
                key={k}
                onClick={() => {
                  if (k === "mat")
                    setMaterials((ms) => {
                      if (ms[activeId]) return ms;
                      const recv = Math.round(
                        (MAT_ITEMS.length * (job.kit || 0)) / 100,
                      );
                      return {
                        ...ms,
                        [activeId]: MAT_ITEMS.map((it, i2) => ({
                          id: "mat" + i2,
                          item: it,
                          qty: "as BOM",
                          status: i2 < recv ? "Received" : "Pending",
                        })),
                      };
                    });
                  setPlanView(k);
                }}
                className="px-3 py-1 rounded text-sm font-semibold"
                style={
                  planView === k
                    ? { background: "#22303C", color: "#fff" }
                    : { color: "#5A6672" }
                }
              >
                {l}
              </button>
            ))}
          </div>

          {planView === "mat" &&
            (() => {
              const mats = materials[activeId] || [];
              const setMat = (mid, patch) =>
                setMaterials((ms) => ({
                  ...ms,
                  [activeId]: ms[activeId].map((m) =>
                    m.id === mid ? { ...m, ...patch } : m,
                  ),
                }));
              const recvN = mats.filter((m) => m.status === "Received").length;
              const matVal = job.val * (1 - (job.tpp || 0) / 100);
              const chkKit = mats.length
                ? Math.round((recvN / mats.length) * 100)
                : null;
              return (
                <div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
                    <Chip
                      label="KITTING %"
                      value={
                        (job.kit || 0) +
                        "%" +
                        (chkKit !== null && chkKit !== (job.kit || 0)
                          ? " · checklist " + chkKit + "%"
                          : "")
                      }
                      color="#0D9488"
                    />
                    <Chip
                      label="MATERIAL VALUE = val × (1−T%)"
                      value={V(matVal)}
                    />
                    <Chip
                      label="KITTED VALUE = val × (1−T%) × Kit%"
                      value={V((matVal * (job.kit || 0)) / 100)}
                      color="#0D7A3F"
                    />
                    <Chip
                      label="YET TO RECEIVE"
                      value={V(matVal * (1 - (job.kit || 0) / 100))}
                      color="#B3261E"
                    />
                  </div>
                  <div
                    className="bg-white rounded-lg border overflow-x-auto"
                    style={{ borderColor: "#E2E0DA" }}
                  >
                    <table className="w-full text-sm">
                      <thead>
                        <tr
                          style={{ background: "#22303C", color: "#fff" }}
                          className="text-xs"
                        >
                          <th className="px-3 py-2 text-left">#</th>
                          <th className="px-3 py-2 text-left">
                            Material / kit item
                          </th>
                          <th className="px-3 py-2 text-left">Qty</th>
                          <th className="px-3 py-2">Status ✎</th>
                        </tr>
                      </thead>
                      <tbody>
                        {mats.map((m, i) => (
                          <tr
                            key={m.id}
                            className="border-t"
                            style={{
                              borderColor: "#EFEDE7",
                              background: i % 2 ? "#FAF9F5" : "#fff",
                            }}
                          >
                            <td
                              className="px-3 py-1.5"
                              style={{ color: "#8A94A0" }}
                            >
                              {i + 1}
                            </td>
                            <td className="px-3 py-1.5 font-medium">
                              {m.item}
                              {m.custom && (
                                <span
                                  title="Custom item added by you"
                                  style={{ color: "#E8600A" }}
                                >
                                  {" "}
                                  ✎
                                </span>
                              )}
                            </td>
                            <td
                              className="px-3 py-1.5"
                              style={{ color: "#5A6672" }}
                            >
                              {m.qty}
                            </td>
                            <td className="px-3 py-1.5 text-center">
                              <button
                                onClick={() => {
                                  const ns =
                                    m.status === "Received"
                                      ? "Pending"
                                      : "Received";
                                  setMat(m.id, { status: ns });
                                  pushERP(
                                    "Job Material",
                                    "JOB " + jobNo(job.id) + " · " + m.item,
                                    "status",
                                    ns,
                                  );
                                }}
                                className="text-xs font-bold rounded px-2 py-0.5"
                                style={
                                  m.status === "Received"
                                    ? {
                                        background: "#E6F4EA",
                                        color: "#0D7A3F",
                                      }
                                    : {
                                        background: "#FBEDEA",
                                        color: "#B3261E",
                                      }
                                }
                              >
                                {m.status === "Received"
                                  ? "✓ Received"
                                  : "⏳ Yet to receive"}
                              </button>
                              <button
                                onClick={() =>
                                  setMaterials((ms) => ({
                                    ...ms,
                                    [activeId]: ms[activeId].filter(
                                      (x) => x.id !== m.id,
                                    ),
                                  }))
                                }
                                title="Remove line"
                                className="ml-1 text-xs"
                                style={{ color: "#B3261E" }}
                              >
                                ✕
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex gap-1 mt-2 items-center flex-wrap">
                    <input
                      placeholder="Custom material / bought-out item…"
                      value={matForm.item}
                      onChange={(e) =>
                        setMatForm({ ...matForm, item: e.target.value })
                      }
                      className="text-xs border rounded px-2 py-1.5"
                      style={{ borderColor: "#E2E0DA", minWidth: 240 }}
                    />
                    <input
                      placeholder="Qty"
                      value={matForm.qty}
                      onChange={(e) =>
                        setMatForm({ ...matForm, qty: e.target.value })
                      }
                      className="text-xs border rounded px-2 py-1.5 w-24"
                      style={{ borderColor: "#E2E0DA" }}
                    />
                    <button
                      onClick={() => {
                        if (!matForm.item.trim()) return;
                        setMaterials((ms) => ({
                          ...ms,
                          [activeId]: [
                            ...(ms[activeId] || []),
                            {
                              id: "cm" + Date.now(),
                              item: matForm.item.trim(),
                              qty: matForm.qty || "as BOM",
                              status: "Pending",
                              custom: true,
                            },
                          ],
                        }));
                        pushERP(
                          "Job Material",
                          "JOB " + jobNo(job.id),
                          "custom_item_added",
                          matForm.item.trim(),
                        );
                        setMatForm({ item: "", qty: "" });
                      }}
                      className="text-xs font-bold rounded px-3 py-1.5"
                      style={{ background: "#E8600A", color: "#fff" }}
                    >
                      + Add material
                    </button>
                  </div>
                  <div className="text-xs mt-2" style={{ color: "#8A94A0" }}>
                    {recvN}/{mats.length} kit items received (checklist
                    tracker only — the boards use Kitting % in the summation
                    Σ val × (1−T%) × Kit%). Rows marked ✎ are custom items you
                    added. In the ERP phase this checklist reads the real BOM /
                    Material Requests / Stock Entries.
                  </div>
                </div>
              );
            })()}

          {planView === "plan" && (
            <>
              {/* milestone table */}
              <div
                className="bg-white rounded-lg border overflow-x-auto"
                style={{ borderColor: "#E2E0DA" }}
              >
                <table className="w-full text-sm" style={{ minWidth: 1100 }}>
                  <thead>
                    <tr
                      style={{ background: "#22303C", color: "#fff" }}
                      className="text-xs"
                    >
                      <th className="px-2 py-2 text-center" title="Milestone checklist — tick when done on the floor">
                        ✓
                      </th>
                      <th className="px-2 py-2 text-left">#</th>
                      <th
                        className="px-2 py-2 text-left"
                        style={{ minWidth: 200 }}
                      >
                        Milestone (editable)
                      </th>
                      <th className="px-2 py-2">Pred(s)</th>
                      <th className="px-2 py-2">Succ</th>
                      <th className="px-2 py-2">Start</th>
                      <th className="px-2 py-2">Days</th>
                      <th className="px-2 py-2">End</th>
                      <th className="px-2 py-2">Shift</th>
                      {TRADES.map((t) => (
                        <th
                          key={t.key}
                          className="px-1 py-2"
                          title={t.label + " per day"}
                        >
                          <span
                            style={{
                              color: t.color,
                              filter: "brightness(1.7)",
                            }}
                          >
                            {t.tiny}
                          </span>
                        </th>
                      ))}
                      <th className="px-2 py-2">MD</th>
                      <th className="px-1 py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {sched.map((m, i) => (
                      <tr
                        key={i}
                        className="border-t"
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={() => {
                          moveMilestoneTo(dragMi, i);
                          setDragMi(null);
                        }}
                        style={{
                          borderColor: "#EFEDE7",
                          background:
                            dragMi === i
                              ? "#FFF3E8"
                              : i % 2
                                ? "#FAF9F5"
                                : "#fff",
                        }}
                      >
                        <td className="px-2 py-1 text-center">
                          <input
                            type="checkbox"
                            checked={!!m.done}
                            onChange={() => {
                              toggleMsDone(activeId, i);
                              pushERP(
                                "Job Plan",
                                "JOB " + jobNo(job.id),
                                "milestone_" + m.idx + "_done",
                                !m.done
                                  ? "completed " + fmtFull(TODAY)
                                  : "re-opened",
                              );
                            }}
                            title={
                              m.done
                                ? "Completed " + fmtFull(m.doneOn || "")
                                : "Mark milestone complete"
                            }
                            style={{ accentColor: "#0D7A3F", width: 15, height: 15, cursor: "pointer" }}
                          />
                        </td>
                        <td
                          className="px-2 py-1 font-bold whitespace-nowrap"
                          style={{
                            color: "#E8600A",
                            textDecoration: m.done ? "line-through" : "none",
                            opacity: m.done ? 0.6 : 1,
                          }}
                        >
                          <span
                            draggable
                            onDragStart={() => setDragMi(i)}
                            title="Drag to reorder"
                            style={{ cursor: "grab", color: "#B8B5AC" }}
                          >
                            ⠿{" "}
                          </span>
                          {m.idx}
                        </td>
                        <td className="px-2 py-1">
                          <input
                            value={m.name}
                            onChange={(e) =>
                              setMilestone(i, { name: e.target.value })
                            }
                            className="w-full px-1 py-0.5 rounded border bg-transparent"
                            style={{ borderColor: "transparent" }}
                            onFocus={(e) =>
                              (e.target.style.borderColor = "#E8600A")
                            }
                            onBlur={(e) =>
                              (e.target.style.borderColor = "transparent")
                            }
                          />
                        </td>
                        <td className="px-1 py-1 text-center">
                          <div
                            className="flex flex-wrap gap-0.5 justify-center items-center"
                            style={{ maxWidth: 92 }}
                          >
                            {(m.preds || []).map((p) => (
                              <button
                                key={p}
                                onClick={() => togglePred(i, p)}
                                title={`Remove predecessor ${p}`}
                                className="text-xs rounded px-1 font-bold"
                                style={{
                                  background: "#DCE8F5",
                                  color: "#1B3A5C",
                                }}
                              >
                                {p}×
                              </button>
                            ))}
                            {i > 0 && (
                              <select
                                value=""
                                onChange={(e) => {
                                  const v = parseInt(e.target.value, 10);
                                  if (v) togglePred(i, v);
                                }}
                                className="rounded border bg-white text-xs"
                                style={{ borderColor: "#E2E0DA", width: 30 }}
                                title="Add predecessor"
                              >
                                <option value="">+</option>
                                {sched
                                  .slice(0, i)
                                  .filter(
                                    (p) => !(m.preds || []).includes(p.idx),
                                  )
                                  .map((p) => (
                                    <option key={p.idx} value={p.idx}>
                                      {p.idx}
                                    </option>
                                  ))}
                              </select>
                            )}
                          </div>
                        </td>
                        <td
                          className="px-1 py-1 text-center text-xs"
                          style={{ color: "#8A94A0" }}
                        >
                          {(successors[m.idx] || []).join(",") || "—"}
                        </td>
                        <td
                          className="px-1 py-1 text-center whitespace-nowrap"
                          style={{ fontVariantNumeric: "tabular-nums" }}
                        >
                          {(m.preds || []).length > 0 ? (
                            <span title="Auto: latest predecessor end + 1">
                              {fmt(m.start)}
                            </span>
                          ) : (
                            <input
                              type="date"
                              value={m.start}
                              onChange={(e) =>
                                setMilestone(i, {
                                  offset: diffDays(plan.start, e.target.value),
                                })
                              }
                              className="text-xs border rounded px-1 bg-white"
                              style={{ borderColor: "#E2E0DA" }}
                            />
                          )}
                        </td>
                        <td className="px-1 py-1 text-center">
                          <input
                            type="number"
                            min="1"
                            value={m.days}
                            onChange={(e) => {
                              const v = e.target.value;
                              setMilestone(i, {
                                days:
                                  v === ""
                                    ? ""
                                    : Math.max(1, parseInt(v, 10) || 1),
                              });
                            }}
                            onBlur={(e) => {
                              if (e.target.value === "")
                                setMilestone(i, { days: 1 });
                            }}
                            className="w-12 text-center rounded border py-0.5"
                            style={{
                              borderColor: "#E2E0DA",
                              fontVariantNumeric: "tabular-nums",
                            }}
                          />
                        </td>
                        <td
                          className="px-1 py-1 text-center font-semibold whitespace-nowrap"
                          style={{
                            color: "#1B3A5C",
                            fontVariantNumeric: "tabular-nums",
                          }}
                        >
                          {fmt(m.end)}
                        </td>
                        <td className="px-1 py-1 text-center">
                          <select
                            value={m.shift || "D"}
                            onChange={(e) =>
                              setMilestone(i, { shift: e.target.value })
                            }
                            className="rounded border bg-white text-xs px-0.5 py-0.5"
                            style={{ borderColor: "#E2E0DA" }}
                            title="Which shift works this milestone"
                          >
                            <option value="D">☀ Day</option>
                            <option value="N">☾ Night</option>
                            <option value="DN">☀+☾</option>
                          </select>
                        </td>
                        {TRADES.map((t) => (
                          <td key={t.key} className="px-0.5 py-1 text-center">
                            <CrewCell
                              value={m.crew[t.key]}
                              color={t.color}
                              onChange={(v) => setCrewVal(i, t.key, v)}
                            />
                          </td>
                        ))}
                        <td
                          className="px-2 py-1 text-center font-bold"
                          style={{ fontVariantNumeric: "tabular-nums" }}
                        >
                          {manDays(m) || "—"}
                        </td>
                        <td className="px-1 py-1 text-center whitespace-nowrap">
                          <button
                            onClick={() => moveMilestone(i, -1)}
                            title="Move up"
                            className="text-xs px-0.5"
                            style={{ color: i === 0 ? "#D5D2C9" : "#1B3A5C" }}
                          >
                            ▲
                          </button>
                          <button
                            onClick={() => moveMilestone(i, 1)}
                            title="Move down"
                            className="text-xs px-0.5"
                            style={{
                              color:
                                i === sched.length - 1 ? "#D5D2C9" : "#1B3A5C",
                            }}
                          >
                            ▼
                          </button>
                          <button
                            onClick={() => removeMilestone(i)}
                            className="text-xs px-0.5"
                            style={{ color: "#B3261E" }}
                          >
                            ✕
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr
                      style={{
                        background: "#F2EFE6",
                        borderTop: "2px solid #22303C",
                      }}
                      className="font-bold text-sm"
                    >
                      <td colSpan={8} className="px-2 py-2 text-right">
                        Total man-days by trade →
                      </td>
                      {TRADES.map((t) => (
                        <td
                          key={t.key}
                          className="text-center"
                          style={{
                            color: t.color,
                            fontVariantNumeric: "tabular-nums",
                          }}
                        >
                          {tradeTotals[t.key]}
                        </td>
                      ))}
                      <td className="text-center" style={{ color: "#E8600A" }}>
                        {grandTotal}
                      </td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              <div className="flex items-center justify-between mt-2 flex-wrap gap-2">
                <div className="flex gap-2">
                  <button
                    onClick={addMilestone}
                    disabled={plan.milestones.length >= 50}
                    className="px-3 py-1.5 rounded font-semibold text-sm"
                    style={{
                      background:
                        plan.milestones.length >= 50 ? "#D9D6CD" : "#22303C",
                      color: "#fff",
                    }}
                  >
                    + Add milestone ({plan.milestones.length}/50)
                  </button>
                  <button
                    onClick={() => setPlan(() => mkPlan(job))}
                    className="px-3 py-1.5 rounded font-semibold text-sm border"
                    style={{ borderColor: "#22303C", color: "#22303C" }}
                  >
                    ↺ Reload {job.fam} default
                    {customT[job.fam] ? " (admin template)" : ""}
                  </button>
                </div>
                <div className="text-xs" style={{ color: "#8A94A0" }}>
                  Crew = men per day · MD = crew × duration
                </div>
              </div>

              {/* mini gantt */}
              <div
                className="bg-white rounded-lg border mt-3 p-3 overflow-x-auto"
                style={{ borderColor: "#E2E0DA" }}
              >
                <div
                  className="text-xs font-bold mb-1"
                  style={{ color: "#8A94A0" }}
                >
                  JOB GANTT{" "}
                  <span className="font-normal">
                    · week gridlines · red line = Target Delivery
                  </span>
                </div>
                {(() => {
                  const gEnd = job.tdd && job.tdd > ends ? job.tdd : ends;
                  const total = diffDays(plan.start, gEnd) + 1;
                  const tddPos = job.tdd
                    ? (diffDays(plan.start, job.tdd) / total) * 100
                    : null;
                  const ticks = [];
                  for (let d = 0; d < total; d++) {
                    const iso = addDays(plan.start, d);
                    if (parseISO(iso).getUTCDay() === 1)
                      ticks.push({ pct: (d / total) * 100, wk: isoWeek(iso) });
                  }
                  return (
                    <div
                      style={{ width: Math.max(620, total * 5), minWidth: 620 }}
                    >
                      {/* week axis */}
                      <div className="flex items-center gap-2 mb-1">
                        <div style={{ width: 175 }} />
                        <div className="flex-1 relative" style={{ height: 14 }}>
                          {ticks.map((t, k) => (
                            <span
                              key={k}
                              className="absolute text-xs font-bold"
                              style={{
                                left: t.pct + "%",
                                color: "#B8B5AC",
                                fontSize: 9,
                                transform: "translateX(2px)",
                              }}
                            >
                              W{t.wk}
                            </span>
                          ))}
                        </div>
                      </div>
                      {sched.map((m, i) => {
                        const l = (diffDays(plan.start, m.start) / total) * 100;
                        const w = (Math.max(1, m.days) / total) * 100;
                        return (
                          <div key={i} className="flex items-center gap-2 mb-1">
                            <div
                              className="text-xs truncate"
                              style={{ width: 175, color: "#5A6672" }}
                            >
                              {m.idx}. {m.name}
                            </div>
                            <div
                              className="flex-1 h-4 rounded relative"
                              style={{ background: "#F4F2EC" }}
                            >
                              {ticks.map((t, k) => (
                                <div
                                  key={k}
                                  className="absolute h-4"
                                  style={{
                                    left: t.pct + "%",
                                    width: 1,
                                    background: "#DDDACF",
                                  }}
                                />
                              ))}
                              <div
                                className="absolute h-4 rounded"
                                title={`${fmt(m.start)} → ${fmt(m.end)}`}
                                style={{
                                  left: l + "%",
                                  width: Math.max(w, 0.8) + "%",
                                  background: manDays(m)
                                    ? "#1B3A5C"
                                    : "#A8B4C0",
                                }}
                              />
                              {tddPos !== null && (
                                <div
                                  className="absolute h-4"
                                  style={{
                                    left: tddPos + "%",
                                    width: 2,
                                    background: "#B3261E",
                                  }}
                                />
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>

              {/* ===== pending tasks kanban (A to Z continuation) ===== */}
              <div className="mt-4">
                <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                  <h2 className="font-bold" style={{ color: "#16232F" }}>
                    Pending Tasks & Milestones — JOB {jobNo(job.id)}{" "}
                    <span
                      className="font-normal text-xs"
                      style={{ color: "#8A94A0" }}
                    >
                      ERP ToDo + open milestones · headed by Category
                    </span>
                  </h2>
                  <button
                    onClick={() => {
                      setAddingTask(activeId);
                      setForm({ ...form, cat: jobCats[0] || "Production" });
                    }}
                    className="px-3 py-1 rounded text-sm font-bold"
                    style={{ background: "#E8600A", color: "#fff" }}
                  >
                    + Task
                  </button>
                </div>
                <div className="flex gap-3 overflow-x-auto pb-2 items-start">
                  {/* milestones column — always first */}
                  {(() => {
                    const open = sched.filter((m) => !m.done);
                    const doneMs = sched.filter((m) => m.done);
                    const card = (m) => (
                      <TaskCard
                        onOpen={setLightbox}
                        key={"ms" + m.idx}
                        t={{
                          id: "ms" + m.idx,
                          ms: true,
                          msIdx: m.idx,
                          done: !!m.done,
                          j: activeId,
                          t: `M${m.idx} · ${m.name}`,
                          d: `${fmt(m.start)} → ${fmt(m.end)} · ${manDays(m)} man-days${m.done ? " · ✓ completed " + fmtFull(m.doneOn || "") : ""}`,
                          who: job.own || "plan",
                          due: m.end,
                          cat: "Milestone",
                        }}
                      />
                    );
                    return (
                      <div
                        className="rounded-lg p-2"
                        style={{
                          background: "#DDE6EE",
                          minWidth: 230,
                          maxWidth: 260,
                          border: "1px solid #B9C7D4",
                        }}
                      >
                        <div
                          className="text-xs font-bold px-1 pb-1.5 flex justify-between"
                          style={{ color: "#1B3A5C" }}
                        >
                          <span>⚑ MILESTONES</span>
                          <span style={{ color: "#8A94A0" }}>
                            {open.length} pending · {doneMs.length} done
                          </span>
                        </div>
                        {open.map((m) => card(m))}
                        {open.length === 0 && sched.length > 0 && (
                          <div
                            className="text-xs text-center rounded py-1 my-1 font-bold"
                            style={{ background: "#E6F4EA", color: "#0D7A3F" }}
                          >
                            All milestones checked off ✓
                          </div>
                        )}
                        {doneMs.length > 0 && (
                          <button
                            onClick={() => setShowPastMs(!showPastMs)}
                            className="w-full text-xs font-bold rounded border border-dashed py-1 my-1"
                            style={{ borderColor: "#8FA1B3", color: "#0D7A3F" }}
                          >
                            {showPastMs ? "▴ hide" : "▾ show"} {doneMs.length}{" "}
                            completed ✓
                          </button>
                        )}
                        {showPastMs && doneMs.map((m) => card(m))}
                        {msForm.open ? (
                          <div
                            className="rounded border p-2 mt-1 bg-white"
                            style={{ borderColor: "#1B3A5C" }}
                          >
                            <input
                              autoFocus
                              placeholder="New milestone…"
                              value={msForm.name}
                              onChange={(e) =>
                                setMsForm({ ...msForm, name: e.target.value })
                              }
                              className="w-full text-xs border rounded px-1 py-1 mb-1"
                              style={{ borderColor: "#E2E0DA" }}
                            />
                            <div className="flex gap-1 items-center">
                              <input
                                type="number"
                                min="1"
                                value={msForm.days}
                                onChange={(e) =>
                                  setMsForm({ ...msForm, days: e.target.value })
                                }
                                className="w-14 text-xs border rounded px-1 py-1"
                                style={{ borderColor: "#E2E0DA" }}
                                title="Duration (days)"
                              />
                              <span className="text-xs" style={{ color: "#8A94A0" }}>
                                days
                              </span>
                              <button
                                onClick={() => {
                                  addMilestoneNamed(msForm.name, msForm.days);
                                  setMsForm({ open: false, name: "", days: 3 });
                                }}
                                className="text-xs font-bold rounded px-2 py-1"
                                style={{ background: "#1B3A5C", color: "#fff" }}
                              >
                                Add
                              </button>
                              <button
                                onClick={() =>
                                  setMsForm({ open: false, name: "", days: 3 })
                                }
                                className="text-xs rounded px-1"
                                style={{ color: "#8A94A0" }}
                              >
                                ✕
                              </button>
                            </div>
                            <div className="text-xs mt-1" style={{ color: "#8A94A0" }}>
                              Appends after the last milestone — fine-tune preds,
                              crew & dates in the Milestone table above.
                            </div>
                          </div>
                        ) : (
                          <button
                            onClick={() =>
                              setMsForm({ open: true, name: "", days: 3 })
                            }
                            className="w-full text-xs font-bold rounded py-1 mt-1"
                            style={{ background: "#1B3A5C", color: "#fff" }}
                          >
                            + Milestone
                          </button>
                        )}
                      </div>
                    );
                  })()}
                  {(jobCats.length
                    ? jobCats
                    : addingTask === activeId
                      ? [form.cat]
                      : []
                  ).map((cat) => (
                    <div
                      key={cat}
                      className="rounded-lg p-2"
                      style={{
                        background: "#E9E6DD",
                        minWidth: 230,
                        maxWidth: 260,
                      }}
                    >
                      <div
                        className="text-xs font-bold px-1 pb-1.5 flex justify-between"
                        style={{ color: "#16232F" }}
                      >
                        <span>{cat.toUpperCase()}</span>
                        <span style={{ color: "#8A94A0" }}>
                          {
                            jobTasks.filter((t) => t.cat === cat && !t.done)
                              .length
                          }{" "}
                          open
                        </span>
                      </div>
                      {jobTasks
                        .filter((t) => t.cat === cat)
                        .sort((a, b) =>
                          (a.due || "9999") < (b.due || "9999") ? -1 : 1,
                        )
                        .map((t) => (
                          <TaskCard onOpen={setLightbox} key={t.id} t={t} />
                        ))}
                      {addingTask === activeId && form.cat === cat && (
                        <AddTaskFormC
                          owners={owners}
                          form={form}
                          setForm={setForm}
                          onSubmit={() => submitTask(activeId)}
                          onCancel={() => setAddingTask(null)}
                        />
                      )}
                    </div>
                  ))}
                  {addingTask === activeId &&
                    jobCats.length > 0 &&
                    !jobCats.includes(form.cat) && (
                      <div
                        className="rounded-lg p-2"
                        style={{ background: "#E9E6DD", minWidth: 230 }}
                      >
                        <div className="text-xs font-bold px-1 pb-1.5">
                          {form.cat.toUpperCase()}
                        </div>
                        <AddTaskFormC
                          owners={owners}
                          form={form}
                          setForm={setForm}
                          onSubmit={() => submitTask(activeId)}
                          onCancel={() => setAddingTask(null)}
                        />
                      </div>
                    )}
                </div>
                {jobTasks.length === 0 && (
                  <div className="text-xs mt-1" style={{ color: "#8A94A0" }}>
                    No ERP ToDos linked yet — in ERPNext every ToDo referencing
                    this Jobmaster appears here automatically.
                  </div>
                )}
              </div>
            </>
          )}

          {/* ===== management date breach popup ===== */}
          {job.mgmt && ends > job.mgmt && !warned.has(job.id) && (
            <div
              className="fixed inset-0 flex items-center justify-center p-4"
              style={{ background: "rgba(13,22,31,0.75)", zIndex: 60 }}
            >
              <div
                className="bg-white rounded-lg p-5 w-full"
                style={{ maxWidth: 460, borderTop: "5px solid #B3261E" }}
              >
                <div
                  className="text-xs font-bold tracking-widest"
                  style={{ color: "#B3261E" }}
                >
                  ⚠ MANAGEMENT TARGET BREACH
                </div>
                <div
                  className="font-bold text-lg mt-1"
                  style={{ color: "#16232F" }}
                >
                  JOB {jobNo(job.id)} · {job.tag}
                </div>
                <div className="text-sm mt-2" style={{ color: "#5A6672" }}>
                  The current milestone plan ends{" "}
                  <b style={{ color: "#B3261E" }}>{fmtFull(ends)}</b> — that is{" "}
                  <b>{diffDays(job.mgmt, ends)} days beyond</b> the Management
                  target of{" "}
                  <b style={{ color: "#7C3AED" }}>{fmtFull(job.mgmt)}</b>.
                </div>
                <div className="text-xs mt-2" style={{ color: "#8A94A0" }}>
                  Compress durations, add crew, run parallel milestones — or
                  escalate to raghu@nandan.co.in for a revised target. (In
                  ERPNext this also fires an email/notification to the Project
                  Owner.)
                </div>
                <div className="flex gap-2 mt-4">
                  <button
                    onClick={() => setWarned((s) => new Set([...s, job.id]))}
                    className="flex-1 py-2 rounded font-bold text-sm"
                    style={{ background: "#22303C", color: "#fff" }}
                  >
                    Acknowledge — I will re-plan
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ================= LOAD BOARD ================= */}
      {tab === "load" && (
        <div className="p-4">
          <div className="flex flex-wrap items-center gap-3 mb-3">
            <div
              className="flex gap-1 rounded p-1 bg-white border"
              style={{ borderColor: "#E2E0DA" }}
            >
              {["daily", "weekly", "monthly"].map((b) => (
                <button
                  key={b}
                  onClick={() => setBucket(b)}
                  className="px-3 py-1 rounded text-sm font-semibold capitalize"
                  style={
                    bucket === b
                      ? { background: "#22303C", color: "#fff" }
                      : { color: "#5A6672" }
                  }
                >
                  {b}
                </button>
              ))}
            </div>
            <button
              onClick={() => setCollapsed(new Set())}
              className="px-3 py-1.5 rounded text-sm font-semibold border"
              style={{
                background: "#fff",
                color: "#22303C",
                borderColor: "#E2E0DA",
              }}
            >
              ▾ Expand all
            </button>
            <button
              onClick={() => setCollapsed(new Set(jobs.map((j) => j.id)))}
              className="px-3 py-1.5 rounded text-sm font-semibold border"
              style={{
                background: "#fff",
                color: "#22303C",
                borderColor: "#E2E0DA",
              }}
            >
              ▸ Collapse all
            </button>
            <button
              onClick={() => setShiftSplit(!shiftSplit)}
              className="px-3 py-1.5 rounded text-sm font-semibold border"
              style={
                shiftSplit
                  ? {
                      background: "#16232F",
                      color: "#F5B32B",
                      borderColor: "#16232F",
                    }
                  : {
                      background: "#fff",
                      color: "#5A6672",
                      borderColor: "#E2E0DA",
                    }
              }
            >
              ☀︎/☾ Shift split {shiftSplit ? "ON" : "OFF"}
            </button>
            <div className="text-xs" style={{ color: "#8A94A0" }}>
              All {plannedJobs.length} jobs ·{" "}
              {bucket === "daily"
                ? "cells = men that day"
                : "cells = man-days in period"}
              {shiftSplit
                ? " · ☀︎ morning · ☾ night (per-milestone shift flag in ERP)"
                : ""}{" "}
              · jobs without a saved plan use their family default from today ·
              full range shown, view auto-scrolls to today
            </div>
          </div>
          {(() => {
            const SPLIT = (v) => {
              const n = Math.round(v * 0.25);
              return { d: v - n, n };
            };
            const cellTxt = (v) =>
              !v ? (
                "·"
              ) : shiftSplit ? (
                <span>
                  ☀︎{SPLIT(v).d}
                  <span style={{ opacity: 0.75 }}> ☾{SPLIT(v).n}</span>
                </span>
              ) : (
                v
              );
            const colStyle = (b) => ({
              borderLeft: b.wkStart ? "1px solid #C9C6BD" : "1px solid #F1EFE9",
            });
            return (
              <div
                ref={loadScrollRef}
                className="bg-white rounded-lg border overflow-x-auto"
                style={{ borderColor: "#E2E0DA" }}
              >
                <table
                  className="text-xs"
                  style={{ borderCollapse: "collapse" }}
                >
                  <thead>
                    <tr style={{ background: "#22303C", color: "#fff" }}>
                      <th
                        className="px-3 py-2 text-left sticky left-0"
                        style={{
                          background: "#22303C",
                          width: 150,
                          minWidth: 150,
                          zIndex: 3,
                        }}
                      >
                        Job
                      </th>
                      <th
                        className="px-2 py-2 text-left sticky"
                        style={{
                          background: "#22303C",
                          left: 150,
                          minWidth: 82,
                          zIndex: 3,
                        }}
                      >
                        Trade
                      </th>
                      {load.buckets.map((b, i) => (
                        <th
                          key={i}
                          data-today={b.today ? "1" : undefined}
                          className="px-2 py-1 whitespace-nowrap font-medium"
                          style={{
                            borderLeft: b.wkStart
                              ? "1px solid #3D4E5E"
                              : undefined,
                            background: b.today ? "#E8600A" : undefined,
                            color: b.today ? "#fff" : undefined,
                          }}
                        >
                          {bucket === "daily" && b.wkStart && (
                            <div style={{ color: "#F5B32B", fontSize: 9 }}>
                              W{b.wk}
                            </div>
                          )}
                          {b.label}
                          {b.sub && (
                            <div style={{ fontSize: 9, opacity: 0.7 }}>
                              {b.sub}
                            </div>
                          )}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {load.rows.map((r, ri) => {
                      const isCollapsed = collapsed.has(r.job.id);
                      const shownTrades = isCollapsed ? [] : r.trades;
                      return (
                        <>
                          {shownTrades.map((tr, ti) => (
                            <tr
                              key={`${ri}-${ti}`}
                              style={{
                                borderTop:
                                  ti === 0
                                    ? "2px solid #22303C"
                                    : "1px solid #F1EFE9",
                              }}
                            >
                              {ti === 0 && (
                                <td
                                  rowSpan={r.trades.length + 1}
                                  onClick={() => toggleCollapse(r.job.id)}
                                  className="px-3 py-2 font-semibold sticky left-0 bg-white align-top cursor-pointer"
                                  style={{
                                    color: "#22303C",
                                    borderRight: "1px solid #EFEDE7",
                                    width: 150,
                                    minWidth: 150,
                                    zIndex: 2,
                                  }}
                                >
                                  JOB {jobNo(r.job.id)}
                                  <div
                                    className="font-normal"
                                    style={{ color: "#8A94A0", maxWidth: 140 }}
                                  >
                                    {r.job.tag.slice(0, 34)}
                                  </div>
                                  <div
                                    className="mt-1"
                                    style={{ color: "#E8600A", fontSize: 10 }}
                                  >
                                    ▾ collapse
                                  </div>
                                </td>
                              )}
                              <td
                                className="px-2 py-1 font-bold whitespace-nowrap sticky"
                                style={{
                                  color: tr.trade.color,
                                  left: 150,
                                  background: "#fff",
                                  zIndex: 2,
                                  borderRight: "1px solid #EFEDE7",
                                }}
                              >
                                {tr.trade.tiny}{" "}
                                <span
                                  className="font-normal"
                                  style={{ color: "#8A94A0" }}
                                >
                                  {tr.trade.label}
                                </span>
                              </td>
                              {tr.cells.map((v, ci) => (
                                <td
                                  key={ci}
                                  className="text-center px-1 py-1 font-bold whitespace-nowrap"
                                  style={{
                                    ...heat(v, load.peak),
                                    fontVariantNumeric: "tabular-nums",
                                    minWidth: 44,
                                    ...colStyle(load.buckets[ci]),
                                  }}
                                  title={`${tr.trade.label}: ${v}`}
                                >
                                  {cellTxt(v)}
                                </td>
                              ))}
                            </tr>
                          ))}
                          <tr
                            key={`${ri}-tot`}
                            style={{
                              background: "#F2EFE6",
                              borderTop: isCollapsed
                                ? "2px solid #22303C"
                                : "1px solid #D9D6CD",
                            }}
                            className="font-bold"
                          >
                            {isCollapsed && (
                              <td
                                onClick={() => toggleCollapse(r.job.id)}
                                className="px-3 py-2 sticky left-0 align-top cursor-pointer"
                                style={{
                                  background: "#F2EFE6",
                                  color: "#22303C",
                                  borderRight: "1px solid #EFEDE7",
                                  width: 150,
                                  minWidth: 150,
                                  zIndex: 2,
                                }}
                              >
                                JOB {jobNo(r.job.id)}
                                <div
                                  style={{ color: "#E8600A", fontSize: 10 }}
                                  className="font-normal"
                                >
                                  ▸ expand trades
                                </div>
                              </td>
                            )}
                            <td
                              className="px-2 py-1 sticky"
                              style={{
                                left: 150,
                                background: "#F2EFE6",
                                zIndex: 2,
                                borderRight: "1px solid #E7E4DC",
                              }}
                            >
                              TOTAL
                            </td>
                            {r.totals.map((v, ci) => (
                              <td
                                key={ci}
                                className="text-center px-1 py-1 whitespace-nowrap"
                                style={{
                                  ...heat(v, load.totPeak),
                                  fontVariantNumeric: "tabular-nums",
                                  ...colStyle(load.buckets[ci]),
                                }}
                              >
                                {cellTxt(v)}
                              </td>
                            ))}
                          </tr>
                        </>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    {load.shopTrades.map((tr, ti) => (
                      <tr
                        key={ti}
                        style={{
                          background: "#16232F",
                          color: "#fff",
                          borderTop:
                            ti === 0
                              ? "3px solid #E8600A"
                              : "1px solid #22303C",
                        }}
                      >
                        {ti === 0 && (
                          <td
                            rowSpan={load.shopTrades.length + 1}
                            className="px-3 py-2 font-bold sticky left-0 align-top"
                            style={{
                              background: "#16232F",
                              width: 150,
                              minWidth: 150,
                              zIndex: 2,
                            }}
                          >
                            SHOP TOTAL
                            <div
                              className="font-normal opacity-70"
                              style={{ fontSize: 10 }}
                            >
                              all planned jobs
                            </div>
                          </td>
                        )}
                        <td
                          className="px-2 py-1 font-bold whitespace-nowrap sticky"
                          style={{
                            color: "#F5B32B",
                            left: 150,
                            background: "#16232F",
                            zIndex: 2,
                          }}
                        >
                          {tr.trade.tiny}{" "}
                          <span className="font-normal opacity-70">
                            {tr.trade.label}
                          </span>
                        </td>
                        {tr.cells.map((v, ci) => (
                          <td
                            key={ci}
                            className="text-center px-1 py-1 font-bold whitespace-nowrap"
                            style={{
                              fontVariantNumeric: "tabular-nums",
                              color: v ? "#fff" : "#3A4A5A",
                              borderLeft: "1px solid #22303C",
                            }}
                          >
                            {cellTxt(v)}
                          </td>
                        ))}
                      </tr>
                    ))}
                    <tr
                      style={{ background: "#0D161F", color: "#F5B32B" }}
                      className="font-bold"
                    >
                      <td
                        className="px-2 py-2 sticky"
                        style={{ left: 150, background: "#0D161F", zIndex: 2 }}
                      >
                        GRAND TOTAL
                      </td>
                      {load.shopTotal.map((v, ci) => (
                        <td
                          key={ci}
                          className="text-center px-1 py-2 whitespace-nowrap"
                          style={{
                            fontVariantNumeric: "tabular-nums",
                            borderLeft: "1px solid #22303C",
                          }}
                        >
                          {cellTxt(v)}
                        </td>
                      ))}
                    </tr>
                  </tfoot>
                </table>
              </div>
            );
          })()}
          <div
            className="flex flex-wrap gap-3 mt-2 text-xs items-center"
            style={{ color: "#5A6672" }}
          >
            <span className="font-bold">Load key:</span>
            {[
              ["#DCE8F5", "Light"],
              ["#F5B32B", "Moderate"],
              ["#E8600A", "Heavy"],
              ["#B3261E", "Peak — level or shift"],
            ].map(([c, l]) => (
              <span key={l} className="flex items-center gap-1">
                <span
                  className="w-4 h-4 rounded inline-block"
                  style={{ background: c }}
                />{" "}
                {l}
              </span>
            ))}
            <span className="ml-auto">
              F=Fitter · H=Helper · W=Welder · P=Painter · E=Electrician ·
              Hd=Hydraulic
            </span>
          </div>
        </div>
      )}

      {/* ================= NANDAN TASKING ================= */}
      {tab === "tasking" && (
        <div className="p-4">
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <select
              value={filterCust}
              onChange={(e) => setFilterCust(e.target.value)}
              className="px-2 py-1.5 rounded border bg-white text-sm"
              style={{ borderColor: "#D9D6CD", maxWidth: 240 }}
            >
              <option value="all">All customers</option>
              {custs.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
            <select
              value={filterOwn}
              onChange={(e) => setFilterOwn(e.target.value)}
              className="px-2 py-1.5 rounded border bg-white text-sm"
              style={{ borderColor: "#D9D6CD" }}
            >
              <option value="all">All job owners</option>
              {owners.map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
            <select
              value={filterFam}
              onChange={(e) => setFilterFam(e.target.value)}
              className="px-2 py-1.5 rounded border bg-white text-sm"
              style={{ borderColor: "#D9D6CD" }}
            >
              <option value="all">All products</option>
              {fams.map((f) => (
                <option key={f}>{f}</option>
              ))}
            </select>
            <label
              className="text-xs flex items-center gap-1 px-2 py-1.5 rounded border bg-white cursor-pointer"
              style={{ borderColor: "#D9D6CD", color: "#5A6672" }}
            >
              <input
                type="checkbox"
                checked={taskAll}
                onChange={(e) => setTaskAll(e.target.checked)}
              />{" "}
              include jobs without tasks
            </label>
            <div
              className="flex gap-1 rounded p-1 bg-white border"
              style={{ borderColor: "#D9D6CD" }}
            >
              {[
                ["board", "Board"],
                ["cal", "📅 Calendar (ISO weeks)"],
              ].map(([k, l]) => (
                <button
                  key={k}
                  onClick={() => setTaskView(k)}
                  className="px-3 py-1 rounded text-sm font-semibold"
                  style={
                    taskView === k
                      ? { background: "#22303C", color: "#fff" }
                      : { color: "#5A6672" }
                  }
                >
                  {l}
                </button>
              ))}
            </div>
            <div
              className="text-xs ml-auto flex gap-3 items-center"
              style={{ color: "#5A6672" }}
            >
              <span className="flex items-center gap-1">
                <span
                  className="w-3 h-3 rounded"
                  style={{ background: "#B3261E" }}
                />
                overdue
              </span>
              <span className="flex items-center gap-1">
                <span
                  className="w-3 h-3 rounded border"
                  style={{ background: "#fff", borderColor: "#22303C" }}
                />
                today
              </span>
              <span className="flex items-center gap-1">
                <span
                  className="w-3 h-3 rounded"
                  style={{ background: "#F5B32B" }}
                />
                tomorrow
              </span>
              <span>sorted oldest first · tap card for details</span>
            </div>
          </div>
          {taskView === "board" && taskingJobs.length === 0 && (
            <div
              className="bg-white border rounded-lg p-6 text-center text-sm"
              style={{ borderColor: "#E2E0DA", color: "#8A94A0" }}
            >
              No jobs with open tasks match this filter — tick "include jobs
              without tasks" to board every job and add their first tasks here.
            </div>
          )}
          {taskView === "board" && (
          <div className="flex gap-3 overflow-x-auto pb-2 items-start">
            {taskingJobs.map((j) => {
              const jt = tasks
                .filter((t) => t.j === j.id)
                .sort((a, b) =>
                  (a.due || "9999") < (b.due || "9999") ? -1 : 1,
                );
              const open = jt.filter((t) => !t.done).length;
              return (
                <div key={j.id} style={{ minWidth: 240, maxWidth: 260 }}>
                  {/* frozen job header */}
                  <div
                    className="rounded-t-lg p-2 sticky top-0"
                    style={{
                      background: "#16232F",
                      color: "#fff",
                      borderBottom: "3px solid #E8600A",
                    }}
                  >
                    <div className="flex justify-between items-baseline">
                      <button
                        onClick={() => openJob(j.id)}
                        className="font-bold text-sm underline decoration-dotted"
                        style={{ color: "#F5B32B" }}
                      >
                        JOB {jobNo(j.id)}
                      </button>
                      <span
                        className="text-xs font-bold"
                        style={{ color: open ? "#F5B32B" : "#7BC67E" }}
                      >
                        {open} open
                      </span>
                    </div>
                    <div className="text-xs truncate" title={j.tag}>
                      {j.tag}
                    </div>
                    <div className="text-xs opacity-70">
                      TDD {fmt(j.tdd)}
                      {j.own ? " · " + j.own : ""} · {j.cust.slice(0, 20)}
                    </div>
                  </div>
                  <div
                    className="rounded-b-lg p-2"
                    style={{ background: "#E9E6DD" }}
                  >
                    {(() => {
                      if (!plans[j.id]) return null;
                      const nx = computeSchedule(plans[j.id]).find(
                        (m) => m.end >= TODAY && manDays(m) > 0,
                      );
                      return nx ? (
                        <div
                          onClick={() => openJob(j.id)}
                          className="rounded p-2 mb-1.5 cursor-pointer border"
                          style={{
                            background: "#DDE6EE",
                            borderColor: "#B9C7D4",
                          }}
                        >
                          <div
                            className="text-xs font-bold"
                            style={{ color: "#1B3A5C" }}
                          >
                            ⚑ Next milestone: M{nx.idx} {nx.name}
                          </div>
                          <div
                            className="text-xs flex justify-between mt-0.5"
                            style={{ color: "#5A6672" }}
                          >
                            <span>from the job plan</span>
                            <span
                              style={{ fontVariantNumeric: "tabular-nums" }}
                            >
                              {fmt(nx.end)}
                            </span>
                          </div>
                        </div>
                      ) : null;
                    })()}
                    {jt.map((t) => (
                      <TaskCard onOpen={setLightbox} key={t.id} t={t} />
                    ))}
                    {addingTask === j.id ? (
                      <AddTaskFormC
                        owners={owners}
                        form={form}
                        setForm={setForm}
                        onSubmit={() => submitTask(j.id)}
                        onCancel={() => setAddingTask(null)}
                      />
                    ) : (
                      <button
                        onClick={() => setAddingTask(j.id)}
                        className="w-full text-xs font-bold rounded border border-dashed py-1 mt-1"
                        style={{ borderColor: "#E8600A", color: "#E8600A" }}
                      >
                        + Add task
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          )}
          {taskView === "cal" &&
            (() => {
              const [yy, mm] = calMonth.split("-").map(Number);
              const first = new Date(Date.UTC(yy, mm - 1, 1));
              const monStart = new Date(first);
              monStart.setUTCDate(
                monStart.getUTCDate() - ((monStart.getUTCDay() + 6) % 7),
              );
              const lastD = new Date(Date.UTC(yy, mm, 0));
              const sunEnd = new Date(lastD);
              sunEnd.setUTCDate(
                sunEnd.getUTCDate() + (6 - ((sunEnd.getUTCDay() + 6) % 7)),
              );
              const days = [];
              for (
                let d = new Date(monStart);
                d <= sunEnd;
                d.setUTCDate(d.getUTCDate() + 1)
              )
                days.push(toISO(new Date(d)));
              const weeks = [];
              for (let i = 0; i < days.length; i += 7)
                weeks.push(days.slice(i, i + 7));
              const jset = new Set(taskingJobs.map((j) => j.id));
              const openT = tasks.filter(
                (t) => !t.done && t.due && jset.has(t.j),
              );
              const byDay = {};
              openT.forEach((t) => (byDay[t.due] = byDay[t.due] || []).push(t));
              const overdue = openT.filter((t) => t.due < TODAY);
              const monthLabel = first.toLocaleDateString("en-IN", {
                month: "long",
                year: "numeric",
                timeZone: "UTC",
              });
              const shiftMonth = (d) =>
                setCalMonth(
                  toISO(new Date(Date.UTC(yy, mm - 1 + d, 1))).slice(0, 7),
                );
              return (
                <div
                  className="bg-white rounded-lg border p-3"
                  style={{ borderColor: "#E2E0DA" }}
                >
                  <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                    <button
                      onClick={() => shiftMonth(-1)}
                      className="px-3 py-1 rounded font-bold text-sm"
                      style={{ background: "#F4F2EC", color: "#22303C" }}
                    >
                      ◀
                    </button>
                    <div
                      className="font-bold text-center"
                      style={{ color: "#16232F" }}
                    >
                      {monthLabel}{" "}
                      <span
                        className="text-xs font-normal"
                        style={{ color: "#8A94A0" }}
                      >
                        · open tasks on their due dates · respects the filters
                        above
                      </span>
                    </div>
                    <div className="flex gap-1">
                      <button
                        onClick={() => setCalMonth(TODAY.slice(0, 7))}
                        className="px-2 py-1 rounded text-xs font-bold"
                        style={{ background: "#E8600A", color: "#fff" }}
                      >
                        Today
                      </button>
                      <button
                        onClick={() => shiftMonth(1)}
                        className="px-3 py-1 rounded font-bold text-sm"
                        style={{ background: "#F4F2EC", color: "#22303C" }}
                      >
                        ▶
                      </button>
                    </div>
                  </div>
                  {overdue.length > 0 && (
                    <div
                      className="text-xs font-bold rounded px-2 py-1 mb-2 inline-block"
                      style={{ background: "#B3261E", color: "#fff" }}
                    >
                      ⚠ {overdue.length} overdue task
                      {overdue.length === 1 ? "" : "s"} — red chips on their
                      original due dates
                    </div>
                  )}
                  <table
                    className="w-full text-xs"
                    style={{ borderCollapse: "collapse", tableLayout: "fixed" }}
                  >
                    <thead>
                      <tr style={{ background: "#22303C", color: "#fff" }}>
                        <th className="px-1 py-1.5" style={{ width: 58 }}>
                          ISO Wk
                        </th>
                        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(
                          (d) => (
                            <th key={d} className="px-1 py-1.5">
                              {d}
                            </th>
                          ),
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {weeks.map((wk) => {
                        const wkCount = wk.reduce(
                          (n, d) => n + (byDay[d] || []).length,
                          0,
                        );
                        return (
                          <tr
                            key={wk[0]}
                            className="border-t align-top"
                            style={{ borderColor: "#EFEDE7" }}
                          >
                            <td
                              className="px-1 py-1 font-bold text-center"
                              style={{
                                background:
                                  wk[0] <= TODAY && TODAY <= wk[6]
                                    ? "#FFF3E8"
                                    : "#F4F2EC",
                                color: "#1B3A5C",
                              }}
                            >
                              W{isoWeek(wk[0])}
                              {wkCount > 0 && (
                                <div
                                  className="font-normal"
                                  style={{ color: "#8A94A0", fontSize: 9 }}
                                >
                                  {wkCount} task{wkCount === 1 ? "" : "s"}
                                </div>
                              )}
                            </td>
                            {wk.map((d) => {
                              const inM = d.slice(0, 7) === calMonth;
                              const list = byDay[d] || [];
                              return (
                                <td
                                  key={d}
                                  className="px-1 py-1 border-l"
                                  style={{
                                    borderColor: "#EFEDE7",
                                    background:
                                      d === TODAY
                                        ? "#FFF3E8"
                                        : inM
                                          ? "#fff"
                                          : "#FAF9F5",
                                    opacity: inM ? 1 : 0.55,
                                    height: 64,
                                  }}
                                >
                                  <div
                                    className="font-bold"
                                    style={{
                                      color:
                                        d === TODAY ? "#E8600A" : "#8A94A0",
                                      fontVariantNumeric: "tabular-nums",
                                    }}
                                  >
                                    {parseInt(d.slice(8), 10)}
                                    {d === TODAY ? " · today" : ""}
                                  </div>
                                  {list.map((t) => (
                                    <div
                                      key={t.id}
                                      onClick={() => setLightbox(t)}
                                      title={
                                        "JOB " +
                                        jobNo(t.j) +
                                        " · " +
                                        t.t +
                                        " · " +
                                        (t.who || "unassigned")
                                      }
                                      className="rounded px-1 py-0.5 mb-0.5 cursor-pointer font-semibold"
                                      style={{
                                        background:
                                          t.due < TODAY
                                            ? "#B3261E"
                                            : t.due === TODAY
                                              ? "#fff"
                                              : "#DCE8F5",
                                        color:
                                          t.due < TODAY
                                            ? "#fff"
                                            : "#1B3A5C",
                                        border:
                                          t.due === TODAY
                                            ? "1px solid #22303C"
                                            : "none",
                                        fontSize: 9,
                                        overflow: "hidden",
                                        whiteSpace: "nowrap",
                                        textOverflow: "ellipsis",
                                      }}
                                    >
                                      {jobNo(t.j)} · {initials(t.who)} · {t.t}
                                    </div>
                                  ))}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <div className="text-xs mt-2" style={{ color: "#8A94A0" }}>
                    Tap a chip to open the task (mark done, comment) · red =
                    overdue · white outline = due today
                  </div>
                </div>
              );
            })()}
        </div>
      )}

      {/* ================= JOB DELIVERY BOARD ================= */}
      {tab === "delivery" && (
        <div className="p-4">
          {(() => {
            const totVal = jobs.reduce((s, j) => s + j.val, 0);
            const totTp = jobs.reduce((s, j) => s + (j.tpv || 0), 0);
            const matVal = jobs.reduce(
              (s, j) => s + j.val * (1 - (j.tpp || 0) / 100),
              0,
            );
            // Dr. Raghu's formula: Kitted Value = Σ value × (1 − T%) × Kitting%
            const kitted = jobs.reduce(
              (s, j) =>
                s + j.val * (1 - (j.tpp || 0) / 100) * ((j.kit || 0) / 100),
              0,
            );
            const kitPct = matVal ? Math.round((kitted / matVal) * 100) : 0;
            const Card = ({ label, value, sub, color }) => (
              <div
                className="bg-white rounded-lg border px-3 py-2"
                style={{
                  borderColor: "#E2E0DA",
                  borderTop: `3px solid ${color}`,
                }}
              >
                <div className="text-xs font-bold" style={{ color: "#8A94A0" }}>
                  {label}
                </div>
                <div
                  className="text-xl font-bold"
                  style={{ color, fontVariantNumeric: "tabular-nums" }}
                >
                  {value}
                </div>
                {sub && (
                  <div className="text-xs" style={{ color: "#8A94A0" }}>
                    {sub}
                  </div>
                )}
              </div>
            );
            return (
              <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-3">
                <Card
                  label="PENDING JOBS"
                  value={jobs.length}
                  sub="from Jobmaster · live"
                  color="#16232F"
                />
                <Card label="TOTAL VALUE" value={V(totVal)} color="#1B3A5C" />
                <Card
                  label="TOTAL THROUGHPUT"
                  value={V(totTp)}
                  sub={
                    totVal
                      ? Math.round((totTp / totVal) * 100) + "% of value"
                      : ""
                  }
                  color="#E8600A"
                />
                <Card
                  label="KITTING %"
                  value={kitPct + "%"}
                  sub="Σ val × (1−T%) × Kit% ÷ Σ val × (1−T%)"
                  color="#0D9488"
                />
                <Card
                  label="KITTED MATERIAL VALUE"
                  value={V(kitted)}
                  sub="Σ value × (1 − T%) × Kitting%"
                  color="#7C3AED"
                />
              </div>
            );
          })()}
          <div
            className="flex gap-1 rounded p-1 bg-white border mb-3 flex-wrap"
            style={{ borderColor: "#E2E0DA", width: "fit-content" }}
          >
            {[
              ["priority", "Priority List (A60 → O)"],
              ["okan", "By Owner (Kanban)"],
              ["cal", "📅 Calendar (ISO weeks)"],
              ["fam", "Schedule by Product"],
              ["cust", "Schedule by Customer"],
            ].map(([k, l]) => (
              <button
                key={k}
                onClick={() => setSubTab(k)}
                className="px-3 py-1 rounded text-sm font-semibold"
                style={
                  subTab === k
                    ? { background: "#22303C", color: "#fff" }
                    : { color: "#5A6672" }
                }
              >
                {l}
              </button>
            ))}
            <select
              value={delOwn}
              onChange={(e) => setDelOwn(e.target.value)}
              className="px-2 py-1 rounded border bg-white text-sm ml-1"
              style={{ borderColor: "#D9D6CD" }}
            >
              <option value="all">All owners</option>
              {owners.map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
          </div>
          {sync && (
            <div
              className="mb-2 text-xs font-bold rounded px-2 py-1 inline-block"
              style={{ background: "#0D7A3F", color: "#fff" }}
            >
              {sync}{" "}
              <span className="font-normal opacity-80">
                (live API write in ERPNext)
              </span>
            </div>
          )}

          {subTab === "cal" &&
            (() => {
              const [yy, mm] = calMonth.split("-").map(Number);
              const first = new Date(Date.UTC(yy, mm - 1, 1));
              const monStart = new Date(first);
              const dow = (monStart.getUTCDay() + 6) % 7;
              monStart.setUTCDate(monStart.getUTCDate() - dow);
              const lastD = new Date(Date.UTC(yy, mm, 0));
              const sunEnd = new Date(lastD);
              const edow = (sunEnd.getUTCDay() + 6) % 7;
              sunEnd.setUTCDate(sunEnd.getUTCDate() + (6 - edow));
              const days = [];
              for (
                let d = new Date(monStart);
                d <= sunEnd;
                d.setUTCDate(d.getUTCDate() + 1)
              )
                days.push(toISO(new Date(d)));
              const weeks = [];
              for (let i = 0; i < days.length; i += 7)
                weeks.push(days.slice(i, i + 7));
              const byDay = {};
              jobs.forEach((j) => {
                if (j.tdd) (byDay[j.tdd] = byDay[j.tdd] || []).push(j);
              });
              const monthLabel = first.toLocaleDateString("en-IN", {
                month: "long",
                year: "numeric",
                timeZone: "UTC",
              });
              const shiftMonth = (d) =>
                setCalMonth(toISO(new Date(Date.UTC(yy, mm - 1 + d, 1))).slice(0, 7));
              return (
                <div
                  className="bg-white rounded-lg border p-3"
                  style={{ borderColor: "#E2E0DA" }}
                >
                  <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                    <button
                      onClick={() => shiftMonth(-1)}
                      className="px-3 py-1 rounded font-bold text-sm"
                      style={{ background: "#F4F2EC", color: "#22303C" }}
                    >
                      ◀
                    </button>
                    <div className="font-bold text-center" style={{ color: "#16232F" }}>
                      {monthLabel}{" "}
                      <span
                        className="text-xs font-normal"
                        style={{ color: "#8A94A0" }}
                      >
                        · jobs on their Target Delivery Date · ISO week numbers
                        on the left
                      </span>
                    </div>
                    <div className="flex gap-1">
                      <button
                        onClick={() => setCalMonth(TODAY.slice(0, 7))}
                        className="px-2 py-1 rounded text-xs font-bold"
                        style={{ background: "#E8600A", color: "#fff" }}
                      >
                        Today
                      </button>
                      <button
                        onClick={() => shiftMonth(1)}
                        className="px-3 py-1 rounded font-bold text-sm"
                        style={{ background: "#F4F2EC", color: "#22303C" }}
                      >
                        ▶
                      </button>
                    </div>
                  </div>
                  <table
                    className="w-full text-xs"
                    style={{ borderCollapse: "collapse", tableLayout: "fixed" }}
                  >
                    <thead>
                      <tr style={{ background: "#22303C", color: "#fff" }}>
                        <th className="px-1 py-1.5" style={{ width: 58 }}>
                          ISO Wk
                        </th>
                        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(
                          (d) => (
                            <th key={d} className="px-1 py-1.5">
                              {d}
                            </th>
                          ),
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {weeks.map((wk) => {
                        const wkCount = wk.reduce(
                          (n, d) => n + (byDay[d] || []).length,
                          0,
                        );
                        const wkVal = wk.reduce(
                          (v, d) =>
                            v +
                            (byDay[d] || []).reduce((x, j) => x + (j.val || 0), 0),
                          0,
                        );
                        return (
                          <tr
                            key={wk[0]}
                            className="border-t align-top"
                            style={{ borderColor: "#EFEDE7" }}
                          >
                            <td
                              className="px-1 py-1 font-bold text-center"
                              style={{
                                background:
                                  wk[0] <= TODAY && TODAY <= wk[6]
                                    ? "#FFF3E8"
                                    : "#F4F2EC",
                                color: "#1B3A5C",
                              }}
                            >
                              W{isoWeek(wk[0])}
                              {wkCount > 0 && (
                                <div
                                  className="font-normal"
                                  style={{ color: "#8A94A0", fontSize: 9 }}
                                >
                                  {wkCount} job{wkCount === 1 ? "" : "s"}
                                  <br />
                                  {V(wkVal)}
                                </div>
                              )}
                            </td>
                            {wk.map((d) => {
                              const inM = d.slice(0, 7) === calMonth;
                              const list = byDay[d] || [];
                              return (
                                <td
                                  key={d}
                                  className="px-1 py-1 border-l"
                                  style={{
                                    borderColor: "#EFEDE7",
                                    background:
                                      d === TODAY
                                        ? "#FFF3E8"
                                        : inM
                                          ? "#fff"
                                          : "#FAF9F5",
                                    opacity: inM ? 1 : 0.55,
                                    height: 64,
                                  }}
                                >
                                  <div
                                    className="font-bold"
                                    style={{
                                      color:
                                        d === TODAY ? "#E8600A" : "#8A94A0",
                                      fontVariantNumeric: "tabular-nums",
                                    }}
                                  >
                                    {parseInt(d.slice(8), 10)}
                                    {d === TODAY ? " · today" : ""}
                                  </div>
                                  {list.map((j) => (
                                    <div
                                      key={j.id}
                                      onClick={() => openJob(j.id)}
                                      title={
                                        j.tag +
                                        " · " +
                                        j.cust +
                                        " · " +
                                        (j.stat || "")
                                      }
                                      className="rounded px-1 py-0.5 mb-0.5 cursor-pointer font-semibold"
                                      style={{
                                        background:
                                          j.tdd < TODAY ? "#B3261E" : "#DCE8F5",
                                        color:
                                          j.tdd < TODAY ? "#fff" : "#1B3A5C",
                                        fontSize: 9,
                                        overflow: "hidden",
                                        whiteSpace: "nowrap",
                                        textOverflow: "ellipsis",
                                      }}
                                    >
                                      {jobNo(j.id)} {j.tag}
                                    </div>
                                  ))}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <div className="text-xs mt-2" style={{ color: "#8A94A0" }}>
                    Tap a job chip to open its milestone plan · red chip = TDD
                    already past · week cell shows count & value due that ISO
                    week
                  </div>
                </div>
              );
            })()}
          {subTab === "priority" &&
            (() => {
              const base = prio
                ? prio
                    .map((id) => byTDD.find((j) => j.id === id))
                    .filter(Boolean)
                    .concat(byTDD.filter((j) => !prio.includes(j.id)))
                : byTDD;
              const plist = base.filter(
                (j) => delOwn === "all" || j.own === delOwn,
              );
              const canDrag = delOwn === "all";
              const onDrop = (ti) => {
                if (dragIdx === null || dragIdx === ti) return;
                const ids = base.map((j) => j.id);
                const [moved] = ids.splice(dragIdx, 1);
                ids.splice(ti, 0, moved);
                setPrio(ids);
                setDragIdx(null);
                pushERP(
                  "Jobmaster",
                  "Priority order",
                  "priority_rank",
                  `JOB ${jobNo(moved)} → position ${ti + 1}`,
                );
              };
              return (
                <div
                  className="bg-white rounded-lg border overflow-x-auto"
                  style={{ borderColor: "#E2E0DA" }}
                >
                  <div
                    className="px-3 pt-2 pb-1 text-xs flex justify-between flex-wrap gap-2"
                    style={{ color: "#8A94A0" }}
                  >
                    <span>
                      {canDrag
                        ? "⠿ Drag any row to set manual priority — the rank writes back to ERP"
                        : "Owner filter active — clear it to drag-reorder"}
                      {prio
                        ? " · manual order active"
                        : " · sorted by Target Delivery Date"}
                    </span>
                    {prio && (
                      <button
                        onClick={() => setPrio(null)}
                        className="font-bold"
                        style={{ color: "#E8600A" }}
                      >
                        ↺ Reset to TDD order
                      </button>
                    )}
                  </div>
                  <table className="w-full text-xs" style={{ minWidth: 900 }}>
                    <thead>
                      <tr style={{ background: "#22303C", color: "#fff" }}>
                        <th className="px-2 py-2 text-left">Pri</th>
                        <th className="px-2 py-2 text-left">Job</th>
                        <th className="px-2 py-2 text-left">Customer Tag</th>
                        <th className="px-2 py-2 text-left">Product Family</th>
                        <th className="px-2 py-2">Target Delivery</th>
                        <th className="px-2 py-2">OTD Date</th>
                        <th className="px-2 py-2 text-left">Owner</th>
                        <th className="px-2 py-2 text-left">Job Status ✎</th>
                        <th className="px-2 py-2">Prod %</th>
                        <th className="px-2 py-2">Value</th>
                        <th className="px-2 py-2">Throughput</th>
                        <th className="px-2 py-2">T%</th>
                        <th className="px-2 py-2">Kit%</th>
                      </tr>
                    </thead>
                    <tbody>
                      {plist.map((j, i) => (
                        <tr
                          key={j.id}
                          draggable={canDrag}
                          onDragStart={() => setDragIdx(i)}
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={() => onDrop(i)}
                          className="border-t"
                          style={{
                            borderColor: "#EFEDE7",
                            background:
                              dragIdx === i
                                ? "#FFF3E8"
                                : i % 2
                                  ? "#FAF9F5"
                                  : "#fff",
                            cursor: canDrag ? "grab" : "default",
                          }}
                          title={j.note}
                        >
                          <td
                            className="px-2 py-1.5 whitespace-nowrap"
                            style={{ color: "#8A94A0" }}
                          >
                            {canDrag && (
                              <span style={{ color: "#B8B5AC" }}>⠿ </span>
                            )}
                            <b style={{ color: "#E8600A" }}>{i + 1}</b>
                          </td>
                          <td className="px-2 py-1.5">
                            <JobLink j={j} />
                          </td>
                          <td className="px-2 py-1.5 font-medium">{j.tag}</td>
                          <td
                            className="px-2 py-1.5"
                            style={{ color: "#5A6672" }}
                          >
                            {j.fam}
                          </td>
                          <td
                            className="px-2 py-1.5 text-center font-bold whitespace-nowrap"
                            style={{
                              color:
                                j.tdd && j.tdd < TODAY ? "#B3261E" : "#22303C",
                              fontVariantNumeric: "tabular-nums",
                            }}
                          >
                            {fmtFull(j.tdd)}
                          </td>
                          <td
                            className="px-2 py-1.5 text-center font-bold whitespace-nowrap"
                            style={{
                              color: otdColor(j.otd),
                              fontVariantNumeric: "tabular-nums",
                            }}
                          >
                            {fmtFull(j.otd)}
                            {otdDelay(j) && (
                              <div style={{ fontSize: 10 }}>
                                +{otdDelay(j)}d late
                              </div>
                            )}
                          </td>
                          <td
                            className="px-2 py-1.5"
                            style={{ color: "#1B3A5C" }}
                          >
                            {j.own || "—"}
                          </td>
                          <td className="px-2 py-1.5">
                            <select
                              value={j.stat}
                              onChange={(e) => {
                                patchJob(j.id, { stat: e.target.value });
                                pushERP(
                                  "Jobmaster",
                                  "JOB " + jobNo(j.id),
                                  "job_status",
                                  e.target.value,
                                );
                              }}
                              className="text-xs border rounded px-1 py-0.5 bg-white w-full"
                              style={{ borderColor: "#E2E0DA", maxWidth: 190 }}
                            >
                              {!statuses.includes(j.stat) && (
                                <option value={j.stat}>{j.stat}</option>
                              )}
                              {statuses.map((s) => (
                                <option key={s}>{s}</option>
                              ))}
                            </select>
                          </td>
                          <td
                            className="px-2 py-1.5 text-center"
                            style={{ fontVariantNumeric: "tabular-nums" }}
                          >
                            {j.pct}%
                          </td>
                          <td
                            className="px-2 py-1.5 text-right whitespace-nowrap"
                            style={{ fontVariantNumeric: "tabular-nums" }}
                          >
                            {V(j.val)}
                          </td>
                          <td
                            className="px-2 py-1.5 text-right whitespace-nowrap"
                            style={{
                              fontVariantNumeric: "tabular-nums",
                              color: "#E8600A",
                            }}
                          >
                            {V(j.tpv || 0)}
                          </td>
                          <td
                            className="px-2 py-1.5 text-center"
                            style={{ fontVariantNumeric: "tabular-nums" }}
                          >
                            {j.tpp || 0}%
                          </td>
                          <td
                            className="px-2 py-1.5 text-center"
                            style={{
                              fontVariantNumeric: "tabular-nums",
                              color:
                                (j.kit || 0) >= 80
                                  ? "#0D7A3F"
                                  : (j.kit || 0) >= 40
                                    ? "#D97706"
                                    : "#B3261E",
                            }}
                          >
                            {j.kit || 0}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })()}

          {subTab === "okan" && (
            <div className="flex gap-3 overflow-x-auto pb-2 items-start">
              {(delOwn === "all"
                ? owners.concat(jobs.some((j) => !j.own) ? ["Unassigned"] : [])
                : [delOwn]
              ).map((o) => {
                const ojobs = byTDD.filter((j) =>
                  o === "Unassigned" ? !j.own : j.own === o,
                );
                if (!ojobs.length) return null;
                return (
                  <div key={o} style={{ minWidth: 250, maxWidth: 270 }}>
                    <div
                      className="rounded-t-lg p-2"
                      style={{
                        background: "#16232F",
                        color: "#fff",
                        borderBottom: "3px solid #E8600A",
                      }}
                    >
                      <div className="flex justify-between items-baseline">
                        <span
                          className="font-bold text-sm"
                          style={{ color: "#F5B32B" }}
                        >
                          {o}
                        </span>
                        <span className="text-xs">
                          {ojobs.length} jobs ·{" "}
                          {V(ojobs.reduce((s, j) => s + j.val, 0))}
                        </span>
                      </div>
                    </div>
                    <div
                      className="rounded-b-lg p-2"
                      style={{ background: "#E9E6DD" }}
                    >
                      {ojobs.map((j) => (
                        <div
                          key={j.id}
                          onClick={() => openJob(j.id)}
                          className="rounded p-2 mb-1.5 cursor-pointer bg-white border"
                          style={{
                            borderColor: "#E2E0DA",
                            borderLeft: `4px solid ${otdColor(j.otd)}`,
                          }}
                        >
                          <div className="flex justify-between items-baseline">
                            <span
                              className="font-bold text-xs"
                              style={{ color: "#1B3A5C" }}
                            >
                              JOB {jobNo(j.id)}
                            </span>
                            <span
                              className="text-xs font-bold"
                              style={{
                                color:
                                  j.tdd && j.tdd < TODAY
                                    ? "#B3261E"
                                    : "#5A6672",
                              }}
                            >
                              TDD {fmt(j.tdd)}
                            </span>
                          </div>
                          <div className="text-xs truncate" title={j.tag}>
                            {j.tag}
                          </div>
                          <div
                            className="text-xs flex justify-between mt-0.5"
                            style={{ color: "#8A94A0" }}
                          >
                            <span>{j.stat.slice(0, 22)}</span>
                            <span>{j.pct}%</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {(subTab === "fam" || subTab === "cust") &&
            (() => {
              const key = subTab;
              const mset = [
                ...new Set(
                  byTDD.map((j) => (j.tdd || "").slice(0, 7)).filter(Boolean),
                ),
              ].sort();
              const mlabel = (m) =>
                parseISO(m + "-01").toLocaleDateString("en-IN", {
                  month: "short",
                  year: "2-digit",
                  timeZone: "UTC",
                });
              const groups = {};
              byTDD.forEach((j) => {
                const g = (groups[j[key]] = groups[j[key]] || {
                  total: { n: 0, v: 0 },
                  m: {},
                });
                g.total.n++;
                g.total.v += j.val;
                const mm = (j.tdd || "").slice(0, 7);
                if (mm) {
                  const c = (g.m[mm] = g.m[mm] || { n: 0, v: 0 });
                  c.n++;
                  c.v += j.val;
                }
              });
              const names = Object.keys(groups).sort();
              return (
                <div
                  className="bg-white rounded-lg border overflow-x-auto mb-4"
                  style={{ borderColor: "#E2E0DA" }}
                >
                  <div
                    className="px-3 pt-2 text-xs font-bold"
                    style={{ color: "#8A94A0" }}
                  >
                    NANDAN GSE PRODUCTION SCHEDULE — month-wise by{" "}
                    {key === "fam" ? "product family" : "customer"} (live from
                    Target Delivery Dates, as in PRE)
                  </div>
                  <table className="text-xs w-full" style={{ minWidth: 720 }}>
                    <thead>
                      <tr style={{ background: "#22303C", color: "#fff" }}>
                        <th className="px-3 py-2 text-left">
                          {key === "fam" ? "Product Family" : "Customer"}
                        </th>
                        <th className="px-2 py-2">Jobs</th>
                        <th className="px-2 py-2">Value</th>
                        {mset.map((m) => (
                          <th key={m} className="px-2 py-2 whitespace-nowrap">
                            {mlabel(m)}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {names.map((n, i) => (
                        <tr
                          key={n}
                          className="border-t"
                          style={{
                            borderColor: "#EFEDE7",
                            background: i % 2 ? "#FAF9F5" : "#fff",
                          }}
                        >
                          <td className="px-3 py-1.5 font-semibold">{n}</td>
                          <td
                            className="px-2 py-1.5 text-center font-bold"
                            style={{ fontVariantNumeric: "tabular-nums" }}
                          >
                            {groups[n].total.n}
                          </td>
                          <td
                            className="px-2 py-1.5 text-center whitespace-nowrap"
                            style={{ fontVariantNumeric: "tabular-nums" }}
                          >
                            {V(groups[n].total.v)}
                          </td>
                          {mset.map((m) => {
                            const c = groups[n].m[m];
                            return (
                              <td
                                key={m}
                                className="px-2 py-1.5 text-center whitespace-nowrap"
                                style={{
                                  fontVariantNumeric: "tabular-nums",
                                  background: c ? "#DCE8F5" : "transparent",
                                  border: "1px solid #F1EFE9",
                                }}
                              >
                                {c ? (
                                  <>
                                    <b>{c.n}</b> · {V(c.v)}
                                  </>
                                ) : (
                                  "·"
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                      <tr
                        style={{ background: "#16232F", color: "#F5B32B" }}
                        className="font-bold"
                      >
                        <td className="px-3 py-2">TOTAL</td>
                        <td className="px-2 py-2 text-center">
                          {byTDD.length}
                        </td>
                        <td className="px-2 py-2 text-center whitespace-nowrap">
                          {V(byTDD.reduce((s, j) => s + j.val, 0))}
                        </td>
                        {mset.map((m) => {
                          const list = byTDD.filter(
                            (j) => (j.tdd || "").slice(0, 7) === m,
                          );
                          return (
                            <td
                              key={m}
                              className="px-2 py-2 text-center whitespace-nowrap"
                            >
                              {list.length ? (
                                <>
                                  {list.length} ·{" "}
                                  {V(list.reduce((s, j) => s + j.val, 0))}
                                </>
                              ) : (
                                "·"
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    </tbody>
                  </table>
                </div>
              );
            })()}

          {(subTab === "fam" || subTab === "cust") &&
            groupBy(subTab).map(([g, list]) => (
              <div key={g} className="mb-4">
                <div className="flex items-baseline gap-2 mb-1">
                  <h3 className="font-bold" style={{ color: "#16232F" }}>
                    {g}
                  </h3>
                  <span className="text-xs" style={{ color: "#8A94A0" }}>
                    {list.length} jobs ·{" "}
                    {V(list.reduce((s, j) => s + j.val, 0))} · earliest TDD{" "}
                    {fmt(list[0].tdd)}
                  </span>
                </div>
                <div
                  className="bg-white rounded-lg border overflow-x-auto"
                  style={{ borderColor: "#E2E0DA" }}
                >
                  <table className="w-full text-xs" style={{ minWidth: 760 }}>
                    <tbody>
                      {list.map((j, i) => (
                        <tr
                          key={j.id}
                          className="border-t"
                          style={{
                            borderColor: "#EFEDE7",
                            background: i % 2 ? "#FAF9F5" : "#fff",
                          }}
                          title={j.note}
                        >
                          <td className="px-2 py-1.5" style={{ width: 50 }}>
                            <JobLink j={j} />
                          </td>
                          <td className="px-2 py-1.5 font-medium">{j.tag}</td>
                          <td
                            className="px-2 py-1.5"
                            style={{ color: "#5A6672" }}
                          >
                            {subTab === "fam" ? j.cust : j.fam}
                          </td>
                          <td
                            className="px-2 py-1.5 text-center font-bold whitespace-nowrap"
                            style={{
                              color:
                                j.tdd && j.tdd < TODAY ? "#B3261E" : "#22303C",
                            }}
                          >
                            TDD {fmtFull(j.tdd)}
                          </td>
                          <td
                            className="px-2 py-1.5 text-center whitespace-nowrap font-bold"
                            style={{ color: otdColor(j.otd) }}
                          >
                            OTD {fmtFull(j.otd)}
                            {otdDelay(j) && (
                              <span style={{ fontSize: 10 }}>
                                {" "}
                                +{otdDelay(j)}d
                              </span>
                            )}
                          </td>
                          <td className="px-2 py-1.5" style={{ width: 170 }}>
                            {j.stat}
                          </td>
                          <td
                            className="px-2 py-1.5 text-center"
                            style={{ width: 46 }}
                          >
                            {j.pct}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          <div className="text-xs mt-2" style={{ color: "#8A94A0" }}>
            Click any job number to open its Milestone Plan · hover a row for
            the latest weekly note from the Jobmaster.
          </div>
        </div>
      )}

      {/* ================= ADMIN · DEFAULT TEMPLATES ================= */}
      {tab === "admin" && isAdmin && (
        <div className="p-4">
          <h2 className="font-bold text-lg" style={{ color: "#16232F" }}>
            👥 Users & Access{" "}
            <span className="font-normal text-xs" style={{ color: "#8A94A0" }}>
              admin only — create logins and set what each person can do
            </span>
          </h2>
          <div
            className="bg-white rounded-lg border p-3 mt-2 mb-5"
            style={{ borderColor: "#E2E0DA" }}
          >
            <table className="w-full text-xs mb-2">
              <thead>
                <tr style={{ background: "#22303C", color: "#fff" }}>
                  <th className="px-2 py-1.5 text-left">Email</th>
                  <th className="px-2 py-1.5 text-left">Role</th>
                  <th className="px-2 py-1.5 text-left">Can do</th>
                  <th className="px-2 py-1.5"></th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr
                    key={u.email}
                    className="border-t"
                    style={{ borderColor: "#EFEDE7" }}
                  >
                    <td className="px-2 py-1.5 font-semibold">
                      {u.email}
                      {u.email === user ? " (you)" : ""}
                    </td>
                    <td className="px-2 py-1.5">
                      <select
                        value={u.role}
                        disabled={u.email === "raghu@nandan.co.in"}
                        onChange={(e) =>
                          saveUsers(
                            users.map((x) =>
                              x.email === u.email
                                ? { ...x, role: e.target.value }
                                : x,
                            ),
                          )
                        }
                        className="border rounded px-1 py-0.5 bg-white"
                        style={{ borderColor: "#E2E0DA" }}
                      >
                        <option value="admin">admin</option>
                        <option value="planner">planner</option>
                        <option value="uploader">uploader</option>
                      </select>
                    </td>
                    <td className="px-2 py-1.5" style={{ color: "#8A94A0" }}>
                      {u.role === "admin"
                        ? "everything + Admin portal + user management"
                        : u.role === "planner"
                          ? "all boards & editing — no Admin portal"
                          : "ONLY the morning Excel upload screen"}
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      {u.email !== "raghu@nandan.co.in" &&
                        u.email !== user && (
                          <button
                            onClick={() =>
                              window.confirm("Remove " + u.email + "?") &&
                              saveUsers(
                                users.filter((x) => x.email !== u.email),
                              )
                            }
                            className="font-bold"
                            style={{ color: "#B3261E" }}
                          >
                            ✕
                          </button>
                        )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex gap-1.5 items-center flex-wrap">
              <input
                placeholder="email"
                value={uForm.email}
                onChange={(e) => setUForm({ ...uForm, email: e.target.value })}
                className="text-xs border rounded px-2 py-1.5"
                style={{ borderColor: "#E2E0DA", minWidth: 210 }}
              />
              <input
                placeholder="password"
                value={uForm.pw}
                onChange={(e) => setUForm({ ...uForm, pw: e.target.value })}
                className="text-xs border rounded px-2 py-1.5"
                style={{ borderColor: "#E2E0DA", width: 130 }}
              />
              <select
                value={uForm.role}
                onChange={(e) => setUForm({ ...uForm, role: e.target.value })}
                className="text-xs border rounded px-2 py-1.5 bg-white"
                style={{ borderColor: "#E2E0DA" }}
              >
                <option value="planner">planner</option>
                <option value="uploader">uploader (upload-only)</option>
                <option value="admin">admin</option>
              </select>
              <button
                onClick={() => {
                  const em = uForm.email.trim().toLowerCase();
                  if (!em || !uForm.pw) return;
                  if (users.some((u) => u.email === em)) {
                    alert("A user with that email already exists.");
                    return;
                  }
                  saveUsers([
                    ...users,
                    { email: em, pw: uForm.pw, role: uForm.role },
                  ]);
                  setUForm({ email: "", pw: "", role: "planner" });
                }}
                className="text-xs font-bold rounded px-3 py-1.5"
                style={{ background: "#0D7A3F", color: "#fff" }}
              >
                + Create user
              </button>
            </div>
            <div className="text-xs mt-2" style={{ color: "#8A94A0" }}>
              ⚠ Prototype-grade access control (passwords stored in the app's
              shared storage, visible to admins). In the Frappe deployment this
              entire screen is replaced by ERPNext's own users, roles and
              permissions — one login for ERP and this suite.
            </div>
          </div>
          <h2 className="font-bold text-lg" style={{ color: "#16232F" }}>
            Product Family Default Templates{" "}
            <span className="font-normal text-xs" style={{ color: "#8A94A0" }}>
              admin only — the plan every new job of a family starts from
            </span>
          </h2>
          <div className="flex gap-2 items-center flex-wrap mt-2 mb-3">
            <select
              value={adminFam}
              onChange={(e) => e.target.value && loadAdminFam(e.target.value)}
              className="px-2 py-1.5 rounded border bg-white text-sm"
              style={{ borderColor: "#D9D6CD" }}
            >
              <option value="">— pick a family to edit —</option>
              {[...new Set([...fams, ...Object.keys(customT)])]
                .sort()
                .map((f) => (
                  <option key={f}>
                    {f}
                    {customT[f] ? " ●" : ""}
                  </option>
                ))}
            </select>
            <input
              placeholder="…or new family name (e.g. AGSE - Aircraft Tug)"
              value={newFam}
              onChange={(e) => setNewFam(e.target.value)}
              className="px-2 py-1.5 rounded border text-sm"
              style={{ borderColor: "#D9D6CD", minWidth: 260 }}
            />
            <button
              onClick={() => {
                if (!newFam.trim()) return;
                loadAdminFam(newFam.trim());
                setNewFam("");
              }}
              className="px-3 py-1.5 rounded text-sm font-bold"
              style={{ background: "#22303C", color: "#fff" }}
            >
              + Create family
            </button>
          </div>
          {adminRows && (
            <>
              <div
                className="bg-white rounded-lg border overflow-x-auto"
                style={{ borderColor: "#E2E0DA" }}
              >
                <table className="w-full text-sm" style={{ minWidth: 860 }}>
                  <thead>
                    <tr
                      style={{ background: "#22303C", color: "#fff" }}
                      className="text-xs"
                    >
                      <th className="px-2 py-2 text-left">#</th>
                      <th
                        className="px-2 py-2 text-left"
                        style={{ minWidth: 220 }}
                      >
                        Default milestone
                      </th>
                      <th className="px-2 py-2">Days</th>
                      <th className="px-2 py-2">Preds (e.g. 1,3)</th>
                      {TRADES.map((t) => (
                        <th key={t.key} className="px-1 py-2">
                          <span
                            style={{
                              color: t.color,
                              filter: "brightness(1.7)",
                            }}
                          >
                            {t.tiny}
                          </span>
                        </th>
                      ))}
                      <th className="px-1 py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {adminRows.map((m, i) => (
                      <tr
                        key={i}
                        className="border-t"
                        style={{
                          borderColor: "#EFEDE7",
                          background: i % 2 ? "#FAF9F5" : "#fff",
                        }}
                      >
                        <td
                          className="px-2 py-1 font-bold"
                          style={{ color: "#E8600A" }}
                        >
                          {i + 1}
                        </td>
                        <td className="px-2 py-1">
                          <input
                            value={m.name}
                            onChange={(e) =>
                              setAdminRows((rs) =>
                                rs.map((r, ri) =>
                                  ri === i ? { ...r, name: e.target.value } : r,
                                ),
                              )
                            }
                            className="w-full px-1 py-0.5 rounded border"
                            style={{ borderColor: "#E2E0DA" }}
                          />
                        </td>
                        <td className="px-1 py-1 text-center">
                          <input
                            type="number"
                            min="1"
                            value={m.days}
                            onChange={(e) =>
                              setAdminRows((rs) =>
                                rs.map((r, ri) =>
                                  ri === i
                                    ? {
                                        ...r,
                                        days: Math.max(
                                          1,
                                          parseInt(e.target.value, 10) || 1,
                                        ),
                                      }
                                    : r,
                                ),
                              )
                            }
                            className="w-14 text-center rounded border py-0.5"
                            style={{ borderColor: "#E2E0DA" }}
                          />
                        </td>
                        <td className="px-1 py-1 text-center">
                          <input
                            value={(m.preds || []).join(",")}
                            onChange={(e) => {
                              const ps = e.target.value
                                .split(",")
                                .map((x) => parseInt(x.trim(), 10))
                                .filter((p) => p >= 1 && p <= i);
                              setAdminRows((rs) =>
                                rs.map((r, ri) =>
                                  ri === i ? { ...r, preds: ps } : r,
                                ),
                              );
                            }}
                            className="w-20 text-center rounded border py-0.5 text-xs"
                            style={{ borderColor: "#E2E0DA" }}
                            placeholder="—"
                          />
                        </td>
                        {TRADES.map((t) => (
                          <td key={t.key} className="px-0.5 py-1 text-center">
                            <CrewCell
                              value={m.crew[t.key]}
                              color={t.color}
                              onChange={(v) =>
                                setAdminRows((rs) =>
                                  rs.map((r, ri) =>
                                    ri === i
                                      ? {
                                          ...r,
                                          crew: { ...r.crew, [t.key]: v },
                                        }
                                      : r,
                                  ),
                                )
                              }
                            />
                          </td>
                        ))}
                        <td className="px-1 py-1 text-center">
                          <button
                            onClick={() =>
                              setAdminRows((rs) =>
                                rs
                                  .filter((_, ri) => ri !== i)
                                  .map((r) => ({
                                    ...r,
                                    preds: (r.preds || [])
                                      .map((p) =>
                                        p > i + 1 ? p - 1 : p === i + 1 ? 0 : p,
                                      )
                                      .filter(Boolean),
                                  })),
                              )
                            }
                            className="text-xs"
                            style={{ color: "#B3261E" }}
                          >
                            ✕
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex gap-2 mt-2 items-center flex-wrap">
                <button
                  onClick={() =>
                    adminRows.length < 50 &&
                    setAdminRows((rs) => [
                      ...rs,
                      {
                        name: "Milestone " + (rs.length + 1),
                        days: 3,
                        preds: rs.length ? [rs.length] : [],
                        crew: zeroCrew(),
                        offset: 0,
                        shift: "D",
                      },
                    ])
                  }
                  className="px-3 py-1.5 rounded text-sm font-semibold"
                  style={{ background: "#22303C", color: "#fff" }}
                >
                  + Add row ({adminRows.length}/50)
                </button>
                <button
                  onClick={() => {
                    setCustomT((c) => ({ ...c, [adminFam]: adminRows }));
                    pushERP(
                      "Product Family Template",
                      adminFam,
                      "default_template",
                      adminRows.length + " milestones",
                    );
                    alert(
                      'Saved ✓ — every job of "' +
                        adminFam +
                        '" that has no plan yet will now start from this template.',
                    );
                  }}
                  className="px-4 py-1.5 rounded text-sm font-bold"
                  style={{ background: "#0D7A3F", color: "#fff" }}
                >
                  💾 Save as default for {adminFam}
                </button>
                {customT[adminFam] && (
                  <button
                    onClick={() => {
                      setCustomT((c) => {
                        const n = { ...c };
                        delete n[adminFam];
                        return n;
                      });
                      loadAdminFam(adminFam);
                    }}
                    className="px-3 py-1.5 rounded text-sm border"
                    style={{ borderColor: "#B3261E", color: "#B3261E" }}
                  >
                    Revert to built-in
                  </button>
                )}
                <span className="text-xs" style={{ color: "#8A94A0" }}>
                  ● = family has an admin template · existing saved job plans
                  are never touched by template changes
                </span>
              </div>
            </>
          )}
        </div>
      )}

      {/* ================= UPDATE TO ERP ================= */}
      {tab === "erp" && (
        <div className="p-4">
          <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
            <div>
              <h2 className="font-bold text-lg" style={{ color: "#16232F" }}>
                Update to ERP
              </h2>
              <div className="text-xs" style={{ color: "#8A94A0" }}>
                Every edit made in this session is logged here. No API push —
                open the job in ERPNext with its 🔗 link, apply the change by
                hand, then mark it applied. Full audit trail of who changed
                what.
              </div>
            </div>
            <button
              onClick={() =>
                setErpLog((l) => l.map((e) => ({ ...e, status: "synced" })))
              }
              disabled={!erpLog.some((e) => e.status === "queued")}
              className="px-4 py-2 rounded font-bold text-sm"
              style={{
                background: erpLog.some((e) => e.status === "queued")
                  ? "#0D7A3F"
                  : "#D9D6CD",
                color: "#fff",
              }}
            >
              ✓ Mark all {erpLog.filter((e) => e.status === "queued").length}{" "}
              applied in ERP
            </button>
          </div>
          {erpLog.length === 0 ? (
            <div
              className="bg-white border rounded-lg p-6 text-center text-sm"
              style={{ borderColor: "#E2E0DA", color: "#8A94A0" }}
            >
              No changes logged. Edit a TDD, Job Status, Mgmt Target, material
              status, milestone or priority order — it will appear here with a
              direct link to that job in ERPNext.
            </div>
          ) : (
            <>
            {(() => {
              const seen = {};
              erpLog.forEach((e) => {
                const lk = e.link || erpLinkFor(e.docname);
                if (lk && !seen[lk]) {
                  const jid = lk.split("/").pop();
                  const jb = jobs.find((j) => j.id === jid);
                  seen[lk] = { lk, jid, tag: jb ? jb.tag : "" };
                }
              });
              const touched = Object.values(seen);
              return touched.length ? (
                <div className="mb-2 flex flex-wrap gap-1 items-center">
                  <span className="text-xs font-bold" style={{ color: "#16232F" }}>
                    Jobs touched this session:
                  </span>
                  {touched.map((t) => (
                    <a
                      key={t.lk}
                      href={t.lk}
                      target="_blank"
                      rel="noreferrer"
                      title={t.tag + " — open in ERPNext"}
                      className="text-xs font-bold rounded px-2 py-0.5"
                      style={{ background: "#DCE8F5", color: "#1B3A5C" }}
                    >
                      🔗 JOB {t.jid.slice(-4)}
                    </a>
                  ))}
                </div>
              ) : null;
            })()}
            <div
              className="bg-white rounded-lg border overflow-x-auto"
              style={{ borderColor: "#E2E0DA" }}
            >
              <table className="w-full text-xs" style={{ minWidth: 760 }}>
                <thead>
                  <tr style={{ background: "#22303C", color: "#fff" }}>
                    <th className="px-3 py-2 text-left">Time</th>
                    <th className="px-3 py-2 text-left">DocType</th>
                    <th className="px-3 py-2 text-left">Record</th>
                    <th className="px-3 py-2 text-left">Field</th>
                    <th className="px-3 py-2 text-left">New value</th>
                    <th className="px-3 py-2 text-left">By</th>
                    <th className="px-3 py-2">ERP Link</th>
                    <th className="px-3 py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {erpLog.map((e, i) => (
                    <tr
                      key={e.id}
                      className="border-t"
                      style={{
                        borderColor: "#EFEDE7",
                        background: i % 2 ? "#FAF9F5" : "#fff",
                      }}
                    >
                      <td
                        className="px-3 py-1.5"
                        style={{
                          color: "#8A94A0",
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {e.time}
                      </td>
                      <td className="px-3 py-1.5">{e.doctype}</td>
                      <td className="px-3 py-1.5 font-semibold">{e.docname}</td>
                      <td className="px-3 py-1.5" style={{ color: "#5A6672" }}>
                        {e.field}
                      </td>
                      <td
                        className="px-3 py-1.5 font-bold"
                        style={{ color: "#1B3A5C" }}
                      >
                        {e.value}
                      </td>
                      <td className="px-3 py-1.5" style={{ color: "#8A94A0" }}>
                        {user}
                      </td>
                      <td className="px-3 py-1.5 text-center">
                        {(() => {
                          const lk = e.link || erpLinkFor(e.docname);
                          return lk ? (
                            <a
                              href={lk}
                              target="_blank"
                              rel="noreferrer"
                              className="font-bold rounded px-2 py-0.5"
                              style={{ background: "#DCE8F5", color: "#1B3A5C" }}
                              title="Open this job in ERPNext and apply the change"
                            >
                              🔗 Open
                            </a>
                          ) : (
                            <span style={{ color: "#B8B5AC" }}>—</span>
                          );
                        })()}
                      </td>
                      <td className="px-3 py-1.5 text-center">
                        <span
                          className="rounded px-2 py-0.5 font-bold"
                          style={
                            e.status === "synced"
                              ? { background: "#E6F4EA", color: "#0D7A3F" }
                              : { background: "#FFF3E0", color: "#D97706" }
                          }
                        >
                          {e.status === "synced" ? "✓ applied" : "⏳ to apply"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            </>
          )}
          <div className="text-xs mt-2" style={{ color: "#8A94A0" }}>
            In ERPNext each row is a frappe.client.set_value call; the batch
            push becomes a single whitelisted method with a version log per
            document.
          </div>
        </div>
      )}

      {/* ===== Shweta's morning links panel ===== */}
      {showLinks && (
        <div
          onClick={() => setShowLinks(false)}
          className="fixed inset-0 flex items-center justify-center p-4"
          style={{ background: "rgba(13,22,31,0.75)", zIndex: 70 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-lg p-4 w-full"
            style={{
              maxWidth: 700,
              maxHeight: "85vh",
              overflowY: "auto",
              borderTop: "4px solid #E8600A",
            }}
          >
            <div className="flex justify-between items-start">
              <div>
                <div className="font-bold" style={{ color: "#16232F" }}>
                  🌅 Morning update — 3 files, 3 clicks{" "}
                  <span
                    className="font-normal text-xs"
                    style={{ color: "#8A94A0" }}
                  >
                    · same links as the PRE › Data Analysis rows · after the
                    7:30 AM refresh: Download → Upload, one by one
                  </span>
                </div>
              </div>
              <button
                onClick={() => setShowLinks(false)}
                style={{ color: "#8A94A0" }}
              >
                ✕
              </button>
            </div>
            <table className="w-full text-xs mt-2 mb-3">
              <tbody>
                {DEFAULT_SOURCES.map((src, i) => (
                  <tr
                    key={src.key}
                    className="border-t align-top"
                    style={{
                      borderColor: "#EFEDE7",
                      background: i % 2 ? "#FAF9F5" : "#fff",
                    }}
                  >
                    <td
                      className="px-2 py-2 font-bold text-center"
                      style={{ color: "#E8600A", width: 26 }}
                    >
                      {i + 1}
                    </td>
                    <td className="px-2 py-2" style={{ minWidth: 190 }}>
                      <div className="font-bold" style={{ color: "#1B3A5C" }}>
                        {src.nm}
                      </div>
                      <div style={{ color: "#8A94A0" }}>{src.desc}</div>
                    </td>
                    <td className="px-2 py-2">
                      <div className="flex gap-1.5 flex-wrap items-center">
                        <a
                          href={src.erp}
                          target="_blank"
                          rel="noreferrer"
                          className="font-bold rounded px-2 py-1"
                          style={{
                            background: "#22303C",
                            color: "#fff",
                            textDecoration: "none",
                          }}
                          title="Open the live report in ERPNext"
                        >
                          ERP ↗
                        </a>
                        <a
                          href={gsExport(src.gs)}
                          className="font-bold rounded px-2 py-1"
                          style={{
                            background: "#1B3A5C",
                            color: "#fff",
                            textDecoration: "none",
                          }}
                          title="Downloads Shweta's mirror sheet as .xlsx"
                        >
                          ⬇ Download
                        </a>
                        <button
                          onClick={() =>
                            fileRef.current && fileRef.current.click()
                          }
                          className="font-bold rounded px-2 py-1"
                          style={{ background: "#E8600A", color: "#fff" }}
                          title="Upload the file you just downloaded — I detect which of the three it is automatically"
                        >
                          ⬆ Upload
                        </button>
                        {loadedSrc[src.key] ? (
                          <span
                            className="font-bold rounded px-2 py-1"
                            style={{ background: "#E6F4EA", color: "#0D7A3F" }}
                          >
                            ✓ loaded {loadedSrc[src.key]}
                          </span>
                        ) : (
                          <span
                            className="rounded px-2 py-1"
                            style={{ background: "#FFF3E0", color: "#D97706" }}
                          >
                            ⏳ not loaded today
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="text-xs mb-2" style={{ color: "#8A94A0" }}>
              Order does not matter — each file fills in what it knows without
              disturbing your plans, checkmarks, baselines or comments. The full
              PRE workbook also still works and covers steps 1 + 2 in one file.
            </div>
            {sources.length === 0 ? null : (
              <table className="w-full text-xs mt-2">
                <tbody>
                  <tr>
                    <td
                      colSpan={2}
                      className="px-2 pt-2 font-bold text-xs"
                      style={{ color: "#8A94A0" }}
                    >
                      All refresh links found in the last uploaded PRE:
                    </td>
                  </tr>
                  {sources.map((src, i) => (
                    <tr
                      key={i}
                      className="border-t align-top"
                      style={{
                        borderColor: "#EFEDE7",
                        background: i % 2 ? "#FAF9F5" : "#fff",
                      }}
                    >
                      <td
                        className="px-2 py-2 font-bold whitespace-nowrap"
                        style={{ color: "#1B3A5C" }}
                      >
                        {src.nm}
                        <div
                          className="font-normal"
                          style={{ color: "#8A94A0" }}
                        >
                          {src.stamp}
                        </div>
                      </td>
                      <td className="px-2 py-2">
                        <div className="flex gap-2 flex-wrap">
                          {src.gs && (
                            <a
                              href={gsExport(src.gs)}
                              target="_blank"
                              rel="noreferrer"
                              className="font-bold rounded px-2 py-1"
                              style={{
                                background: "#E8600A",
                                color: "#fff",
                                textDecoration: "none",
                              }}
                            >
                              ⬇ Download sheet
                            </a>
                          )}
                          {src.gs && (
                            <button
                              onClick={() => tryAutoFetch(src)}
                              className="font-bold rounded px-2 py-1 border"
                              style={{
                                borderColor: "#22303C",
                                color: "#22303C",
                              }}
                            >
                              ⚡ Try auto-fetch
                            </button>
                          )}
                          {src.erp && (
                            <a
                              href={src.erp}
                              target="_blank"
                              rel="noreferrer"
                              className="rounded px-2 py-1 border"
                              style={{
                                borderColor: "#D9D6CD",
                                color: "#5A6672",
                                textDecoration: "none",
                              }}
                            >
                              ERP report ↗
                            </a>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div className="text-xs mt-3" style={{ color: "#8A94A0" }}>
              Workflow: ⬇ Download sheet (Google exports it as .xlsx) → ⬆ Upload
              Excel here. The "Job in progress - Jobs" link IS the Jobmaster –
              Planning Reporting sheet; "To Do Dashboard All" feeds the task
              boards. Auto-fetch usually fails in the browser (Google blocks
              cross-site reads) — on the VPS deployment a server-side fetcher
              pulls these automatically each morning.
            </div>
          </div>
        </div>
      )}

      {/* ===== data source inspector ===== */}
      {showSrc &&
        (() => {
          const MAPS = {
            embedded: [
              [
                "Everything on screen",
                "Embedded July-2026 snapshot \u00b7 jobs from PRE W30 \u203a Data Analysis \u203a 'Job in progress - Jobs' link data (105 jobs in process) \u00b7 tasks from To Do Dashboard export \u00b7 owners & mgmt dates backfilled from Milestones for Delivery",
              ],
            ],
            jobmaster: [
              ["Job No / ID", "Jobmaster sheet › column 'ID'"],
              ["Customer Tag", "'Customer Tag'"],
              ["Product Family", "'Product Family'"],
              ["Customer", "'Customer'"],
              ["Value", "'Value'"],
              ["Target Delivery Date", "'Target Delivery Date Current'"],
              ["OTD Date", "'OTD Date'"],
              ["Job Start Date", "'Job Start Date'"],
              ["Job Status", "'Job Status'"],
              ["Prod %", "'Production Completion %'"],
              ["Hover note", "'Current Status'"],
              [
                "Throughput ₹ / T%",
                "'Throughput Expected Value (Auto)' / 'Throughput Expected pc'",
              ],
              ["Kitting %", "'Kitting percentage'"],
              [
                "Project Owner & Mgmt Target",
                "PRE file › 'Milestones for Delivery' (upload it after the Jobmaster file to merge)",
              ],
              [
                "Tasks kanban",
                "To Do Dashboard export › 'Todo Name', 'Details of Task', 'Allocated To', 'Due Date', 'Related to'",
              ],
            ],
            pre: [
              ["Job No / ID", "PRE › 'Milestones for Delivery' col A"],
              ["Customer Tag", "col B"],
              ["Product Family", "col C"],
              [
                "Target Delivery + Mgmt Target",
                "col D 'Management Target Date Request' (the PRE file has no separate current TDD)",
              ],
              ["Value", "col E"],
              [
                "Throughput %",
                "col F (fraction × 100); Throughput ₹ = Value × fraction",
              ],
              ["Project", "col G"],
              ["Customer", "col H"],
              [
                "Hover note",
                "col I 'Current Status' + Sales Order from Data Analysis",
              ],
              ["Project Owner", "col J"],
              [
                "OTD Date",
                "PRE › 'Data Analysis' › 'Customer Committed Date' of the job's project (project-level, shared by sibling jobs)",
              ],
              [
                "Job Status",
                "PRE › 'Jobmaster ERP' tab (Sep-2025, may be stale) — else 'Data Analysis' › 'Project Stage'",
              ],
              ["Kitting %", "PRE › 'Jobmaster ERP' tab"],
              [
                "Job Start Date / Prod %",
                "NOT in the PRE file — blank/0 until a Jobmaster export or the live API supplies them",
              ],
            ],
          };
          const rows = MAPS[srcKind] || MAPS.embedded;
          return (
            <div
              onClick={() => setShowSrc(false)}
              className="fixed inset-0 flex items-center justify-center p-4"
              style={{ background: "rgba(13,22,31,0.75)", zIndex: 70 }}
            >
              <div
                onClick={(e) => e.stopPropagation()}
                className="bg-white rounded-lg p-4 w-full"
                style={{
                  maxWidth: 640,
                  maxHeight: "85vh",
                  overflowY: "auto",
                  borderTop: "4px solid #E8600A",
                }}
              >
                <div className="flex justify-between items-start">
                  <div className="font-bold" style={{ color: "#16232F" }}>
                    Data provenance — current source:{" "}
                    <span style={{ color: "#E8600A" }}>
                      {srcKind === "pre"
                        ? "PRE Status workbook"
                        : srcKind === "jobmaster"
                          ? "Jobmaster export"
                          : "embedded snapshot"}
                    </span>
                  </div>
                  <button
                    onClick={() => setShowSrc(false)}
                    style={{ color: "#8A94A0" }}
                  >
                    ✕
                  </button>
                </div>
                <table className="w-full text-xs mt-2">
                  <tbody>
                    {rows.map(([f, src], i) => (
                      <tr
                        key={i}
                        className="border-t"
                        style={{
                          borderColor: "#EFEDE7",
                          background: i % 2 ? "#FAF9F5" : "#fff",
                        }}
                      >
                        <td
                          className="px-2 py-1.5 font-bold whitespace-nowrap align-top"
                          style={{ color: "#1B3A5C" }}
                        >
                          {f}
                        </td>
                        <td
                          className="px-2 py-1.5"
                          style={{ color: "#5A6672" }}
                        >
                          {src}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="text-xs mt-2" style={{ color: "#8A94A0" }}>
                  Milestone plans, load boards, matrices, delay days and all
                  totals are computed in the app, not read from any sheet. This
                  inspector is temporary scaffolding — in the ERPNext build
                  every field reads from its Jobmaster/ToDo field directly.
                </div>
              </div>
            </div>
          );
        })()}

      {/* ===== lightbox ===== */}
      {lightbox && (
        <div
          onClick={() => setLightbox(null)}
          className="fixed inset-0 flex items-center justify-center p-4"
          style={{ background: "rgba(13,22,31,0.7)", zIndex: 50 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-lg p-4 w-full"
            style={{
              maxWidth: 520,
              maxHeight: "80vh",
              overflowY: "auto",
              borderTop: "4px solid #E8600A",
            }}
          >
            <div className="flex justify-between items-start gap-3">
              <div className="text-xs font-bold" style={{ color: "#E8600A" }}>
                JOB {jobNo(lightbox.j)} · {(lightbox.cat || "").toUpperCase()}
              </div>
              <button
                onClick={() => setLightbox(null)}
                style={{ color: "#8A94A0" }}
              >
                ✕
              </button>
            </div>
            <div className="font-bold mt-1" style={{ color: "#16232F" }}>
              {lightbox.t}
            </div>
            {lightbox.d && (
              <div className="text-sm mt-2" style={{ color: "#5A6672" }}>
                {lightbox.d}
              </div>
            )}
            <div className="flex gap-2 mt-3 flex-wrap text-xs">
              <span
                className="rounded px-2 py-1"
                style={{ background: "#F4F2EC" }}
              >
                Assigned: <b>{lightbox.who}</b>
              </span>
              <span
                className="rounded px-2 py-1"
                style={dueStyle(lightbox.due)}
              >
                Due: <b>{fmtFull(lightbox.due)}</b>
              </span>
              {lightbox.esc && lightbox.esc !== "None" && (
                <span
                  className="rounded px-2 py-1 font-bold"
                  style={{ background: "#B3261E", color: "#fff" }}
                >
                  Escalation: {lightbox.esc}
                </span>
              )}
            </div>
            {!lightbox.ms && (
              <button
                onClick={() => {
                  toggleDone(lightbox.id);
                  setLightbox(null);
                }}
                className="mt-4 w-full py-2 rounded font-bold text-sm"
                style={{
                  background: lightbox.done ? "#8A94A0" : "#0D7A3F",
                  color: "#fff",
                }}
              >
                {lightbox.done ? "Re-open task" : "✓ Mark done"}
              </button>
            )}
            {!lightbox.ms &&
              (() => {
                const lt = tasks.find((x) => x.id === lightbox.id) || lightbox;
                return (
                  <div className="mt-3">
                    <div
                      className="text-xs font-bold"
                      style={{ color: "#16232F" }}
                    >
                      💬 Comments ({(lt.comments || []).length})
                    </div>
                    {(lt.comments || []).map((c, ci) => (
                      <div
                        key={ci}
                        className="text-xs rounded px-2 py-1 mt-1"
                        style={{ background: "#F4F2EC" }}
                      >
                        <b>{initials(c.by)}</b>{" "}
                        <span style={{ color: "#8A94A0" }}>· {c.at}</span>
                        <div style={{ color: "#22303C" }}>{c.txt}</div>
                      </div>
                    ))}
                    <div className="flex gap-1 mt-1">
                      <input
                        value={cmt}
                        onChange={(e) => setCmt(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && addComment(lt.id)}
                        placeholder="Add a comment…"
                        className="flex-1 text-xs border rounded px-2 py-1"
                        style={{ borderColor: "#E2E0DA" }}
                      />
                      <button
                        onClick={() => addComment(lt.id)}
                        className="text-xs font-bold rounded px-2"
                        style={{ background: "#22303C", color: "#fff" }}
                      >
                        Add
                      </button>
                    </div>
                  </div>
                );
              })()}
            {lightbox.ms && plans[lightbox.j] && lightbox.msIdx && (
              <button
                onClick={() => {
                  toggleMsDone(lightbox.j, lightbox.msIdx - 1);
                  pushERP(
                    "Job Plan",
                    "JOB " + jobNo(lightbox.j),
                    "milestone_" + lightbox.msIdx + "_done",
                    !lightbox.done ? "completed " + fmtFull(TODAY) : "re-opened",
                  );
                  setLightbox(null);
                }}
                className="mt-4 w-full py-2 rounded font-bold text-sm"
                style={{
                  background: lightbox.done ? "#8A94A0" : "#0D7A3F",
                  color: "#fff",
                }}
              >
                {lightbox.done ? "Re-open milestone" : "✓ Mark milestone complete"}
              </button>
            )}
            {lightbox.ms && (
              <div
                className="mt-2 text-xs text-center"
                style={{ color: "#8A94A0" }}
              >
                Same checkbox lives in the Milestone Plan table — the two stay
                in sync.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
