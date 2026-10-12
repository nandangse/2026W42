"use client";
/**
 * SEVA → SERVICE REPAIRS — the LMS library, inside Seva (Dr Raghu, 12 Oct 2026).
 * Sections down the side, the videos in each; play one here. Aakash and Yash
 * add sections and videos (a Google Drive, YouTube or .mp4 link). The same
 * library is at genie.nandan.co.in/lms/service-repairs for the service team
 * and the Leaders Council.
 */
import { useEffect, useState } from "react";
import LmsVideo from "@/components/LmsVideo";
import { parseVideo } from "@/lib/lms";

type Section = { id: string; name: string };
type Lesson = { id: string; title: string; description: string; video_url: string | null; minutes: number; code: string | null; section_id: string | null };
const NAVY = "var(--navy)", MUTED = "var(--muted)", LINE = "var(--line)", RED = "var(--red)";
const inp: React.CSSProperties = { width: "100%", border: `1px solid ${LINE}`, borderRadius: 7, padding: "6px 9px", fontSize: 13, background: "#fff" };
const btn = (p?: boolean): React.CSSProperties => ({ borderRadius: 7, padding: "5px 11px", fontSize: 12.5, fontWeight: 700, border: `1px solid ${p ? "var(--accent)" : LINE}`, background: p ? "var(--accent)" : "#fff", color: p ? "#fff" : NAVY });

