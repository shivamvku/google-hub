import { useEffect, useRef, useState } from "react";
import api from "../api";

interface DriveFile { id: string; name: string; mimeType: string; size?: string; modifiedTime: string; webViewLink?: string; iconLink?: string; }
interface StorageQuota { limit: string; usage: string; usageInDrive: string; }

const isFolder = (f: DriveFile) => f.mimeType === "application/vnd.google-apps.folder";
const fmtSize = (b?: string) => !b ? "" : +b > 1e6 ? `${(+b / 1e6).toFixed(1)} MB` : `${(+b / 1e3).toFixed(0)} KB`;
const fmtDate = (d: string) => new Date(d).toLocaleDateString();

export default function DrivePage() {
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [folder, setFolder] = useState("root");
  const [stack, setStack] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [quota, setQuota] = useState<StorageQuota | null>(null);
  const [newFolder, setNewFolder] = useState("");
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<DriveFile[] | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const loadFiles = (folderId = "root") => {
    setLoading(true);
    setSearchResults(null);
    api.get(`/drive/files?folder_id=${folderId}`)
      .then(r => setFiles(r.data))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadFiles(folder);
    api.get("/drive/storage").then(r => setQuota(r.data));
  }, [folder]);

  const openFolder = (f: DriveFile) => {
    setStack(s => [...s, { id: folder, name: stack.length ? stack[stack.length - 1].name : "My Drive" }]);
    setFolder(f.id);
  };
  const goBack = () => {
    const prev = stack[stack.length - 1];
    setStack(s => s.slice(0, -1));
    setFolder(prev.id);
  };

  const createFolder = async () => {
    if (!newFolder.trim()) return;
    await api.post("/drive/folder", new URLSearchParams({ name: newFolder, parent_id: folder }));
    setNewFolder(""); loadFiles(folder);
  };

  const upload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    const fd = new FormData(); fd.append("file", file); fd.append("folder_id", folder);
    await api.post("/drive/upload", fd); loadFiles(folder);
  };

  const deleteFile = async (id: string) => {
    if (!confirm("Delete this file?")) return;
    await api.delete(`/drive/files/${id}`); loadFiles(folder);
  };

  const share = async (id: string) => {
    const r = await api.post(`/drive/files/${id}/share`);
    navigator.clipboard.writeText(r.data.link);
    alert("Shareable link copied to clipboard!");
  };

  const doSearch = async () => {
    if (!search.trim()) return;
    setLoading(true);
    const r = await api.get(`/drive/search?q=${encodeURIComponent(search)}`);
    setSearchResults(r.data); setLoading(false);
  };

  const usedPct = quota ? Math.round((+quota.usage / +quota.limit) * 100) : 0;
  const display = searchResults ?? files;

  return (
    <div className="page">
      <div className="page__header">
        <h1 className="page__title">📁 Google Drive</h1>
        {quota && (
          <div style={{ marginTop: 6, fontSize: "0.8rem", color: "var(--text-dim)" }}>
            Storage: {fmtSize(quota.usage)} / {fmtSize(quota.limit)}
            <div style={{ marginTop: 4, height: 4, background: "var(--border)", borderRadius: 4, width: 200, maxWidth: "100%" }}>
              <div style={{ width: `${usedPct}%`, height: "100%", background: usedPct > 80 ? "var(--red)" : "var(--accent)", borderRadius: 4 }} />
            </div>
          </div>
        )}
      </div>

      {/* Toolbar */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
        {stack.length > 0 && (
          <button className="btn btn--ghost btn--sm" onClick={goBack}>← Back</button>
        )}
        <input
          style={{ flex: 1, minWidth: 160, background: "var(--bg)", border: "1px solid var(--border)", color: "var(--text)", borderRadius: 8, padding: "6px 10px", fontSize: "0.85rem" }}
          placeholder="Search Drive…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          onKeyDown={e => e.key === "Enter" && doSearch()}
        />
        <button className="btn btn--primary btn--sm" onClick={doSearch}>Search</button>
        {searchResults && <button className="btn btn--ghost btn--sm" onClick={() => { setSearchResults(null); setSearch(""); }}>Clear</button>}
        <input
          style={{ flex: 1, minWidth: 130, background: "var(--bg)", border: "1px solid var(--border)", color: "var(--text)", borderRadius: 8, padding: "6px 10px", fontSize: "0.85rem" }}
          placeholder="New folder name…"
          value={newFolder}
          onChange={e => setNewFolder(e.target.value)}
          onKeyDown={e => e.key === "Enter" && createFolder()}
        />
        <button className="btn btn--ghost btn--sm" onClick={createFolder}>+ Folder</button>
        <button className="btn btn--primary btn--sm" onClick={() => fileInput.current?.click()}>⬆ Upload</button>
        <input ref={fileInput} type="file" style={{ display: "none" }} onChange={upload} />
      </div>

      {/* Breadcrumb */}
      <div style={{ fontSize: "0.8rem", color: "var(--text-dim)", marginBottom: 12 }}>
        My Drive {stack.map((s, i) => <span key={i}> › {s.name}</span>)}
        {searchResults && <span> › Search: "{search}"</span>}
      </div>

      {loading ? <div className="loading">Loading…</div> : display.length === 0 ? (
        <div className="empty">This folder is empty.</div>
      ) : (
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr>
              <th>Name</th><th>Modified</th><th>Size</th><th>Actions</th>
            </tr></thead>
            <tbody>
              {display.map(f => (
                <tr key={f.id}>
                  <td>
                    <span
                      style={{ cursor: isFolder(f) ? "pointer" : "default", fontWeight: isFolder(f) ? 600 : 400 }}
                      onClick={() => isFolder(f) && openFolder(f)}
                    >
                      {isFolder(f) ? "📁 " : "📄 "}{f.name}
                    </span>
                  </td>
                  <td style={{ color: "var(--text-dim)", whiteSpace: "nowrap" }}>{fmtDate(f.modifiedTime)}</td>
                  <td style={{ color: "var(--text-dim)" }}>{fmtSize(f.size)}</td>
                  <td>
                    <div className="card__actions">
                      {f.webViewLink && <a className="btn btn--ghost btn--sm" href={f.webViewLink} target="_blank">Open</a>}
                      <button className="btn btn--ghost btn--sm" onClick={() => share(f.id)}>🔗 Share</button>
                      <button className="btn btn--danger btn--sm" onClick={() => deleteFile(f.id)}>🗑</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
