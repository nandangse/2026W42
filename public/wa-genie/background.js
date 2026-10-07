// Fetches the slip from Genie for the content script (the page itself may not cross origins).
chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg && msg.type === "genie:fetch-slip") {
    fetch(msg.url).then(async (r) => {
      if (!r.ok) throw new Error("Genie answered " + r.status);
      const name = decodeURIComponent(r.headers.get("x-genie-slip-name") || "") || "Salary slip.pdf";
      const buf = await r.arrayBuffer();
      reply({ ok: true, name, bytes: Array.from(new Uint8Array(buf)) });
    }).catch((e) => reply({ ok: false, error: String(e && e.message || e) }));
    return true;
  }
  if (msg && msg.type === "genie:report") {
    fetch(msg.url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(msg.body) })
      .then((r) => reply({ ok: r.ok })).catch((e) => reply({ ok: false, error: String(e && e.message || e) }));
    return true;
  }
});
