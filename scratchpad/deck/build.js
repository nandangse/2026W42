const pptxgen = require("pptxgenjs");
const D = require("./deck.json");

const P = { ink:"16232F", slate:"22303C", sub:"5A6672", mute:"8A94A0", faint:"B8B5AC",
            line:"E2E0DA", panel:"F4F2EC", accent:"E8600A", navy:"1B3A5C",
            green:"0D7A3F", amber:"D97706", red:"B3261E", gold:"F5B32B", pale:"FFFFFF" };
const HEAD="Cambria", BODY="Calibri";
const p = new pptxgen();
p.layout = "LAYOUT_WIDE";           // 13.3 x 7.5
const W = 13.3, H = 7.5;

const cr = (v) => "₹" + v.toFixed(2) + " Cr";
const dark = (s) => { s.background = { color: P.ink }; };

/** Every content slide: title top-left, a quiet as-of stamp top-right. */
function head(s, kicker, title, colour = P.accent) {
  s.addText(kicker.toUpperCase(), { x:0.6, y:0.34, w:8, h:0.28, fontFace:BODY, fontSize:11, bold:true, color:colour, charSpacing:2, margin:0 });
  s.addText(title, { x:0.6, y:0.62, w:9.6, h:0.6, fontFace:HEAD, fontSize:30, bold:true, color:P.ink, margin:0 });
  s.addText(`Genie · as at ${D.asOf}`, { x:W-4.3, y:0.36, w:3.7, h:0.3, fontFace:BODY, fontSize:10, color:P.faint, align:"right", margin:0 });
}
function stat(s, x, y, w, label, value, note, colour, big = 40) {
  s.addShape(p.ShapeType.roundRect, { x, y, w, h:1.5, rectRadius:0.06, fill:{ color:P.panel }, line:{ color:P.line, width:0.5 } });
  s.addText(label.toUpperCase(), { x:x+0.22, y:y+0.14, w:w-0.44, h:0.25, fontFace:BODY, fontSize:10, bold:true, color:P.mute, charSpacing:1, margin:0 });
  s.addText(value, { x:x+0.22, y:y+0.40, w:w-0.44, h:0.62, fontFace:HEAD, fontSize:big, bold:true, color:colour, margin:0 });
  s.addText(note, { x:x+0.22, y:y+1.04, w:w-0.44, h:0.34, fontFace:BODY, fontSize:10, color:P.sub, margin:0 });
}

/* ─────────── 1. THE POSITION ─────────── */
{
  const s = p.addSlide(); dark(s);
  s.addText("NANDAN GSE · " + D.fy, { x:0.8, y:1.15, w:9, h:0.35, fontFace:BODY, fontSize:13, bold:true, color:P.gold, charSpacing:3, margin:0 });
  s.addText("The year, as the book stands today", { x:0.8, y:1.6, w:11.4, h:1.0, fontFace:HEAD, fontSize:42, bold:true, color:"FFFFFF", margin:0 });
  s.addText(
    `Day ${D.day} of ${D.total}. Everything delivered so far, plus every job on the board, comes to just over half the year's target.`,
    { x:0.8, y:2.62, w:9.6, h:0.6, fontFace:BODY, fontSize:15, color:"9FB0C0", margin:0 });

  const cards = [
    { l:"Sales — anticipated", v:cr(D.anticipated.sales), t:`of ${cr(D.target.sales)} target`, pct:Math.round(D.anticipated.sales/D.target.sales*100), c:P.gold },
    { l:"Throughput — anticipated", v:cr(D.anticipated.tp), t:`of ${cr(D.target.tp)} target`, pct:Math.round(D.anticipated.tp/D.target.tp*100), c:"7BC67E" },
  ];
  cards.forEach((cd, i) => {
    const x = 0.8 + i*5.6;
    s.addShape(p.ShapeType.roundRect, { x, y:3.62, w:5.1, h:2.5, rectRadius:0.06, fill:{ color:"22303C" }, line:{ color:cd.c, width:1.25 } });
    s.addText(cd.l.toUpperCase(), { x:x+0.3, y:3.82, w:4.5, h:0.3, fontFace:BODY, fontSize:11, bold:true, color:"8FA1B3", charSpacing:1.5, margin:0 });
    s.addText(cd.v, { x:x+0.3, y:4.12, w:4.5, h:0.95, fontFace:HEAD, fontSize:50, bold:true, color:cd.c, margin:0 });
    s.addText(cd.t, { x:x+0.3, y:5.06, w:4.5, h:0.3, fontFace:BODY, fontSize:13, color:"8FA1B3", margin:0 });
    // the share of target, as a bar rather than a second number
    s.addShape(p.ShapeType.rect, { x:x+0.3, y:5.5, w:4.5, h:0.16, fill:{ color:"33414F" } });
    s.addShape(p.ShapeType.rect, { x:x+0.3, y:5.5, w:4.5*cd.pct/100, h:0.16, fill:{ color:cd.c } });
    s.addText(`${cd.pct}% of target`, { x:x+0.3, y:5.72, w:4.5, h:0.3, fontFace:BODY, fontSize:12, bold:true, color:cd.c, margin:0 });
  });
  s.addText("delivered since 1 April  +  every job still on the board", { x:0.8, y:6.42, w:11, h:0.3, fontFace:BODY, fontSize:11, italic:true, color:"6B7C8C", margin:0 });
  s.addNotes(`Anticipated = ${cr(D.delivered.sales)} delivered plus ${cr(D.book.sales)} still on the board. This assumes every pending job ships on the date it carries today. It is an expectation, not a forecast.`);
}

