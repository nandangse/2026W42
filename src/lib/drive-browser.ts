"use client";

/**
 * The browser's own Google Drive leg — the pattern proven on Kuber's Tally
 * uploads (28 Aug 2026): the token is asked for FIRST, inside the click
 * (popups need the click's blessing), remembered for its hour, and answered
 * silently once consent exists. Files go browser → Drive, never through
 * Vercel.
 */

declare global {
  interface Window { google?: { accounts: { oauth2: { initTokenClient: (c: object) => { requestAccessToken: () => void } } } } }
}

let cachedTok: { t: string; exp: number } | null = null;

export async function driveToken(clientId: string, hint?: string): Promise<string> {
  if (cachedTok && Date.now() < cachedTok.exp) return cachedTok.t;
  await new Promise<void>((res, rej) => {
    if (window.google?.accounts) return res();
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.onload = () => res();
    s.onerror = () => rej(new Error("Google sign-in script would not load"));
    document.head.appendChild(s);
  });
  return new Promise((res, rej) => {
    const tc = window.google!.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: "https://www.googleapis.com/auth/drive",
      ...(hint ? { login_hint: hint } : {}),
      prompt: "",
      callback: (t: { access_token?: string; error?: string; expires_in?: number }) => {
        if (t.access_token) {
          cachedTok = { t: t.access_token, exp: Date.now() + (Number(t.expires_in ?? 3300) - 120) * 1000 };
          res(t.access_token);
        } else rej(new Error(t.error || "Google did not grant access"));
      },
      error_callback: (e: { message?: string }) => rej(new Error(e.message || "Google sign-in was closed")),
    } as object);
    tc.requestAccessToken();
  });
}

/** Resumable upload straight into one Drive folder; returns the file's id and link. */
export async function uploadToDriveFolder(
  token: string, folderId: string, file: File, onPct?: (p: number) => void,
): Promise<{ id: string; link: string }> {
  const H = { authorization: `Bearer ${token}` };
  const init = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true", {
    method: "POST", headers: { ...H, "content-type": "application/json", "x-upload-content-type": file.type || "application/octet-stream" },
    body: JSON.stringify({ name: file.name, parents: [folderId] }),
  });
  const session = init.headers.get("location");
  if (!session) throw new Error((await init.json().catch(() => null))?.error?.message || "Drive refused the upload session");
  const CHUNK = 16 * 1024 * 1024;
  let out: { id?: string } = {};
  for (let off = 0; off < file.size; off += CHUNK) {
    const end = Math.min(off + CHUNK, file.size);
    const r = await fetch(session, {
      method: "PUT",
      headers: { "content-range": `bytes ${off}-${end - 1}/${file.size}` },
      body: file.slice(off, end),
    });
    if (r.status !== 308 && !r.ok) throw new Error(`Drive stopped at ${Math.round((off / file.size) * 100)}% (${r.status})`);
    if (r.ok) out = await r.json().catch(() => ({}));
    onPct?.(end / file.size);
  }
  const id = String(out.id || "");
  return { id, link: id ? `https://drive.google.com/file/d/${id}/view` : "" };
}
