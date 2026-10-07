/* GENIE WHATSAPP HELPER — runs on web.whatsapp.com.
   Genie opens  https://web.whatsapp.com/send?phone=91…&text=…#genie=<token>&api=<origin>&auto=0|1&close=0|1
   This script: waits for the chat, fetches that person's slip PDF from Genie, attaches it, puts the
   message in the caption, then either waits for Vinay to press Send (auto=0) or presses it after a
   short random pause (auto=1), tells Genie it went, and closes the tab if asked. */
(function () {
  const h = new URLSearchParams(location.hash.replace(/^#/, ""));
  const token = h.get("genie"); if (!token) return;
  const api = h.get("api") || "https://genie.nandan.co.in";
  const auto = h.get("auto") === "1", closeAfter = h.get("close") === "1";
  const text = new URLSearchParams(location.search).get("text") || "";
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const rnd = (a, b) => a + Math.random() * (b - a);
  const $ = (sel) => document.querySelector(sel);
  const any = (sels) => { for (const s of sels) { const e = $(s); if (e) return e; } return null; };
  const until = async (fn, ms = 60000, step = 400) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = fn(); if (v) return v; await sleep(step); } return null; };
  const report = (action, extra) => new Promise((r) => chrome.runtime.sendMessage({ type: "genie:report", url: api + "/api/hrms/wa-slips", body: Object.assign({ action, token, auto, text }, extra || {}) }, () => r()));
  const banner = (msg, color) => {
    let b = document.getElementById("genie-banner");
    if (!b) { b = document.createElement("div"); b.id = "genie-banner"; b.style.cssText = "position:fixed;top:0;left:0;right:0;z-index:99999;padding:8px 14px;font:600 13px system-ui,sans-serif;color:#fff;text-align:center"; document.body.appendChild(b); }
    b.style.background = color || "#16232F"; b.textContent = "Genie · " + msg;
  };
  (async () => {
    try {
      banner("opening the chat…");
      // the "Continue to chat" interstitial, when WhatsApp shows one
      const cont = await until(() => [...document.querySelectorAll("a,button,div[role=button]")].find((e) => /continue to chat|use whatsapp web/i.test(e.textContent || "")) || any(['div[contenteditable="true"][data-tab]', 'footer div[contenteditable="true"]']), 30000);
      if (cont && !(cont.getAttribute && cont.getAttribute("contenteditable"))) cont.click();
      const composer = await until(() => any(['footer div[contenteditable="true"]', 'div[contenteditable="true"][data-tab]']), 60000);
      if (!composer) throw new Error("the chat did not open — is WhatsApp Web signed in?");
      await report("opened");
      banner("fetching the payslip from Genie…");
      const slip = await new Promise((r) => chrome.runtime.sendMessage({ type: "genie:fetch-slip", url: api + "/api/hrms/wa-slips?slip=" + encodeURIComponent(token) }, r));
      if (!slip || !slip.ok) throw new Error("could not fetch the slip: " + (slip && slip.error));
      const file = new File([new Uint8Array(slip.bytes)], slip.name, { type: "application/pdf" });
      // the attach (+ / clip) button, then the document file input
      const attach = await until(() => any(['[aria-label="Attach"]', '[title="Attach"]', 'span[data-icon="plus"]', 'span[data-icon="clip"]', 'span[data-icon="attach-menu-plus"]', 'button[aria-label="Attach"]']), 15000);
      if (!attach) throw new Error("could not find the attach button");
      (attach.closest("button,div[role=button]") || attach).click();
      const input = await until(() => { const ins = [...document.querySelectorAll('input[type="file"]')]; return ins.find((i) => /\*|pdf|application/i.test(i.getAttribute("accept") || "*")) || ins.find((i) => !/^image|^video/i.test(i.getAttribute("accept") || "")) || null; }, 8000);
      if (!input) throw new Error("could not find the document input");
      const dt = new DataTransfer(); dt.items.add(file);
      input.files = dt.files; input.dispatchEvent(new Event("change", { bubbles: true }));
      banner("payslip attached — adding the message…");
      // the preview's caption box carries the message; the composer text goes along if there is none
      const caption = await until(() => any(['div[contenteditable="true"][aria-label*="caption" i]', 'div[contenteditable="true"][data-lexical-editor="true"]:not([data-tab="10"])', 'div[contenteditable="true"][aria-placeholder*="caption" i]']), 10000);
      if (caption && text) {
        caption.focus();
        document.execCommand("selectAll", false, null);
        document.execCommand("insertText", false, text);
      }
      const sendBtn = await until(() => any(['[aria-label="Send"]', 'span[data-icon="send"]', 'div[role="button"][aria-label="Send"]']), 15000);
      if (!sendBtn) throw new Error("could not find the Send button");
      const btn = sendBtn.closest("button,div[role=button]") || sendBtn;
      if (auto) {
        const wait = rnd(1500, 4500);
        banner("sending in " + Math.round(wait / 1000) + "s… (auto)", "#8A5B00");
        await sleep(wait);
        btn.click();
      } else {
        banner("ready — press Send in WhatsApp", "#2A6B39");
        // wait for the preview to go away = Vinay pressed Send
        await until(() => !any(['[aria-label="Send"]', 'span[data-icon="send"]']) || !document.contains(btn), 15 * 60 * 1000, 600);
      }
      await sleep(1500);
      await report("sent");
      banner("sent · recorded in Genie", "#2A6B39");
      if (closeAfter) { await sleep(rnd(800, 2000)); window.close(); }
    } catch (e) {
      banner(String(e && e.message || e) + " — attach the slip by hand, then mark it sent in Genie", "#8E2C20");
    }
  })();
})();
