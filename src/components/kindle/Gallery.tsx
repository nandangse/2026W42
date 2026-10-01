"use client";
import { useEffect, useRef, useState } from "react";
import { api, btn, Card, dmy, input, K, label, serif, type Boot } from "./shared";

interface Album { id: string; title: string; taken_on: string | null; meeting_id: string | null; created_by: string | null; created_at: string; count: number; cover: string | null }
interface Photo { id: string; album_id: string; path: string; caption: string | null; uploaded_by: string | null; created_at: string }
const src = (path: string) => `/api/kindle/file?path=${encodeURIComponent(path)}`;

/** Gallery: albums per meeting and off-site; upload from the phone; a lightbox. */
export default function Gallery({ boot, arg, go }: { boot: Boot; arg: string | null; go: (k: string, a?: string | null) => void }) {
  const [albums, setAlbums] = useState<Album[] | null>(null);
  const [adding, setAdding] = useState(false); const [title, setTitle] = useState(""); const [on, setOn] = useState(boot.today); const [mid, setMid] = useState("");
  const load = () => api<{ albums: Album[] }>("/api/kindle/gallery").then((r) => setAlbums(r.albums)).catch(() => setAlbums([]));
  useEffect(() => { load(); }, []);
  const create = async () => { try { const r = await api<{ id: string }>("/api/kindle/gallery", { action: "album", title, taken_on: on || null, meeting_id: mid || null }); setAdding(false); setTitle(""); load(); go("gallery", r.id); } catch (e) { alert(String((e as Error).message || e)); } };
  if (arg) return <AlbumView boot={boot} albumId={arg} album={albums?.find((a) => a.id === arg) || null} back={() => { go("gallery"); load(); }} />;
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <h1 style={{ ...serif, fontSize: 26, margin: 0 }}>Gallery</h1>
        <span style={{ color: K.muted, fontSize: 13 }}>{albums ? `${albums.length} albums · ${albums.reduce((s, a) => s + a.count, 0)} photos` : ""}</span>
        <div style={{ flex: 1 }} />
        <button onClick={() => setAdding(!adding)} style={btn(adding ? "ghost" : "primary")}>{adding ? "Close" : "+ New album"}</button>
      </div>
      {adding && (
        <Card title="A new album">
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 10 }} className="kindle-three">
            <div><label style={label}>Title</label><input style={input} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="October meeting, Off-site 2026…" /></div>
            <div><label style={label}>Date</label><input style={input} type="date" value={on} onChange={(e) => setOn(e.target.value)} /></div>
            <div><label style={label}>Meeting</label><select style={input} value={mid} onChange={(e) => { setMid(e.target.value); const m = boot.meetings.find((x) => x.id === e.target.value); if (m) { setOn(m.meeting_on); if (!title) setTitle(`${m.title || "Meeting"} · ${dmy(m.meeting_on)}`); } }}><option value="">—</option>{[...boot.meetings].reverse().map((m) => <option key={m.id} value={m.id}>{dmy(m.meeting_on)}{m.title ? ` · ${m.title}` : ""}</option>)}</select></div>
          </div>
          <div style={{ marginTop: 10 }}><button onClick={create} style={btn("primary")}>Create</button></div>
          <style>{`@media (max-width: 640px){ .kindle-three { grid-template-columns: 1fr !important; } }`}</style>
        </Card>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 }}>
        {albums?.map((a) => (
          <button key={a.id} onClick={() => go("gallery", a.id)} style={{ textAlign: "left", background: "#fff", border: `1px solid ${K.line}`, borderRadius: 14, overflow: "hidden", cursor: "pointer", padding: 0 }}>
            <div style={{ height: 150, background: K.soft, display: "grid", placeItems: "center", overflow: "hidden" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {a.cover ? <img src={src(a.cover)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span style={{ fontSize: 34 }}>📷</span>}
            </div>
            <div style={{ padding: 10 }}><div style={{ fontWeight: 700, fontSize: 14 }}>{a.title}</div><div style={{ fontSize: 12, color: K.muted }}>{a.taken_on ? dmy(a.taken_on) : ""} · {a.count} photo{a.count === 1 ? "" : "s"}</div></div>
          </button>
        ))}
        {albums && albums.length === 0 && <Card><span style={{ color: K.muted }}>No albums yet. Make one for today's meeting and add the photos from your phone. The Google Drive folder set in Settings seeds the rest later.</span></Card>}
      </div>
    </div>
  );
}

function AlbumView({ boot, albumId, album, back }: { boot: Boot; albumId: string; album: Album | null; back: () => void }) {
  const [photos, setPhotos] = useState<Photo[] | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const load = () => api<{ photos: Photo[] }>(`/api/kindle/gallery?album=${albumId}`).then((r) => setPhotos(r.photos));
  useEffect(() => { load(); }, [albumId]); // eslint-disable-line react-hooks/exhaustive-deps
  const upload = async (files: FileList) => {
    const fd = new FormData(); fd.append("album_id", albumId); [...files].forEach((f) => fd.append("file", f));
    setBusy(`Uploading ${files.length}…`);
    try { const r = await fetch("/api/kindle/gallery", { method: "POST", body: fd }); const j = await r.json(); if (!r.ok) throw new Error(j.error); load(); } catch (e) { alert(String((e as Error).message || e)); }
    setBusy(null);
  };
  const remove = async (p: Photo) => { if (!confirm("Remove this photo?")) return; await api("/api/kindle/gallery", { action: "remove", photo_id: p.id }); load(); };
  const caption = async (p: Photo) => { const c = prompt("Caption", p.caption || ""); if (c == null) return; await api("/api/kindle/gallery", { action: "caption", photo_id: p.id, caption: c }); load(); };
  useEffect(() => { const k = (e: KeyboardEvent) => { if (open == null || !photos) return; if (e.key === "Escape") setOpen(null); if (e.key === "ArrowRight") setOpen(Math.min(photos.length - 1, open + 1)); if (e.key === "ArrowLeft") setOpen(Math.max(0, open - 1)); }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [open, photos]);
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <button onClick={back} style={{ background: "none", border: "none", color: K.emberDark, fontWeight: 700, cursor: "pointer", textAlign: "left", padding: 0, fontSize: 13 }}>← Gallery</button>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h1 style={{ ...serif, fontSize: 24, margin: 0 }}>{album?.title || "Album"}</h1>
        <span style={{ color: K.muted, fontSize: 13 }}>{album?.taken_on ? dmy(album.taken_on) : ""} · {photos?.length ?? "…"} photos</span>
        <div style={{ flex: 1 }} />
        <input ref={file} type="file" accept="image/*" multiple hidden onChange={(e) => e.target.files?.length && upload(e.target.files)} />
        <button onClick={() => file.current?.click()} disabled={!!busy} style={btn("primary")}>{busy || "+ Add photos"}</button>
        {boot.me.admin && <button onClick={async () => { if (!confirm("Remove the album and every photo in it?")) return; await api("/api/kindle/gallery", { action: "remove_album", album_id: albumId }); back(); }} style={btn("ghost")}>Remove album</button>}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 8 }}>
        {photos?.map((p, i) => (
          <div key={p.id} style={{ position: "relative", aspectRatio: "1", background: K.soft, borderRadius: 10, overflow: "hidden" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src(p.path)} alt={p.caption || ""} loading="lazy" onClick={() => setOpen(i)} style={{ width: "100%", height: "100%", objectFit: "cover", cursor: "zoom-in" }} />
            {p.caption && <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,.5)", color: "#fff", fontSize: 11, padding: "3px 6px" }}>{p.caption}</div>}
          </div>
        ))}
        {photos && photos.length === 0 && <div style={{ gridColumn: "1 / -1", color: K.muted, fontSize: 13 }}>Empty. Add photos from your phone or computer; several at once is fine.</div>}
      </div>
      {open != null && photos && photos[open] && (
        <div onClick={() => setOpen(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.92)", zIndex: 50, display: "grid", placeItems: "center", padding: 16 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src(photos[open].path)} alt="" style={{ maxWidth: "100%", maxHeight: "86vh", borderRadius: 8 }} onClick={(e) => e.stopPropagation()} />
          <div onClick={(e) => e.stopPropagation()} style={{ position: "absolute", bottom: 16, left: 0, right: 0, textAlign: "center", color: "#fff", fontSize: 13, display: "flex", gap: 14, justifyContent: "center", alignItems: "center" }}>
            <button onClick={() => setOpen(Math.max(0, open - 1))} style={btn("ghost", { padding: "6px 12px" })}>←</button>
            <span>{open + 1} / {photos.length}{photos[open].caption ? ` · ${photos[open].caption}` : ""} · by {boot.members.find((m) => m.id === photos[open].uploaded_by)?.short_name || "—"}</span>
            <button onClick={() => setOpen(Math.min(photos.length - 1, open + 1))} style={btn("ghost", { padding: "6px 12px" })}>→</button>
            {(photos[open].uploaded_by === boot.me.id || boot.me.admin) && <><button onClick={() => caption(photos[open])} style={btn("ghost", { padding: "6px 10px", fontSize: 12 })}>Caption</button><button onClick={() => { remove(photos[open]); setOpen(null); }} style={btn("ghost", { padding: "6px 10px", fontSize: 12 })}>Remove</button></>}
            <button onClick={() => setOpen(null)} style={btn("ghost", { padding: "6px 10px", fontSize: 12 })}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}
