"use client";
// Tiny client-side fetch wrapper for the /api routes. All board data flows
// through GET /api/board; every mutation posts to its route then the caller
// re-fetches the board (last-save-wins shared team board, per V1.9).

async function jsonOrThrow(res: Response) {
  const ct = res.headers.get("content-type") || "";
  const body = ct.includes("application/json") ? await res.json() : await res.text();
  if (!res.ok) {
    /* Never "[object Object]" on a screen (audit D2, 9 Oct 2026): a JSON body
       with an empty `error` used to fall through to String(body). */
    const msg = typeof body === "object" && body !== null
      ? String(body.error || body.message || "")
      : String(body || "");
    throw new Error(msg.trim() || `HTTP ${res.status}`);
  }
  return body;
}

export const api = {
  async me() {
    return jsonOrThrow(await fetch("/api/me", { cache: "no-store" }));
  },
  async board() {
    return jsonOrThrow(await fetch("/api/board", { cache: "no-store" }));
  },
  async uploadStatus() {
    return jsonOrThrow(await fetch("/api/upload-status", { cache: "no-store" }));
  },
  /**
   * `slot` is the Morning Update card the file was dropped on. Sending it
   * turns "guess what this file is" into "check it is what they said it is" —
   * the Delivered Jobs export carries the same headers as the in-progress one,
   * so content alone is a weak signal.
   */
  async upload(file: File, slot?: string) {
    const fd = new FormData();
    fd.append("file", file);
    if (slot) fd.append("slot", slot);
    return jsonOrThrow(await fetch("/api/upload", { method: "POST", body: fd }));
  },
  async post(path: string, body: unknown) {
    return jsonOrThrow(
      await fetch(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
    );
  },
  async get(path: string) {
    return jsonOrThrow(await fetch(path, { cache: "no-store" }));
  },
  async del(path: string) {
    return jsonOrThrow(await fetch(path, { method: "DELETE" }));
  },
};
