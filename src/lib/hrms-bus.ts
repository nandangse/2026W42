/**
 * ONE CHANGE, EVERY TAB (Dr Raghu, 7 Sep 2026: "this is not updating
 * automatically. Once the change of status is done it should update!").
 *
 * The appraisal discussions now open in their own tabs, so the table that
 * launched them sits in a tab of its own and never hears what happened. This
 * is the wire between them: a tab that changes somebody's status says so, and
 * every other tab reloads.
 *
 * BroadcastChannel where the browser has it, a localStorage key where it does
 * not — a `storage` event fires in every OTHER tab of the same origin, which
 * is exactly the audience wanted. Both are best-effort: the table also
 * refreshes when it is looked at again, so a missed message costs nothing.
 */
const NAME = "genie.hrms.changed";

export type HrmsChange = "appraisal" | "released" | "record";

/** Tell the other tabs that something changed. Never throws. */
export function announce(what: HrmsChange) {
  try {
    if (typeof BroadcastChannel !== "undefined") {
      const ch = new BroadcastChannel(NAME);
      ch.postMessage({ what, at: Date.now() });
      ch.close();
    }
  } catch { /* a browser without it still has the line below */ }
  try { window.localStorage.setItem(NAME, `${what}:${Date.now()}`); } catch { /* private mode */ }
}

/**
 * Listen for changes from other tabs, and for this tab being looked at again.
 * Returns the unsubscribe. `onChange` should be cheap to call more than once.
 */
export function onHrmsChange(onChange: () => void): () => void {
  const bump = () => onChange();
  let ch: BroadcastChannel | null = null;
  try {
    if (typeof BroadcastChannel !== "undefined") {
      ch = new BroadcastChannel(NAME);
      ch.onmessage = bump;
    }
  } catch { /* fall through to storage */ }
  const onStorage = (e: StorageEvent) => { if (e.key === NAME) bump(); };
  // Coming back to a tab is itself a reason to re-read: it may have been
  // open since before the change, or the message may never have arrived.
  const onVisible = () => { if (document.visibilityState === "visible") bump(); };
  window.addEventListener("storage", onStorage);
  document.addEventListener("visibilitychange", onVisible);
  window.addEventListener("focus", onVisible);
  return () => {
    try { ch?.close(); } catch { /* already gone */ }
    window.removeEventListener("storage", onStorage);
    document.removeEventListener("visibilitychange", onVisible);
    window.removeEventListener("focus", onVisible);
  };
}
