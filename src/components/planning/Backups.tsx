"use client";
/**
 * BACKUPS — the oldest must-have, and the only one whose absence cannot be
 * recovered from.
 *
 * Dr Raghu, 17 Sep 2026: "Backup Code — Backup Database. Backup code should
 * make a zip file in a specified folder. This will be on MY drive, I will put
 * the folder link ... keep this in a way where we can see the link and the
 * size. ONLY raghu."
 *
 * THE SIZE IS THE POINT OF THE SCREEN. A backup nobody checks the size of is
 * a backup nobody knows is empty, and that is precisely how people discover
 * on the worst day that it has been writing nought bytes for a month. Every
 * run shows its size, its link and how long it took, and a failure is listed
 * as loudly as a success.
 */
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";

type Run = {
  id: string; kind: string; at: string; ok: boolean; bytes: number | null; files: number | null;
  seconds: number | null; drive_link: string | null; name: string | null; note: string | null; error: string | null;
};

const mb = (b: number | null) => (b == null ? "—" : b < 1048576 ? `${Math.round(b / 1024)} KB` : `${Math.round((b / 1048576) * 10) / 10} MB`);

export default function Backups() {
  const [d, setD] = useState<{ installed: boolean; codeFolder: string | null; dbFolder: string | null; driveReady: boolean; githubReady: boolean; runs: Run[] } | null>(null);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [note, setNote] = useState("");
  const [link, setLink] = useState({ code: "", db: "" });

  const load = useCallback(() => api.get("/api/admin/backup")
    .then((r) => setD(r as never)).catch((e) => setErr(e instanceof Error ? e.message : String(e))), []);
  useEffect(() => { load(); }, [load]);

  const post = async (body: Record<string, unknown>) => {
    const r = await api.post("/api/admin/backup", body) as { ok?: boolean; run?: Run };
    return r;
  };
  const save = async (kind: "code" | "db") => {
    setBusy(kind + "-folder"); setErr(""); setNote("");
    try { await post({ action: "folder", kind, url: link[kind] }); setNote("folder saved ✓"); await load(); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    setBusy("");
  };
  const run = async (kind: "code" | "db") => {
    setBusy(kind); setErr(""); setNote("");
    try {
      const r = await post({ action: "run", kind });
      const x = r.run;
      setNote(x?.ok ? `Done — ${mb(x.bytes ?? null)} in ${Math.round(Number(x.seconds || 0))}s.` : `It did not work: ${x?.error || "unknown"}`);
      await load();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    setBusy("");
  };

  const card = (kind: "code" | "db", title: string, blurb: string, folder: string | null, ready: boolean, readyNote: string) => (
    <div className="rounded border p-3" style={{ borderColor: "var(--line)", background: "#fff" }}>
      <div className="font-bold" style={{ color: "var(--navy)", fontSize: 15 }}>{title}</div>
      <div className="text-xs mt-0.5 mb-2" style={{ color: "var(--muted)", lineHeight: 1.6 }}>{blurb}</div>
      {!ready && <div className="text-xs rounded p-2 mb-2" style={{ background: "#FDF8EC", color: "#7A5B00" }}>{readyNote}</div>}
      <label className="block text-xs font-semibold" style={{ color: "var(--dim)" }}>
        The Drive folder it goes into — paste the folder&rsquo;s address
        <input value={link[kind]} onChange={(e) => setLink((l) => ({ ...l, [kind]: e.target.value }))}
          placeholder={folder ? `set — ${folder}` : "https://drive.google.com/drive/folders/…"}
          className="w-full rounded border px-2 py-1 mt-0.5" style={{ borderColor: "var(--line)", fontSize: 13 }} />
      </label>
      <div className="flex gap-2 mt-2 flex-wrap items-center">
        <button onClick={() => save(kind)} disabled={!!busy || !link[kind].trim()} className="text-xs font-bold rounded px-3 py-1.5"
          style={{ background: "#fff", border: "1px solid var(--line)", color: "var(--navy)" }}>Save the folder</button>
        <button onClick={() => run(kind)} disabled={!!busy || !folder} className="text-xs font-bold rounded px-3 py-1.5 text-white"
          style={{ background: busy === kind ? "#B9BEC4" : "var(--accent)" }}>
          {busy === kind ? "working…" : "Back it up now"}
        </button>
        {folder && <a href={`https://drive.google.com/drive/folders/${folder}`} target="_blank" rel="noreferrer" className="text-xs" style={{ color: "var(--blue)", textDecoration: "underline" }}>open the folder</a>}
        {!folder && <span className="text-xs" style={{ color: "var(--muted)" }}>set a folder first</span>}
      </div>
    </div>
  );

  if (!d) return <div className="p-4 text-sm" style={{ color: "var(--muted)" }}>{err || "opening…"}</div>;
  if (!d.installed) return <div className="p-4"><div className="rounded border p-3 text-sm" style={{ borderColor: "#E0C88A", background: "#FDF8EC", color: "#7A5B00" }}>
    <b>Run Genie migration 0169</b> — there is nowhere to record a backup yet.</div></div>;

  return (
    <div className="p-4">
      <div className="text-xs font-bold" style={{ color: "var(--muted)", letterSpacing: 1.4 }}>ADMIN</div>
      <div className="text-lg font-bold mb-1" style={{ color: "var(--navy)" }}>💾 Backups</div>
      <div className="text-xs mb-3" style={{ color: "var(--muted)", lineHeight: 1.6, maxWidth: 760 }}>
        Both archives go into <b>folders on your own Drive</b> — a backup living in the account it backs up is a second copy of the same risk.
        They also run <b>every night at half past one</b>. Every run below shows its size, because <b>a backup nobody checks the size of is a backup
        nobody knows is empty</b>.
      </div>

      {err && <div className="rounded border p-2 mb-2 text-xs font-semibold" style={{ borderColor: "var(--red)", color: "var(--red)", background: "#FDF3F2" }}>{err}</div>}
      {note && <div className="text-xs mb-2 font-semibold" style={{ color: note.startsWith("It did not") ? "var(--red)" : "var(--green)" }}>{note}</div>}

      <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 340px), 1fr))" }}>
        {card("code", "Backup Code", "The whole source at main, exactly as GitHub packs it for anybody cloning. About eleven megabytes.", d.codeFolder, d.githubReady,
          "GITHUB_TOKEN is not set on Vercel. The deployed app carries its built output, not its source, so the code is fetched from GitHub — add a read-only token for the repository.")}
        {card("db", "Backup Database", "Every row of every table in both databases, as JSON lines, one file per table. It is a complete copy of the data — it is not a pg_dump, and the archive says so in a read-me.", d.dbFolder, d.driveReady,
          "Google Drive is not configured on the deploy — GOOGLE_SA_EMAIL and GOOGLE_SA_PRIVATE_KEY.")}
      </div>

      <div className="text-xs font-bold mt-4 mb-1" style={{ color: "var(--muted)", letterSpacing: 1 }}>THE LAST TWENTY RUNS</div>
      {d.runs.length === 0 && <div className="text-sm" style={{ color: "var(--muted)" }}>Nothing yet. Set a folder and press <b>Back it up now</b>.</div>}
      {d.runs.map((r) => (
        <div key={r.id} className="rounded border p-2 mb-1" style={{ borderColor: r.ok ? "var(--line)" : "var(--red)", background: r.ok ? "#fff" : "#FDF3F2" }}>
          <div className="flex items-center gap-2 flex-wrap" style={{ fontSize: 12.5 }}>
            <span style={{ width: 62, fontWeight: 700, color: "var(--navy)" }}>{r.kind === "code" ? "code" : "database"}</span>
            <span style={{ color: "var(--muted)" }}>{new Date(r.at).toLocaleString("en-GB")}</span>
            <b className="tnum" style={{ color: r.ok ? "var(--green)" : "var(--red)" }}>{r.ok ? mb(r.bytes) : "failed"}</b>
            {r.seconds != null && <span className="tnum" style={{ color: "var(--muted)" }}>{Math.round(Number(r.seconds))}s</span>}
            {r.drive_link && <a href={r.drive_link} target="_blank" rel="noreferrer" style={{ color: "var(--blue)", textDecoration: "underline" }}>{r.name}</a>}
            {!r.drive_link && r.name && <span style={{ color: "var(--muted)" }}>{r.name}</span>}
          </div>
          {r.note && <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 2 }}>{r.note}</div>}
          {r.error && <div style={{ fontSize: 11.5, color: "var(--red)", marginTop: 2 }}>{r.error}</div>}
        </div>
      ))}
    </div>
  );
}