/* ─────────── 2. WHAT HAS GONE OUT ─────────── */
{
  const s = p.addSlide();
  head(s, "Since 1 April", "What has actually gone out of the door");
  stat(s, 0.6, 1.55, 3.7, "Delivered", cr(D.delivered.sales), `${D.delivered.n} jobs · ${cr(D.delivered.tp)} throughput`, P.accent, 34);
  stat(s, 4.55, 1.55, 3.7, "Pace says by today", cr(D.paceBy), `${D.day} of ${D.total} days elapsed`, P.sub, 34);
  stat(s, 8.5, 1.55, 4.2, "Behind by", cr(D.behind), `running at ${D.pacePct}% of the pace needed`, P.red, 34);

  s.addShape(p.ShapeType.roundRect, { x:0.6, y:3.35, w:12.1, h:1.5, rectRadius:0.06, fill:{ color:P.ink } });
  s.addText("REQUIRED RUN RATE FOR THE REST OF THE YEAR", { x:0.95, y:3.55, w:11.4, h:0.3, fontFace:BODY, fontSize:11, bold:true, color:"8FA1B3", charSpacing:1.5, margin:0 });
  s.addText(
    [ { text:cr(D.required.sales)+" ", options:{ fontFace:HEAD, fontSize:30, bold:true, color:P.gold } },
      { text:"per month in sales, with a throughput of ", options:{ fontFace:BODY, fontSize:15, color:"9FB0C0" } },
      { text:cr(D.required.tp)+" ", options:{ fontFace:HEAD, fontSize:30, bold:true, color:"7BC67E" } },
      { text:"per month", options:{ fontFace:BODY, fontSize:15, color:"9FB0C0" } } ],
    { x:0.95, y:3.9, w:11.4, h:0.75, margin:0 });
  s.addText(`across the ${D.left} days that remain`, { x:0.95, y:4.5, w:11.4, h:0.3, fontFace:BODY, fontSize:11, italic:true, color:"6B7C8C", margin:0 });

  s.addText("The company has billed a little under half of what the calendar says it should have by now. Closing that gap needs almost three times the current monthly rate.",
    { x:0.6, y:5.15, w:12.1, h:0.7, fontFace:BODY, fontSize:14, color:P.sub, margin:0 });
  s.addNotes("Behind is measured against a straight-line pace: target x days elapsed / days in the year. It claims nothing about seasonality.");
}