async function post(body: unknown) {
  const r = await fetch("/api/seva/repairs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || `Failed (${r.status})`); return j;
}

export default function SevaRepairs() {
  const [d, setD] = useState<{ installed: boolean; sections: Section[]; lessons: Lesson[]; mayAdd: boolean } | null>(null);
  const [sec, setSec] = useState<string>(""); const [play, setPlay] = useState<Lesson | null>(null);
  const [add, setAdd] = useState<{ id?: string; title: string; video_url: string; description: string; section_id: string; minutes: string } | null>(null);
  const [newSec, setNewSec] = useState(""); const [err, setErr] = useState<string | null>(null);
  const load = () => fetch("/api/seva/repairs", { cache: "no-store" }).then((r) => r.json()).then(setD).catch(() => setD(null));
  useEffect(() => { load(); }, []);
  if (!d) return <div className="text-sm" style={{ color: MUTED }}>Opening the library…</div>;
  if (!d.installed) return <div className="text-sm font-bold" style={{ color: RED }}>Run migration 0229 first — the library is not on the shelf yet.</div>;
  const shown = d.lessons.filter((l) => !sec || l.section_id === sec || (sec === "none" && !l.section_id));
  const save = async () => { if (!add) return; setErr(null); try { await post({ action: "video", ...add }); setAdd(null); await load(); } catch (e) { setErr(String((e as Error).message)); } };
  return (
    <div>
      <div className="flex items-baseline gap-2 flex-wrap mb-2">
        <h2 className="font-bold" style={{ fontSize: 20, color: NAVY }}>🔧 Service Repairs</h2>
        <span className="text-xs" style={{ color: MUTED }}>the service team&apos;s video library — also in the LMS for the team and the Leaders Council</span>
        <a href="/lms/service-repairs" className="ml-auto text-xs font-bold" style={{ color: "var(--blue)" }}>Open in the LMS ↗</a>
        {d.mayAdd && <button onClick={() => setAdd({ title: "", video_url: "", description: "", section_id: sec && sec !== "none" ? sec : "", minutes: "" })} style={btn(true)}>+ Add a video</button>}
      </div>
      <div className="grid gap-3" style={{ gridTemplateColumns: "220px minmax(0, 1fr)" }}>
        <div className="grid gap-1" style={{ alignContent: "start" }}>
          <button onClick={() => setSec("")} className="text-left rounded px-2 py-1.5 text-sm font-semibold" style={{ background: sec === "" ? NAVY : "#fff", color: sec === "" ? "#fff" : NAVY, border: `1px solid ${LINE}` }}>All videos · {d.lessons.length}</button>
          {d.sections.map((s) => <button key={s.id} onClick={() => setSec(s.id)} className="text-left rounded px-2 py-1.5 text-sm font-semibold" style={{ background: sec === s.id ? NAVY : "#fff", color: sec === s.id ? "#fff" : NAVY, border: `1px solid ${LINE}` }}>{s.name} · {d.lessons.filter((l) => l.section_id === s.id).length}</button>)}
          {d.lessons.some((l) => !l.section_id) && <button onClick={() => setSec("none")} className="text-left rounded px-2 py-1.5 text-sm" style={{ background: sec === "none" ? NAVY : "#fff", color: sec === "none" ? "#fff" : MUTED, border: `1px solid ${LINE}` }}>Not in a section</button>}
          {d.mayAdd && <div className="flex gap-1 mt-1"><input style={inp} value={newSec} onChange={(e) => setNewSec(e.target.value)} placeholder="New section — e.g. Hydraulic seals" /><button onClick={async () => { if (!newSec.trim()) return; try { await post({ action: "section", name: newSec }); setNewSec(""); load(); } catch (e) { setErr(String((e as Error).message)); } }} style={btn()}>+</button></div>}
        </div>
        <div>
          {err && <div className="text-sm font-bold mb-2" style={{ color: RED }}>{err}</div>}
          {play && (
            <div className="rounded-lg bg-white p-3 mb-3" style={{ border: `1px solid ${LINE}` }}>
              <div className="flex items-center mb-2"><b style={{ color: NAVY }}>{play.title}</b><button onClick={() => setPlay(null)} className="ml-auto font-bold" style={{ color: MUTED }}>✕</button></div>
              <LmsVideo video={parseVideo(play.video_url)} />
              {play.description && <div className="text-sm mt-2" style={{ whiteSpace: "pre-wrap" }}>{play.description}</div>}
            </div>
          )}
          <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))" }}>
            {shown.map((l) => (
              <div key={l.id} className="rounded-lg bg-white p-2.5" style={{ border: `1px solid ${LINE}` }}>
                <button onClick={() => setPlay(l)} className="text-left w-full">
                  <div className="rounded flex items-center justify-center mb-1.5" style={{ height: 96, background: "#0F172A", color: "#fff", fontSize: 30 }}>▶</div>
                  <div className="font-bold text-sm" style={{ color: NAVY }}>{l.title}</div>
                  <div className="text-xs" style={{ color: MUTED }}>{d.sections.find((s) => s.id === l.section_id)?.name || "—"}{l.minutes ? ` · ${l.minutes} min` : ""}{l.code ? ` · /lms/${l.code}` : ""}</div>
                </button>
                {d.mayAdd && <div className="flex gap-2 mt-1 text-xs"><button onClick={() => setAdd({ id: l.id, title: l.title, video_url: l.video_url || "", description: l.description, section_id: l.section_id || "", minutes: String(l.minutes || "") })} style={{ color: "var(--blue)" }}>Edit</button><button onClick={async () => { if (confirm(`Take "${l.title}" off the shelf?`)) { await post({ action: "remove", id: l.id }); load(); } }} style={{ color: RED }}>Remove</button></div>}
              </div>
            ))}
            {shown.length === 0 && <div className="text-sm" style={{ color: MUTED }}>No video here yet{d.mayAdd ? " — + Add a video: record it on the phone, put it on Google Drive, paste the link." : "."}</div>}
          </div>
        </div>
      </div>
      {add && (
        <div onClick={() => setAdd(null)} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.45)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div onClick={(e) => e.stopPropagation()} className="rounded-xl" style={{ width: "min(600px, 100%)", background: "var(--paper)", padding: 18 }}>
            <b style={{ fontSize: 17, color: NAVY }}>{add.id ? "Edit the video" : "Add a video"}</b>
            <div className="grid gap-2 mt-3">
              <input style={inp} value={add.title} onChange={(e) => setAdd({ ...add, title: e.target.value })} placeholder="Title — e.g. Replacing the cylinder seal on a Hi-Lift" />
              <input style={inp} value={add.video_url} onChange={(e) => setAdd({ ...add, video_url: e.target.value })} placeholder="Google Drive, YouTube or .mp4 link" />
              {add.video_url && parseVideo(add.video_url).kind === "unknown" && <div className="text-xs" style={{ color: RED }}>Not a link the player knows — Drive (shared with nandan.co.in), YouTube or .mp4.</div>}
              <div className="grid gap-2" style={{ gridTemplateColumns: "1fr 120px" }}>
                <select style={inp} value={add.section_id} onChange={(e) => setAdd({ ...add, section_id: e.target.value })}><option value="">— section —</option>{d.sections.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
                <input style={inp} value={add.minutes} onChange={(e) => setAdd({ ...add, minutes: e.target.value.replace(/\D/g, "") })} placeholder="Minutes" />
              </div>
              <textarea style={{ ...inp, minHeight: 70 }} value={add.description} onChange={(e) => setAdd({ ...add, description: e.target.value })} placeholder="What it shows, the tools, the part numbers" />
            </div>
            {err && <div className="text-sm font-bold mt-2" style={{ color: RED }}>{err}</div>}
            <div className="flex gap-2 mt-3"><button onClick={save} style={btn(true)}>Save</button><button onClick={() => setAdd(null)} style={btn()}>Cancel</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
