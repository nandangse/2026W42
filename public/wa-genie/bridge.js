// On genie.nandan.co.in: the WhatsApp-slips screen hands each job (phone, token, message, settings)
// to the helper here, so NOTHING rides in the WhatsApp URL — the first version put the token in the
// URL hash and WhatsApp pasted it into the message (7 Oct 2026).
window.addEventListener("message", (ev) => {
  if (ev.source !== window || !ev.data || ev.data.type !== "genie:wa-job") return;
  const job = ev.data.job || {};
  if (!job.phone) return;
  chrome.storage.local.set({ ["job:" + job.phone]: Object.assign({ at: Date.now() }, job) }, () => {
    window.postMessage({ type: "genie:wa-job-stored", phone: job.phone }, "*");
  });
});
window.addEventListener("message", (ev) => {
  if (ev.source !== window || !ev.data || ev.data.type !== "genie:wa-helper?") return;
  window.postMessage({ type: "genie:wa-helper-ready", version: chrome.runtime.getManifest().version }, "*");
});
// announce on load too
window.postMessage({ type: "genie:wa-helper-ready", version: chrome.runtime.getManifest().version }, "*");