/* ─────────── 3. THE ORDER BOOK ─────────── */
{
  const s = p.addSlide();
  head(s, "The order book", "Everything on the board runs out in November", P.red);
  s.addChart(p.ChartType.bar,
    [ { name:"Sales value ₹ Cr", labels:D.months.map(m=>MON(m.k)), values:D.months.map(m=>m.v) },
      { name:"Throughput ₹ Cr", labels:D.months.map(m=>MON(m.k)), values:D.months.map(m=>m.t) } ],
    { x:0.6, y:1.5, w:7.6, h:4.3, barDir:"col", barGrouping:"clustered",
      chartColors:[P.accent, P.green], showTitle:false, showLegend:true, legendPos:"t", legendFontSize:11, legendColor:P.sub,
      showValue:true, dataLabelPosition:"outEnd", dataLabelFontSize:10, dataLabelColor:P.slate, dataLabelFormatCode:"0.00",
      catAxisLabelColor:P.sub, catAxisLabelFontSize:12, valAxisLabelColor:P.faint, valAxisLabelFontSize:10,
      valGridLine:{ color:P.line, size:0.5 }, catGridLine:{ style:"none" }, valAxisMaxVal:14 });

  s.addShape(p.ShapeType.roundRect, { x:8.5, y:1.5, w:4.2, h:2.05, rectRadius:0.06, fill:{ color:P.panel }, line:{ color:P.line, width:0.5 } });
  s.addText("ON THE BOARD", { x:8.75, y:1.68, w:3.7, h:0.28, fontFace:BODY, fontSize:10, bold:true, color:P.mute, charSpacing:1, margin:0 });
  s.addText(`${D.book.n} jobs`, { x:8.75, y:1.96, w:3.7, h:0.5, fontFace:HEAD, fontSize:28, bold:true, color:P.navy, margin:0 });
  s.addText(`${cr(D.book.sales)} · ${cr(D.book.tp)} throughput`, { x:8.75, y:2.5, w:3.7, h:0.55, fontFace:BODY, fontSize:12, color:P.sub, margin:0 });
  s.addText("all of it dated Aug–Nov", { x:8.75, y:3.0, w:3.7, h:0.3, fontFace:BODY, fontSize:11, italic:true, color:P.faint, margin:0 });

  s.addShape(p.ShapeType.roundRect, { x:8.5, y:3.75, w:4.2, h:2.05, rectRadius:0.06, fill:{ color:"FBEDEA" }, line:{ color:P.red, width:1 } });
  s.addText("DEC ONWARDS", { x:8.75, y:3.93, w:3.7, h:0.28, fontFace:BODY, fontSize:10, bold:true, color:P.red, charSpacing:1, margin:0 });
  s.addText("Nothing", { x:8.75, y:4.2, w:3.7, h:0.55, fontFace:HEAD, fontSize:30, bold:true, color:P.red, margin:0 });
  s.addText("Not one job on the book carries a delivery date after November.",
    { x:8.75, y:4.8, w:3.7, h:0.85, fontFace:BODY, fontSize:12, color:"8A3D2E", margin:0 });

  s.addText("This is not a delivery problem. Even built perfectly and on time, the current book cannot reach the target — the shortfall is orders, not output.",
    { x:0.6, y:6.05, w:12.1, h:0.7, fontFace:BODY, fontSize:14, bold:true, color:P.ink, margin:0 });
  s.addNotes("41 jobs in August and 41 in September, then it thins fast: 18 in October, 5 in November, nothing after.");
}
function MON(k){ const [y,m]=k.split("-"); return ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][+m-1]+" "+y.slice(2); }

/* ─────────── 4. WHAT WE BUILD ─────────── */
{
  const s = p.addSlide();
  head(s, "The book by product", "What the 105 jobs actually are", P.navy);
  s.addChart(p.ChartType.bar,
    [ { name:"Throughput ₹ Cr", labels:D.fams.map(f=>f.f.length>26?f.f.slice(0,25)+"…":f.f), values:D.fams.map(f=>f.t) } ],
    { x:0.6, y:1.5, w:7.9, h:4.9, barDir:"bar", chartColors:[P.navy], showTitle:false, showLegend:false,
      showValue:true, dataLabelPosition:"outEnd", dataLabelFontSize:10, dataLabelColor:P.slate, dataLabelFormatCode:"0.00",
      catAxisLabelColor:P.slate, catAxisLabelFontSize:11, valAxisLabelColor:P.faint, valAxisLabelFontSize:10,
      valGridLine:{ color:P.line, size:0.5 }, catGridLine:{ style:"none" } });

  s.addText("BY THROUGHPUT", { x:8.8, y:1.5, w:3.9, h:0.3, fontFace:BODY, fontSize:10, bold:true, color:P.mute, charSpacing:1, margin:0 });
  const rows = [[ { text:"Family", options:{ bold:true } }, { text:"Jobs", options:{ bold:true, align:"right" } }, { text:"₹ Cr", options:{ bold:true, align:"right" } } ]]
    .concat(D.fams.slice(0,7).map(f => [
      { text:f.f.length>20?f.f.slice(0,19)+"…":f.f }, { text:String(f.n), options:{ align:"right" } }, { text:f.t.toFixed(2), options:{ align:"right" } } ]));
  s.addTable(rows, { x:8.8, y:1.85, w:3.9, colW:[2.2,0.7,1.0], fontFace:BODY, fontSize:11, color:P.slate,
    border:{ type:"solid", color:P.line, pt:0.5 }, fill:{ color:"FFFFFF" }, rowH:0.32, valign:"middle" });
  s.addText("Six families carry the throughput; the rest are ones and twos.",
    { x:8.8, y:4.7, w:3.9, h:0.6, fontFace:BODY, fontSize:12, italic:true, color:P.sub, margin:0 });
  s.addNotes("Ordered by throughput rather than order value — throughput is what the company actually earns on a job.");
}

