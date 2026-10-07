/* GENIE WHATSAPP HELPER — runs on web.whatsapp.com.
   Genie opens  https://web.whatsapp.com/send?phone=91…  (nothing else in the URL) after handing this
   helper the job for that number (token, message, settings) through the Genie tab. This script waits
   for the chat, fetches the slip PDF from Genie, attaches it, writes the message as its caption, then
   either waits for Vinay to press Send (auto off) or presses it after a short random pause (auto on),
   tells Genie it went, and closes the tab if asked. The composer stays EMPTY until the slip is on —
   so the message cannot go out without the slip. */
(function () {
  const phone = (new URLSearchParams(location.search).get("phone") || "").replace(/\D/g, "");
  if (!phone) return;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const rnd = (a, b) => a + Math.random() * (b - a);
  const $ = (sel) => document.querySelector(sel);
  const any = (sels) => { for (const s of sels) { const e = $(s); if (e) return e; } return null; };
  const until = async (fn, ms = 60000, step = 400) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = fn(); if (v) return v; await sleep(step); } return null; };
  const banner = (msg, color) => {
    let b = document.getElementById("genie-banner");
    if (!b) { b = document.createElement("div"); b.id = "genie-banner"; b.style.cssText = "position:fixed;top:0;left:0;right:0;z-index:99999;padding:8px 14px;font:600 13px system-ui,sans-serif;color:#fff;text-align:center"; document.body.appendChild(b); }
    b.style.background = color || "#16232F"; b.textContent = "Genie · " + msg;
  };
  const getJob = () => new Promise((r) => chrome.storage.local.get("job:" + phone, (o) => r(o && o["job:" + phone])));
  (async () => {
    let job = null;
    for (let i = 0; i < 20 && !job; i++) { job = await getJob(); if (!job) await sleep(500); }
    if (!job) return;   // a chat Genie did not open — stay out of the way
    if (Date.now() - (job.at || 0) > 3 * 3600 * 1000) return;
    const { token, api, auto, close: closeAfter, text } = job;
    const report = (action, extra) => new Promise((r) => chrome.runtime.sendMessage({ type: "genie:report", url: api + "/api/hrms/wa-slips", body: Object.assign({ action, token, auto, text }, extra || {}) }, () => r()));
    try {
      banner("opening the chat…");
      const cont = await until(() => [...document.querySelectorAll("a,button,div[role=button]")].find((e) => /continue to chat|use whatsapp web/i.test(e.textContent || "")) || any(['footer div[contenteditable="true"]', 'div[contenteditable="true"][data-tab]']), 30000);
      if (cont && !(cont.getAttribute && cont.getAttribute("contenteditable"))) cont.click();
      const composer = await until(() => any(['footer div[contenteditable="true"]', 'div[contenteditable="true"][data-tab]']), 60000);
      if (!composer) throw new Error("the chat did not open — is WhatsApp Web signed in?");
      await report("opened");
      banner("fetching the payslip from Genie…");
      const slip = await new Promise((r) => chrome.runtime.sendMessage({ type: "genie:fetch-slip", url: api + "/api/hrms/wa-slips?slip=" + encodeURIComponent(token) }, r));
      if (!slip || !slip.ok) throw new Error("could not fetch the slip: " + (slip && slip.error));
      const file = new File([new Uint8Array(slip.bytes)], slip.name, { type: "application/pdf" });
      const attach = await until(() => any(['[aria-label="Attach"]', '[title="Attach"]', 'span[data-icon="plus"]', 'span[data-icon="clip"]', 'span[data-icon="attach-menu-plus"]', 'button[aria-label="Attach"]']), 15000);
      if (!attach) throw new Error("could not find the attach button");
      (attach.closest("button,div[role=button]") || attach).click();
      const input = await until(() => { const ins = [...document.querySelectorAll('input[type="file"]')]; return ins.find((i) => /\*|pdf|application/i.test(i.getAttribute("accept") || "*")) || ins.find((i) => !/^image|^video/i.test(i.getAttribute("accept") || "")) || null; }, 8000);
      if (!input) throw new Error("could not find the document input");
      const dt = new DataTransfer(); dt.items.add(file);
      input.files = dt.files; input.dispatchEvent(new Event("change", { bubbles: true }));
      banner("payslip attached — writing the message…");
      const caption = await until(() => any(['div[contenteditable="true"][aria-label*="caption" i]', 'div[contenteditable="true"][aria-placeholder*="caption" i]', 'div[contenteditable="true"][data-lexical-editor="true"]:not([data-tab="10"])']), 10000);
      const typeInto = (el, t) => { el.focus(); document.execCommand("selectAll", false, null); document.execCommand("insertText", false, t); };
      if (caption && text) typeInto(caption, text);
      const sendBtn = await until(() => any(['[aria-label="Send"]', 'span[data-icon="send"]', 'div[role="button"][aria-label="Send"]']), 15000);
      if (!sendBtn) throw new Error("could not find the Send button");
      const btn = sendBtn.closest("button,div[role=button]") || sendBtn;
      if (auto) {
        const wait = rnd(1500, 4500);
        banner("sending in " + Math.round(wait / 1000) + "s… (auto)", "#8A5B00");
        await sleep(wait); btn.click();
      } else {
        banner("payslip attached, message written — press Send in WhatsApp", "#2A6B39");
        await until(() => !document.contains(btn) || !any(['[aria-label="Send"]', 'span[data-icon="send"]']), 15 * 60 * 1000, 600);
      }
      // no caption box in this WhatsApp build → the message goes as its own line after the document
      if (!caption && text) {
        await sleep(1200);
        const comp2 = await until(() => any(['footer div[contenteditable="true"]', 'div[contenteditable="true"][data-tab]']), 10000);
        if (comp2) { typeInto(comp2, text); if (auto) { await sleep(rnd(800, 1600)); const b2 = any(['[aria-label="Send"]', 'span[data-icon="send"]']); if (b2) (b2.closest("button,div[role=button]") || b2).click(); } else { banner("slip sent — now press Send for the message", "#2A6B39"); await until(() => !any(['[aria-label="Send"]', 'span[data-icon="send"]']), 15 * 60 * 1000, 600); } }
      }
      await sleep(1200);
      await report("sent");
      chrome.storage.local.remove("job:" + phone);
      banner("sent · recorded in Genie", "#2A6B39");
      if (closeAfter) { await sleep(rnd(800, 2000)); window.close(); }
    } catch (e) {
      banner(String(e && e.message || e) + " — attach the slip by hand, then press Mark sent in Genie", "#8E2C20");
    }
  })();
})();
