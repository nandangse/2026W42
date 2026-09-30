import { catColour, jobNo } from "@/lib/schedule";
import { sortTasks, catCounts, type SheetJob } from "@/lib/task-sheet";

/**
 * ONE JOB'S PENDING TASKS, AS A PICTURE.
 *
 * Dr Raghu, 30 Sep 2026: "it will be sent as a jpg when downloaded pending
 * button will be clicked."
 *
 * DRAWN, NOT SCREENSHOTTED — the same reason the delivery run is drawn. A
 * library that walks the DOM gets fonts and shadows wrong in ways nobody
 * notices until the picture is already in a group of thirty people. Drawn
 * here, the picture is exactly what this file says.
 *
 * A4 PORTRAIT PROPORTIONS, because the same sheet gets printed, and a picture
 * that does not match the paper it came from is confusing to hold side by
 * side with it.
 */

const C = {
  ink: "#16232F", navy: "#12386B", sub: "#46545F", faint: "#8B8F87",
  line: "#D8D5CC", rule: "#EFEDE7", paper: "#FFFFFF",
  red: "#B3261E", amber: "#B45309", green: "#0D7A3F",
};

const dmy = (s: string | null | undefined) =>
  s ? `${s.slice(8, 10)}-${s.slice(5, 7)}-${s.slice(2, 4)}` : "—";
const days = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);

function roundRect(x: CanvasRenderingContext2D, a: number, b: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  x.beginPath();
  x.moveTo(a + rr, b);
  x.arcTo(a + w, b, a + w, b + h, rr);
  x.arcTo(a + w, b + h, a, b + h, rr);
  x.arcTo(a, b + h, a, b, rr);
  x.arcTo(a, b, a + w, b, rr);
  x.closePath();
}
function cut(x: CanvasRenderingContext2D, s: string, max: number): string {
  if (x.measureText(s).width <= max) return s;
  let t = s;
  while (t.length > 3 && x.measureText(t + "…").width > max) t = t.slice(0, -1);
  return t + "…";
}

