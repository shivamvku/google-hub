import { useEffect, useState } from "react";
import api from "../api";

interface DocFile { id: string; name: string; modifiedTime: string; webViewLink: string; }
interface DocDetail { id: string; title: string; text: string; link: string; }

export default function DocsPage() {
  const [docs, setDocs]       = useState<DocFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<DocDetail | null>(null);
  const [loadingDoc, setLoadingDoc] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newContent, setNewContent] = useState("");
  const [showInsert, setShowInsert] = useState(false);
  const [insertText, setInsertText] = useState("");
  const [saving, setSaving]   = useState(false);
  const [toast, setToast]     = useState("");

  const load = () => {
    setLoading(true);
    api.get("/docs/list").then(r => setDocs(r.data)).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const openDoc = async (id: string) => {
    setLoadingDoc(true);
    setSelected(null);
    const r = await api.get(`/docs/${id}`);
    setSelected(r.data);
    setLoadingDoc(false);
  };

  const createDoc = async () => {
    if (!newTitle.trim()) return;
    setSaving(true);
    try {
      const r = await api.post("/docs/create", { title: newTitle, content: newContent });
      setShowCreate(false);
      setNewTitle(""); setNewContent("");
      load();
      showToast(`Created "${r.data.title}"`);
    } finally { setSaving(false); }
  };

  const insertToDoc = async () => {
    if (!selected || !insertText.trim()) return;
    setSaving(true);
    try {
      await api.post(`/docs/${selected.id}/insert`, { text: insertText + "\n", index: 1 });
      setInsertText("");
      setShowInsert(false);
      openDoc(selected.id);
      showToast("Text inserted");
    } finally { setSaving(false); }
  };

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(""), 3000); };

  return (
    <div className="page">
      <div className="page__header" style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ flex: 1 }}>
          <h1 className="page__title">📝 Google Docs</h1>
          <p className="page__sub">{docs.length} documents</p>
        </div>
        <button className="btn btn--primary btn--sm" onClick={() => setShowCreate(true)}>+ New Doc</button>
      </div>

      <div style={{ display: "flex", gap: 16, minHeight: 500 }}>
        {/* Doc list */}
        <div style={{ width: 260, flexShrink: 0 }}>
          {loading ? <div className="loading">Loading…</div> : docs.length === 0 ? (
            <div className="empty">No documents found.</div>
          ) : (
            <div style={{ border: "1px solid var(--border)", borderRadius: "var(--radius)", overflow: "hidden" }}>
              {docs.map((d, i) => (
                <div
                  key={d.id}
                  onClick={() => openDoc(d.id)}
                  style={{
                    padding: "10px 14px",
                    cursor: "pointer",
                    background: selected?.id === d.id ? "rgba(79,142,247,0.08)" : "var(--card)",
                    borderBottom: i < docs.length - 1 ? "1px solid var(--border)" : "none",
                    borderLeft: selected?.id === d.id ? "3px solid var(--accent)" : "3px solid transparent",
                  }}
                >
                  <div style={{ fontWeight: 500, fontSize: "0.85rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>📝 {d.name}</div>
                  <div style={{ fontSize: "0.72rem", color: "var(--text-dim)", marginTop: 2 }}>
                    {new Date(d.modifiedTime).toLocaleDateString()}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Doc viewer */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {loadingDoc ? (
            <div className="loading">Loading document…</div>
          ) : selected ? (
            <div className="card" style={{ height: "100%", display: "flex", flexDirection: "column" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
                <h2 style={{ flex: 1, fontSize: "1rem", fontWeight: 700 }}>{selected.title}</h2>
                <button className="btn btn--ghost btn--sm" onClick={() => setShowInsert(true)}>+ Insert Text</button>
                <a className="btn btn--ghost btn--sm" href={selected.link} target="_blank">↗ Open in Docs</a>
              </div>
              <hr style={{ borderColor: "var(--border)", marginBottom: 16 }} />
              <pre style={{ fontFamily: "inherit", fontSize: "0.875rem", lineHeight: 1.7, whiteSpace: "pre-wrap", wordBreak: "break-word", flex: 1, overflow: "auto" }}>
                {selected.text || <span style={{ color: "var(--text-dim)" }}>Document is empty.</span>}
              </pre>
            </div>
          ) : (
            <div className="empty" style={{ marginTop: 80 }}>Select a document to read it.</div>
          )}
        </div>
      </div>

      {/* Create doc modal */}
      {showCreate && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div className="card" style={{ width: "min(480px, 100%)", display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <h2 style={{ fontSize: "1rem", fontWeight: 700 }}>New Document</h2>
              <button className="btn btn--ghost btn--sm" onClick={() => setShowCreate(false)}>✕</button>
            </div>
            <div className="form-group">
              <label>Title *</label>
              <input value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="Document title" />
            </div>
            <div className="form-group">
              <label>Initial Content (optional)</label>
              <textarea rows={6} value={newContent} onChange={e => setNewContent(e.target.value)} placeholder="Start writing…" />
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button className="btn btn--ghost btn--sm" onClick={() => setShowCreate(false)}>Cancel</button>
              <button className="btn btn--primary btn--sm" onClick={createDoc} disabled={saving}>
                {saving ? "Creating…" : "✔ Create"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Insert text modal */}
      {showInsert && selected && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div className="card" style={{ width: "min(480px, 100%)", display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <h2 style={{ fontSize: "1rem", fontWeight: 700 }}>Insert Text — {selected.title}</h2>
              <button className="btn btn--ghost btn--sm" onClick={() => setShowInsert(false)}>✕</button>
            </div>
            <p style={{ fontSize: "0.8rem", color: "var(--text-dim)" }}>Text will be inserted at the beginning of the document.</p>
            <div className="form-group">
              <label>Text to insert</label>
              <textarea rows={5} value={insertText} onChange={e => setInsertText(e.target.value)} placeholder="Type text to prepend…" />
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button className="btn btn--ghost btn--sm" onClick={() => setShowInsert(false)}>Cancel</button>
              <button className="btn btn--primary btn--sm" onClick={insertToDoc} disabled={saving}>
                {saving ? "Inserting…" : "✔ Insert"}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div style={{ position: "fixed", bottom: 24, right: 24, background: "var(--green)", color: "#fff", padding: "10px 18px", borderRadius: 8, fontWeight: 600, fontSize: "0.85rem", zIndex: 300 }}>
          {toast}
        </div>
      )}
    </div>
  );
}
