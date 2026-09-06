"use client";
/**
 * The Drive leg of every Kuber upload: the person's own Google sign-in, a
 * subfolder under the linked Tally folder, a resumable upload in 16 MB
 * slices. Shared by the daily XML upload and the year-wise archive.
 */
/** The Drive folder Dr Raghu linked for the Tally XMLs. */
export const DRIVE_FOLDER = "1V3zIjPvz9DSHGlJCAuSSWk-iG5Tfnnev";


declare global {
  // Google Identity Services, loaded on demand for the Drive leg.
  interface Window { google?: { accounts: { oauth2: { initTokenClient: (c: object) => { requestAccessToken: () => void } } } } }
}

/**
 * Google's token, remembered for its hour so the account chooser does not
 * greet every file (Dr Raghu, 28 Aug 2026: "its asking this everytime!!").
 * The login_hint plus prompt:"" lets Google answer SILENTLY once consent
 * exists — the popup shows only the first time, or when the hour runs out
 * with no live Google session.
 */
let cachedTok: { t: string; exp: number } | null = null;

/** True when a Drive token is already in hand — no window will open. */
export function driveReady(): boolean { return !!cachedTok && Date.now() < cachedTok.exp; }

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
    // Google's window that never answers — blocked by the browser, or closed
    // without the callback firing — used to hang the upload at 0% for good.
    const timer = setTimeout(() => rej(new Error("Google's sign-in window did not answer in 45 seconds. Allow pop-ups for genie.nandan.co.in (the icon at the right of the address bar), press Connect Google Drive, and try the file again.")), 45_000);
    const tc = window.google!.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: "https://www.googleapis.com/auth/drive",
      ...(hint ? { login_hint: hint } : {}),
      prompt: "",
      callback: (t: { access_token?: string; error?: string; expires_in?: number }) => {
        clearTimeout(timer);
        if (t.access_token) {
          cachedTok = { t: t.access_token, exp: Date.now() + (Number(t.expires_in ?? 3300) - 120) * 1000 };
          res(t.access_token);
        } else rej(new Error(t.error || "Google did not grant access"));
      },
      error_callback: (e: { message?: string; type?: string }) => { clearTimeout(timer); rej(new Error(e.type === "popup_failed_to_open" ? "The browser blocked Google's window — allow pop-ups for genie.nandan.co.in and try again." : e.message || "Google sign-in was closed")); },
    } as object);
    tc.requestAccessToken();
  });
}

export async function driveUpload(token: string, folderName: string, file: File, kindLabel: string, onPct: (p: number) => void): Promise<{ id: string; link: string }> {
  const H = { authorization: `Bearer ${token}` };
  // the "<date> - <initials>" subfolder, found or made
  const q = encodeURIComponent(`name = '${folderName.replace(/'/g, "\\'")}' and '${DRIVE_FOLDER}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`);
  const found = await (await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)&supportsAllDrives=true&includeItemsFromAllDrives=true`, { headers: H })).json();
  let sub = found.files?.[0]?.id as string | undefined;
  if (!sub) {
    const mk = await (await fetch("https://www.googleapis.com/drive/v3/files?supportsAllDrives=true", {
      method: "POST", headers: { ...H, "content-type": "application/json" },
      body: JSON.stringify({ name: folderName, mimeType: "application/vnd.google-apps.folder", parents: [DRIVE_FOLDER] }),
    })).json();
    if (!mk.id) throw new Error(mk.error?.message || "Could not make the Drive subfolder");
    sub = mk.id;
  }
  // resumable session, then 16 MB slices with honest progress
  const init = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true", {
    method: "POST", headers: { ...H, "content-type": "application/json", "x-upload-content-type": file.type || "application/octet-stream" },
    body: JSON.stringify({ name: `${kindLabel} - ${file.name}`, parents: [sub] }),
  });
  const session = init.headers.get("location");
  if (!session) throw new Error((await init.json().catch(() => null))?.error?.message || "Drive refused the upload session");
  const CHUNK = 16 * 1024 * 1024;
  for (let off = 0; off < file.size; off += CHUNK) {
    const end = Math.min(off + CHUNK, file.size);
    const r = await fetch(session, {
      method: "PUT",
      headers: { "content-range": `bytes ${off}-${end - 1}/${file.size}` },
      body: file.slice(off, end),
    });
    if (r.status !== 308 && !r.ok) throw new Error(`Drive stopped at ${Math.round((off / file.size) * 100)}% (${r.status})`);
    onPct(end / file.size);
    if (r.ok) {
      const j = await r.json().catch(() => null);
      const id = String(j?.id || "");
      return { id, link: id ? `https://drive.google.com/file/d/${id}/view` : "" };
    }
  }
  return { id: "", link: "" };
}