/* ─────────── 5. WHERE THE MONEY SITS ─────────── */
{
  const s = p.addSlide();
  head(s, "Kitting against production", "Where the money is sitting on the floor", P.amber);
  const box = (x, tone, edge, kicker, big, sub, lines) => {
    s.addShape(p.ShapeType.roundRect, { x, y:1.5, w:5.9, h:3.3, rectRadius:0.06, fill:{ color:tone }, line:{ color:edge, width:1.25 } });
    s.addText(kicker.toUpperCase(), { x:x+0.32, y:1.72, w:5.3, h:0.3, fontFace:BODY, fontSize:11, bold:true, color:edge, charSpacing:1.5, margin:0 });
    s.addText(big, { x:x+0.32, y:2.02, w:5.3, h:0.85, fontFace:HEAD, fontSize:40, bold:true, color:edge, margin:0 });
    s.addText(sub, { x:x+0.32, y:2.88, w:5.3, h:0.35, fontFace:BODY, fontSize:14, bold:true, color:P.slate, margin:0 });
    s.addText(lines, { x:x+0.32, y:3.3, w:5.3, h:1.3, fontFace:BODY, fontSize:12.5, color:P.sub, margin:0 });
  };
  box(0.6, "E6F4EA", P.green, `Ready to finish — ${D.ready.n} jobs`, cr(D.ready.tp),
      "60%+ kitted and 60%+ built",
      "Bought, made, nearly out. This is the throughput closest to being earned — and the smaller of the two piles.");
  box(6.8, "FFF7E6", P.amber, `Kitted, not moving — ${D.stuck.n} jobs`, cr(D.stuck.tp),
      "60%+ kitted, under 40% built",
      "The material is bought and sitting on the floor. Nothing is being earned against it, and it is worth three times the ready pile.");

  s.addShape(p.ShapeType.roundRect, { x:0.6, y:5.05, w:12.1, h:1.55, rectRadius:0.06, fill:{ color:P.panel }, line:{ color:P.line, width:0.5 } });
  s.addText("THE BIGGEST STALLED JOBS", { x:0.9, y:5.22, w:11.5, h:0.28, fontFace:BODY, fontSize:10, bold:true, color:P.mute, charSpacing:1, margin:0 });
  s.addText(D.stuck.jobs.slice(0,5).map(j => `${j.id}  ${j.tag}  ·  kit ${j.kit}% / built ${j.pct}%  ·  ${j.tp.toFixed(2)} Cr`).join("\n"),
    { x:0.9, y:5.5, w:11.5, h:1.0, fontFace:BODY, fontSize:11.5, color:P.slate, lineSpacingMultiple:1.15, margin:0 });
  s.addNotes(`${D.stuck.n} jobs hold ${cr(D.stuck.tp)} of throughput with the material already bought and barely any of the work done.`);
}

/* ─────────── 6. READY TO FINISH + TASKS ─────────── */
{
  const s = p.addSlide();
  head(s, "The near side of the line", `The ${D.ready.n} jobs closest to going out`, P.green);
  const rows = [[ { text:"Job" }, { text:"What it is" }, { text:"Kit" }, { text:"Built" }, { text:"₹ Cr" }, { text:"Due" }, { text:"Open tasks" } ]
      .map(c => ({ ...c, options:{ bold:true, color:"FFFFFF", fill:{ color:P.ink }, align:c.text==="Job"||c.text==="What it is"?"left":"center" } }))]
    .concat(D.ready.jobs.map(j => [
      { text:j.id, options:{ bold:true, color:P.navy } },
      { text:j.tag },
      { text:j.kit+"%", options:{ align:"center" } },
      { text:j.pct+"%", options:{ align:"center" } },
      { text:j.tp.toFixed(2), options:{ align:"center", bold:true, color:P.green } },
      { text:j.tdd ? j.tdd.slice(8)+"-"+j.tdd.slice(5,7) : "—", options:{ align:"center" } },
      { text:j.tasks ? String(j.tasks) : "—", options:{ align:"center", bold:j.tasks>0, color:j.tasks>0?P.red:P.faint } },
    ]));
  s.addTable(rows, { x:0.6, y:1.5, w:12.1, colW:[0.8,4.6,0.85,0.9,0.95,1.0,3.0], fontFace:BODY, fontSize:11.5,
    color:P.slate, border:{ type:"solid", color:P.line, pt:0.5 }, fill:{ color:"FFFFFF" }, rowH:0.3, valign:"middle" });

  s.addText("WHAT IS STILL OPEN ON THEM", { x:0.6, y:4.55, w:12.1, h:0.3, fontFace:BODY, fontSize:11, bold:true, color:P.mute, charSpacing:1.5, margin:0 });
  s.addText(D.readyTasks.slice(0,7).map(t =>
      `${t.job}  ·  ${t.cat}  ·  ${t.who}  ·  due ${t.due ? t.due.slice(8)+"-"+t.due.slice(5,7) : "—"}${t.esc ? "  ·  ESCALATED " + t.esc : ""}  —  ${t.title}`).join("\n"),
    { x:0.6, y:4.85, w:12.1, h:1.75, fontFace:BODY, fontSize:11.5, color:P.slate, lineSpacingMultiple:1.2, margin:0 });
  s.addText(`Nine open tasks stand between these ${D.ready.n} jobs and the door — six of them on job 2114 alone.`,
    { x:0.6, y:6.62, w:12.1, h:0.4, fontFace:BODY, fontSize:13, bold:true, color:P.ink, margin:0 });
  s.addNotes("Clearing these nine tasks converts the ready pile into delivered revenue faster than starting anything new.");
}

