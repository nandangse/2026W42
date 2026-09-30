import QRCode from "qrcode";
import { monthColour } from "./month-colour";
import { LOGO } from "./logo";
import { esc } from "@/lib/fmt";

/**
 * THE JOB DISPLAY BOARD — A5 landscape, printed and fixed to the machine.
 *
 * Dr Raghu, 28 Sep 2026: "have a checkbox ... generate the Job Display Board
 * ... an A5 Landscape PDF ... they will print two copies, one fixed on the
 * job and one for the file."
 *
 * THE BOXES ARE FOR A PEN, NOT FOR US (his correction): "the boxes will have
 * dates written by the guys which he will then remove when the job is being
 * delivered." So nothing is pre-ticked and nothing is pre-shaded — every box
 * is left empty and made big enough to write 12/10 into by hand. A board that
 * arrived with our answers already in it would be a board the floor writes
 * around rather than on.
 *
 * NO CUSTOMER NAME (his rule): outsiders walk past these. The tag says which
 * machine it is to anybody who needs to know and nothing to anybody who does
 * not.
 *
 * INITIALS ONLY for the four owners — they are for the people who work here.
 *
 * THE QR IS THE ANSWER TO THE ONLY REAL PROBLEM WITH PAPER: it is out of date
 * the moment it leaves the printer. The paper is for the wall; the code is
 * for whoever needs the truth. The footer stamps when it was printed, so a
 * board nobody has replaced can be caught being three weeks old.
 */

export interface BoardJob {
  id: string;
  tag: string;
  fam: string;
  tdd: string | null;
  otd: string | null;
  pm: string | null; pmName?: string | null;
  kitting: string | null; kittingName?: string | null;
  production: string | null; productionName?: string | null;
  design: string | null; designName?: string | null;
  escalation: string | null;
  /** Built on a vehicle — the row only prints when this is true. */
  isVehicle?: boolean;
  chassisNo?: string | null;
  engineNo?: string | null;
  vehicleModel?: string | null;
  /**
   * Where the QR points. Left alone it is built from the job number, so the
   * paper and the page cannot drift apart — a board carrying a link to a
   * page that does not exist is the one failure nobody would notice.
   */
  url?: string;
}

const dmy = (s: string | null | undefined) =>
  s ? `${s.slice(8, 10)}-${s.slice(5, 7)}-${s.slice(0, 4)}` : "—";

const daysBetween = (a: string, b: string) =>
  Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);

/**
 * THE JOB NUMBER TAKES THE PRODUCT'S COLOUR (Dr Raghu, 30 Sep 2026).
 *
 * AGSE dark blue, DEF maroon, everything else dark green. The number is the
 * one thing on this sheet read from across the floor, so it may as well say
 * two things at that distance: which job, and what kind of machine.
 *
 * Matched on the prefix the family already carries — "AGSE - Hi Lift",
 * "DEF - Specialized Vehicles", "MHE - Multi Scissor Lift" — because that
 * prefix is how the families are named, not a list somebody has to keep.
 */
export function familyColour(fam: string | null | undefined): string {
  const f = String(fam || "").trim().toUpperCase();
  if (f.startsWith("AGSE") || f.startsWith("AAE")) return "#12386B";   // dark blue
  if (f.startsWith("DEF")) return "#6E1220";                            // maroon
  return "#14532D";                                                     // dark green
}

/** genie.nandan.co.in/job/2162 — the number painted on the machine. */
export const boardUrl = (no: string) =>
  `https://genie.nandan.co.in/job/${String(no).replace(/\D/g, "").slice(-4)}`;

const PCT = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
const QC = ["INCOMING", "IN PROCESS", "PRE PAINT", "PAINT", "FINAL"];
const DELIVERY = ["FILE PREP", "JOB START", "ESCALATION", "NCs", "DELIVERY"];

/**
 * A QR CODE THAT ACTUALLY SCANS.
 *
 * I wrote one from scratch first, on the reasoning that a board printed at
 * the plant must not depend on somebody else's server. It drew something
 * that looked exactly like a QR code and <b>no scanner could read it</b> —
 * verified by decoding the printed page, which is the only test that counts.
 *
 * A QR that looks right and does not scan is worse than no QR: nobody checks
 * a square that has always been there, so the board would have carried a dead
 * link for months. So it is the `qrcode` package, and the codes are rendered
 * into the page as inline SVG — no network at print time either way.
 */
async function qrSvg(text: string, size: number): Promise<string> {
  return QRCode.toString(text, {
    type: "svg", errorCorrectionLevel: "M", margin: 2, width: size,
    color: { dark: "#000000", light: "#ffffff" },
  });
}

/**
 * THE SAME MARKUP SERVES THE PAPER AND THE SCREEN.
 *
 * Dr Raghu, 28 Sep 2026: "the QR should point to a page called
 * genie.nandan.co.in/job/<XXXX> ... that page can look like this pdf first."
 *
 * So the board is built once and wrapped twice: as a printable document, and
 * as a fragment the signed-in page drops in. If they were two pieces of
 * markup, the wall and the screen would start to disagree the first time
 * either was changed — and the whole point of the code on the paper is that
 * the screen is the same board, only true.
 */