export function taskJpg(j: SheetJob, on: string): string {
  const W = 1240, H = 1754, PAD = 62;
  const open = sortTasks(j.tasks);
  const cats = catCounts(open);

  const cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  const x = cv.getContext("2d");
  if (!x) return "";
  const F = (px: number, w = "400") => `${w} ${px}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;

  x.fillStyle = C.paper; x.fillRect(0, 0, W, H);

  // ---- head ----
  const late = j.tdd && j.tdd < on ? days(j.tdd, on) : 0;
  x.fillStyle = C.navy; x.font = F(66, "800");
  x.fillText(jobNo(j.id), PAD, PAD + 56);
  const jw = x.measureText(jobNo(j.id)).width;

  x.fillStyle = C.ink; x.font = F(25, "700");
  x.fillText(cut(x, j.tag, W - PAD * 2 - jw - 250), PAD + jw + 26, PAD + 34);
  x.fillStyle = C.faint; x.font = F(17);
  x.fillText(cut(x, [j.fam, j.cust].filter(Boolean).join("  ·  "), W - PAD * 2 - jw - 250), PAD + jw + 26, PAD + 60);

  /* The date, right-aligned and measured in the font it is drawn in. */
  x.font = F(13, "700"); x.fillStyle = C.faint;
  const lbl = "TARGET DELIVERY";
  x.fillText(lbl, W - PAD - x.measureText(lbl).width, PAD + 18);
  const dtxt = `${dmy(j.tdd)}${late ? ` · ${late}d over` : ""}`;
  x.font = F(27, "800"); x.fillStyle = late ? C.red : C.ink;
  x.fillText(dtxt, W - PAD - x.measureText(dtxt).width, PAD + 50);
  if (j.owner) {
    x.font = F(15); x.fillStyle = C.faint;
    x.fillText(j.owner, W - PAD - x.measureText(j.owner).width, PAD + 72);
  }
  x.fillStyle = C.ink; x.fillRect(PAD, PAD + 88, W - PAD * 2, 3);

  // ---- the "where is it stuck" strip ----
  let y = PAD + 122;
  x.fillStyle = C.amber; x.font = F(40, "800");
  x.fillText(String(open.length), PAD, y + 12);
  const nw = x.measureText(String(open.length)).width;
  x.fillStyle = C.faint; x.font = F(17);
  x.fillText("open", PAD + nw + 10, y + 12);

  let cx = PAD + nw + 70;
  x.font = F(16, "700");
  for (const c of cats) {
    const t = `${c.n} ${c.cat}`;
    const w = x.measureText(t).width + 26;
    if (cx + w > W - PAD) break;
    const k = catColour(c.cat);
    x.fillStyle = k.bg; roundRect(x, cx, y - 16, w, 32, 5); x.fill();
    x.strokeStyle = k.edge; x.lineWidth = 1; x.stroke();
    x.fillStyle = k.ink; x.font = F(16, "700");
    x.fillText(t, cx + 13, y + 6);
    cx += w + 8;
  }
  y += 34;
  x.fillStyle = C.faint; x.font = F(15);
  const pct = `KIT ${j.kit}%   ·   PROD ${j.pct}%`;
  x.fillText(pct, W - PAD - x.measureText(pct).width, y);
  y += 26;

  // ---- table ----
  const COL = { who: PAD + 8, task: PAD + 178, cat: W - PAD - 320, due: W - PAD - 150, age: W - PAD - 8 };
  x.fillStyle = C.ink; x.fillRect(PAD, y, W - PAD * 2, 30);
  x.fillStyle = "#fff"; x.font = F(13, "700");
  x.fillText("ASSIGNED TO", COL.who, y + 20);
  x.fillText("WHAT IS PENDING", COL.task, y + 20);
  x.fillText("CATEGORY", COL.cat, y + 20);
  const dh = "DUE"; x.fillText(dh, COL.due - x.measureText(dh).width + 60, y + 20);
  const ah = "LATE"; x.fillText(ah, COL.age - x.measureText(ah).width, y + 20);
  y += 30;

  const ROW = 38, FOOT = 74;
  const room = Math.floor((H - y - FOOT) / ROW);
  const shown = open.slice(0, room);
  let lastWho = "\u0000";

  for (const t of shown) {
    const who = (t.who || "").trim() || "unassigned";
    const first = who !== lastWho;
    if (first && lastWho !== "\u0000") {
      x.strokeStyle = C.line; x.lineWidth = 1.4;
      x.beginPath(); x.moveTo(PAD, y + .5); x.lineTo(W - PAD, y + .5); x.stroke();
    } else if (!first) {
      x.strokeStyle = C.rule; x.lineWidth = 1;
      x.beginPath(); x.moveTo(PAD, y + .5); x.lineTo(W - PAD, y + .5); x.stroke();
    }
    lastWho = who;

    /* A NAME IS PRINTED ONCE PER RUN, so the page shows blocks of work per
       person rather than the same word forty times down a column. */
    if (first) {
      x.fillStyle = C.ink; x.font = F(17, "700");
      x.fillText(cut(x, who, 160), COL.who, y + 25);
    }
    x.fillStyle = C.sub; x.font = F(16);
    x.fillText(cut(x, t.t, COL.cat - COL.task - 18), COL.task, y + 25);

    const k = catColour(t.cat);
    const ct = (t.cat || "General").slice(0, 11);
    x.font = F(12, "700");
    const cw = x.measureText(ct).width + 18;
    x.fillStyle = k.bg; roundRect(x, COL.cat, y + 9, cw, 21, 4); x.fill();
    x.strokeStyle = k.edge; x.lineWidth = 1; x.stroke();
    x.fillStyle = k.ink; x.fillText(ct, COL.cat + 9, y + 24);

    const over = t.due ? days(t.due, on) : null;
    const od = over != null && over > 0;
    x.fillStyle = od ? C.red : C.sub; x.font = F(16, od ? "700" : "400");
    const dt = dmy(t.due);
    x.fillText(dt, COL.due - x.measureText(dt).width + 60, y + 25);
    const at = over == null ? "—" : over > 0 ? `${over}d` : over === 0 ? "today" : `in ${-over}d`;
    x.fillStyle = od ? C.red : C.faint; x.font = F(15, od ? "700" : "400");
    x.fillText(at, COL.age - x.measureText(at).width, y + 25);

    y += ROW;
  }

  if (!open.length) {
    x.fillStyle = C.green; x.font = F(24, "700");
    x.fillText("Nothing open on this job.", PAD, y + 50);
  }

  // ---- foot ----
  const hidden = open.length - shown.length;
  if (hidden > 0) {
    x.fillStyle = C.amber; x.font = F(15, "700");
    x.fillText(`+ ${hidden} more open on this job — open Genie for the rest`, PAD, H - 52);
  }
  x.fillStyle = C.faint; x.font = F(14);
  x.fillText(`Nandan GSE · pending tasks as at ${dmy(on)}`, PAD, H - 26);
  const jf = `JOB ${jobNo(j.id)}`;
  x.fillText(jf, W - PAD - x.measureText(jf).width, H - 26);

  return cv.toDataURL("image/jpeg", 0.92);
}