/* ─────────── 7. ESCALATIONS ─────────── */
{
  const s = p.addSlide(); dark(s);
  s.addText("WHAT IS BEING ESCALATED", { x:0.8, y:0.7, w:9, h:0.35, fontFace:BODY, fontSize:12, bold:true, color:P.gold, charSpacing:2.5, margin:0 });
  s.addText("The same problem, on job after job", { x:0.8, y:1.05, w:11.4, h:0.7, fontFace:HEAD, fontSize:34, bold:true, color:"FFFFFF", margin:0 });

  const k = [
    { n:String(D.escJobs), l:"of 105 jobs carry\na project escalation", c:P.gold },
    { n:String(D.escTasks), l:"open tasks are\nescalated", c:"FF8A80" },
    { n:String(D.escLevels.L3||0), l:"of those sit at\nL3 — Management", c:"FF8A80" },
  ];
  k.forEach((x, i) => {
    const xx = 0.8 + i*3.95;
    s.addShape(p.ShapeType.roundRect, { x:xx, y:2.0, w:3.6, h:1.65, rectRadius:0.06, fill:{ color:"22303C" }, line:{ color:"33414F", width:0.75 } });
    s.addText(x.n, { x:xx+0.28, y:2.16, w:3.0, h:0.8, fontFace:HEAD, fontSize:44, bold:true, color:x.c, margin:0 });
    s.addText(x.l, { x:xx+0.28, y:2.95, w:3.1, h:0.6, fontFace:BODY, fontSize:12, color:"8FA1B3", margin:0 });
  });

  s.addText("THE OLDEST ESCALATED TASKS", { x:0.8, y:3.95, w:11.6, h:0.3, fontFace:BODY, fontSize:11, bold:true, color:"8FA1B3", charSpacing:1.5, margin:0 });
  s.addText(D.escTop.slice(0,6).map(t =>
      `${t.job}  ·  ${t.lvl}  ·  ${t.who}  ·  due ${t.due ? t.due.slice(8)+"-"+t.due.slice(5,7) : "—"}  —  ${t.title}`).join("\n"),
    { x:0.8, y:4.25, w:11.6, h:1.55, fontFace:BODY, fontSize:12.5, color:"CFDAE4", lineSpacingMultiple:1.2, margin:0 });

  s.addShape(p.ShapeType.roundRect, { x:0.8, y:5.95, w:11.6, h:1.0, rectRadius:0.06, fill:{ color:"3A2318" }, line:{ color:P.accent, width:1 } });
  s.addText("Read the escalation text and it is the same theme on job after job: drawings not signed off, design not released, components not frozen. The constraint is upstream of the shop floor.",
    { x:1.1, y:6.12, w:11.0, h:0.7, fontFace:BODY, fontSize:13.5, bold:true, color:"FFD9C2", margin:0 });
  s.addNotes("Recurring escalation text across jobs 2114, 2115, 2486-2490: braking system design release, revised manufacturing drawings sign-off, as-built GAD. Design throughput is the constraint, not fabrication.");
}

p.writeFile({ fileName: "Nandan-GSE-FY2026-27-Review.pptx" }).then(f => console.log("written:", f));
