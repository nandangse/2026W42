/**
 * PAGE NUMBERS ON A PRINTED TABLE (Dr Raghu, 15 Oct 2026: "in this put page
 * numbers also"). Chrome will not number pages from CSS, so the sheet
 * paginates itself in the window that prints it: the one long table is cut
 * into pages of rows that fit the paper, the head is repeated on each, and
 * every page ends with "Page n of N". A row is never split. If the script
 * cannot run, the table prints as one flow, as before.
 *
 * Usage: put the table in `<table id="sheet">`, the matter above it in
 * `<header id="top">`, and append `<script>${PAGINATE("landscape")}</script>`
 * before </body>. Margins are read from @page by the caller: pass the usable
 * height in mm.
 */
export const PAGINATE = (usableMm: number, footer = "Nandan GSE · Genie", usableWidthMm = 277) => `(function(){try{
  var MM = 96 / 25.4, ROOM = ${usableMm} * MM;
  /* measure at the paper's width, not the window's — a row that wraps on a narrow screen does not wrap on A4 */
  document.body.style.width = ${usableWidthMm} + "mm"; document.body.style.margin = "0";
  var table = document.getElementById("sheet"); var top = document.getElementById("top"); if (!table) return;
  var thead = table.querySelector("thead"), rows = Array.prototype.slice.call(table.querySelectorAll("tbody > tr"));
  if (!thead || !rows.length) return;
  var headH = thead.getBoundingClientRect().height, topH = top ? top.getBoundingClientRect().height + 8 : 0, footH = 9 * MM;
  var pages = [], cur = [], used = topH + headH + footH;
  rows.forEach(function (r) {
    var h = r.getBoundingClientRect().height;
    if (cur.length && used + h > ROOM) { pages.push(cur); cur = []; used = headH + footH; }
    cur.push(r); used += h;
  });
  if (cur.length) pages.push(cur);
  if (document.querySelector(".pgft")) return; /* already paginated */
  if (pages.length < 2) { var f1 = document.createElement("div"); f1.className = "pgft"; f1.innerHTML = "<span>${footer}</span><span>Page 1 of 1</span>"; table.parentNode.insertBefore(f1, table.nextSibling); return; }
  var holder = document.createElement("div"); table.parentNode.insertBefore(holder, table);
  pages.forEach(function (prs, i) {
    var sec = document.createElement("section"); sec.className = "pg";
    if (i === 0 && top) sec.appendChild(top);
    var t = table.cloneNode(false); t.removeAttribute("id"); t.appendChild(thead.cloneNode(true));
    var tb = document.createElement("tbody"); prs.forEach(function (r) { tb.appendChild(r); }); t.appendChild(tb); sec.appendChild(t);
    var f = document.createElement("div"); f.className = "pgft"; f.innerHTML = "<span>${footer}</span><span>Page " + (i + 1) + " of " + pages.length + "</span>"; sec.appendChild(f);
    holder.appendChild(sec);
  });
  table.parentNode.removeChild(table);
  var st = document.createElement("style"); st.textContent = ".pg{break-after:page;page-break-after:always} .pg:last-child{break-after:auto;page-break-after:auto} .pgft{display:flex;justify-content:space-between;font-size:7pt;color:#8B8F87;border-top:.2mm solid #D8D5CC;padding-top:1.5mm;margin-top:2mm} .pg table{width:100%}"; document.head.appendChild(st);
}catch(e){}})();`;