export async function jobBoardBody(jobs: BoardJob[], on: string, by: string, version: string): Promise<{ css: string; html: string }> {
  const doc = await jobBoardHtml(jobs, on, by, version);
  const css = doc.slice(doc.indexOf("<style>") + 7, doc.indexOf("</style>"));
  const html = doc.slice(doc.indexOf("<body>") + 6, doc.indexOf("</body>"));
  return { css, html };
}

export async function jobBoardHtml(jobs: BoardJob[], on: string, by: string, version: string): Promise<string> {
  const page = async (j: BoardJob) => {
    /* INITIALS AND THE FIRST NAME (Dr Raghu, 30 Sep 2026: "it has space to
       show the first name of the guy. PS: PANKAJ"). Initials are for the
       people who know them; the first name is for the new man on the floor
       who has to go and find him. */
    const owner = (label: string, v: string | null, name?: string | null) => {
      const first = String(name || "").trim().split(/\s+/)[0] || "";
      return `<div class="ow"><span class="owl">${esc(label)}</span>
        <b>${esc(v || "—")}${first && first.toUpperCase() !== String(v || "").toUpperCase()
          ? `<i class="ofn">${esc(first)}</i>` : ""}</b></div>`;
    };
    const boxes = (vals: (string | number)[], wide = false) =>
      vals.map((v) => `<div class="bx${wide ? " w" : ""}"><span>${esc(String(v))}${typeof v === "number" ? "%" : ""}</span></div>`).join("");

    return `<section class="pg">
  <div class="main">
    <div class="hd">
      <img class="logo" src="${LOGO}" alt="Nandan GSE">
      <div class="ttl">NANDAN GSE BREAKTHROUGH 2027</div>
    </div>

    <div class="idrow">
      <div class="jno" style="color:${familyColour(j.fam)}">${esc(j.id)}</div>
      <div class="tagwrap">
        <div class="tag">${esc(j.tag)}</div>
        <div class="fam">${esc(j.fam || "")}</div>
      </div>
    </div>

    <div class="owners">
      ${owner("PROJECT MANAGER", j.pm, j.pmName)}${owner("KITTING", j.kitting, j.kittingName)}${owner("PRODUCTION", j.production, j.productionName)}${owner("DESIGN", j.design, j.designName)}
    </div>

    <div class="grid">
      <div class="gl">KITTING</div><div class="gb">${boxes(PCT)}</div>
      <div class="gl">PRODUCTION</div><div class="gb">${boxes(PCT)}</div>
      <div class="gl">QC</div><div class="gb">${boxes(QC, true)}</div>
      <div class="gl">DELIVERY</div><div class="gb">${boxes(DELIVERY, true)}</div>
    </div>

    ${j.isVehicle ? `<div class="veh">
      <div class="vb"><span>VEHICLE</span><i>${esc(j.vehicleModel || "")}</i></div>
      <div class="vb"><span>CHASSIS NO</span><i>${esc(j.chassisNo || "")}</i></div>
      <div class="vb"><span>ENGINE NO</span><i>${esc(j.engineNo || "")}</i></div>
    </div>` : ""}
    ${j.escalation ? `<div class="esc">&#9888; ${esc(j.escalation.slice(0, 150))}</div>` : ""}
    <div class="notes"><span>NOTES</span><i></i></div>
  </div>

  <aside class="side">
    <!-- THE MONTH HAS A COLOUR (Dr Raghu, 30 Sep 2026). A wall of October
         boards should look like October from across the floor, before
         anybody is close enough to read a date. -->
    <div class="dbox" style="background:${monthColour(j.tdd)}">
      <div class="dl">TARGET DELIVERY</div>
      <div class="dv">${dmy(j.tdd)}</div>
    </div>
    <div class="qr">${await qrSvg(j.url || boardUrl(j.id), 118)}</div>
    <div class="qrl">SCAN FOR<br>LIVE STATUS</div>
  </aside>

  <div class="ft">Nandan GSE &middot; printed ${dmy(on)} by ${esc(by)} &middot; Genie ${esc(version)} &middot; write the date in the box; strike it out on delivery</div>
</section>`;
  };

  return `<!doctype html><html><head><meta charset="utf-8"><title>Job Display Board</title>
<style>
  @page { size: A5 landscape; margin: 0; }
  * { box-sizing: border-box; }
  body { margin:0; font-family: Arial, Helvetica, sans-serif; color:#16232F; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .pg { width:210mm; height:148mm; padding:5mm; page-break-after: always;
        display:grid; grid-template-columns: 1fr 42mm; grid-template-rows: 1fr auto; gap:3mm; position:relative; }
  .pg:last-child { page-break-after: auto; }
  .main { display:flex; flex-direction:column; min-width:0; }

  .hd { display:flex; align-items:center; gap:4mm; border-bottom:1.2mm solid #16232F; padding-bottom:1.5mm; }
  .logo { height:9mm; display:block; }
  .ttl { margin-left:auto; font-size:9pt; letter-spacing:.18em; color:#6B7280; font-weight:bold; }

  .idrow { display:flex; align-items:flex-start; gap:5mm; margin-top:1mm; }
  /* FOUR TIMES BIGGER (Dr Raghu, 28 Sep 2026: "this is what's seen from
     far"). It is the one thing on the sheet that has to be legible across a
     shop floor, so it gets the space and everything else arranges around it. */
  .jno { font-size:150pt; font-weight:bold; line-height:.82; letter-spacing:-.04em; }
  .tagwrap { min-width:0; }
  .tagwrap { padding-top:3mm; }
  .tag { font-size:16pt; font-weight:bold; line-height:1.15; }
  .fam { font-size:9.5pt; color:#6B7280; margin-top:.8mm; }

  .owners { display:grid; grid-template-columns: repeat(4,1fr); gap:1.5mm; margin-top:1.5mm; }
  .ow { border:.3mm solid #C9C6BD; border-radius:1mm; padding:1mm 1.5mm; text-align:center; }
  .owl { display:block; font-size:6.5pt; letter-spacing:.1em; color:#8B8F87; }
  .ow b { font-size:13pt; }
  .ofn { font-style:normal; font-weight:normal; font-size:7.5pt; color:#46545F; margin-left:1.2mm; }
  .owl { text-transform:uppercase; }

  .grid { display:grid; grid-template-columns: 24mm 1fr; gap:1.2mm 2mm; margin-top:2mm; align-items:center; }
  .gl { font-size:8.5pt; font-weight:bold; letter-spacing:.06em; }
  .gb { display:flex; gap:1mm; }
  /* Big enough to write 12/10 into with a marker — the whole point. */
  /* FULL WIDTH, and the faint label CENTRED so a marker writes straight over
     it (his note). A label in the corner makes the pen avoid the corner; a
     label in the middle is simply under the ink. */
  .bx { flex:1 1 0; min-width:0; height:9mm; border:.3mm solid #16232F; border-radius:.8mm;
        display:flex; align-items:center; justify-content:center; }
  .bx span { font-size:7pt; color:#C9C6BD; }
  .bx.w span { font-size:5.5pt; letter-spacing:.02em; text-align:center; line-height:1.1; }

  /* THE VEHICLE ROW. Written in by hand like every other box on this sheet
     when Genie does not hold the number yet -- a chassis number is read off
     the plate on the machine, which is exactly where this board is hanging. */
  /* THE VEHICLE, IN THE SIDE COLUMN (Dr Raghu, 30 Sep 2026) — the space
     between the date and the code was empty on every vehicle-mounted job.
     A tick each, and each on ONE line, sized to the column rather than to
     the text: a chassis number is seventeen characters and it has 38mm. */
  /* KEPT IN THE MAIN COLUMN (Dr Raghu, 30 Sep 2026: "this is also ok. use
     the engine no and chassis no here itself"). Three boxes across, the
     value printed where the ERP has it and the box left empty for a marker
     where it does not — a chassis number is read off the plate on the
     machine, which is where this sheet is hanging. */
  .veh { display:grid; grid-template-columns:0.85fr 1.25fr 1.05fr; gap:2mm; margin-top:2mm; }
  .vb { border:.3mm solid #16232F; border-radius:.8mm; padding:1mm 2mm; min-height:8.5mm; }
  .vb span { display:block; font-size:5.8pt; letter-spacing:.1em; color:#8B8F87; }
  .vb i { font-style:normal; font-size:10pt; font-weight:bold; letter-spacing:-.01em;
          display:block; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .esc { margin-top:2mm; font-size:8pt; color:#B3392E; font-weight:bold; line-height:1.25; }
  .notes { margin-top:auto; display:flex; align-items:flex-end; gap:2mm; }
  .notes span { font-size:6.5pt; letter-spacing:.1em; color:#8B8F87; }
  .notes i { flex:1; border-bottom:.3mm dotted #8B8F87; height:5mm; }

  .side { display:flex; flex-direction:column; gap:2mm; }
  .dbox { background:#16232F; color:#fff; border-radius:1.5mm; padding:2mm; text-align:center; }
  .dl { font-size:6.5pt; letter-spacing:.12em; color:rgba(255,255,255,.72); }
  .dv { font-size:15pt; font-weight:bold; letter-spacing:-.01em; }
  .obox { border:.4mm solid #C9C6BD; border-radius:1.5mm; padding:1.5mm; text-align:center; }
  .ol { font-size:6.5pt; letter-spacing:.12em; color:#8B8F87; }
  .ov { font-size:11pt; font-weight:bold; }
  .olate { font-size:7pt; color:#B3392E; font-weight:bold; }
  .qr { margin-top:auto; text-align:center; }
  .qr svg { width:34mm; height:34mm; }
  .qrl { font-size:6.5pt; letter-spacing:.1em; color:#8B8F87; text-align:center; line-height:1.3; }

  .ft { grid-column:1 / -1; font-size:6.5pt; color:#8B8F87; border-top:.3mm solid #DCD8CC; padding-top:1mm; }
</style></head><body>
${(await Promise.all(jobs.map(page))).join("")}
</body></html>`;
}
