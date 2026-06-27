import { useEffect, useState } from "react";
import api from "../api";

interface Message {
  id: string; from: string; subject: string;
  date: string; snippet: string; labelIds: string[];
}
interface FullMessage extends Message { to: string; body: string; }

interface SendForm { to: string; subject: string; body: string; }

const isUnread = (m: Message) => m.labelIds.includes("UNREAD");
const fmtDate  = (d: string)  => new Date(d).toLocaleDateString();

export default function GmailPage() {
  const [messages, setMessages]   = useState<Message[]>([]);
  const [loading, setLoading]     = useState(true);
  const [selected, setSelected]   = useState<FullMessage | null>(null);
  const [compose, setCompose]     = useState(false);
  const [query, setQuery]         = useState("in:inbox");
  const [form, setForm]           = useState<SendForm>({ to: "", subject: "", body: "" });
  const [sending, setSending]     = useState(false);
  const [toast, setToast]         = useState("");

  const loadMessages = (q = query) => {
    setLoading(true);
    setSelected(null);
    api.get(`/gmail/inbox?q=${encodeURIComponent(q)}&max_results=25`)
      .then(r => setMessages(r.data))
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadMessages(); }, []);

  const openMessage = async (id: string) => {
    const r = await api.get(`/gmail/messages/${id}`);
    setSelected(r.data);
  };

  const trash = async (id: string) => {
    await api.delete(`/gmail/messages/${id}`);
    setMessages(ms => ms.filter(m => m.id !== id));
    if (selected?.id === id) setSelected(null);
    showToast("Moved to trash");
  };

  const send = async () => {
    if (!form.to || !form.subject || !form.body) return;
    setSending(true);
    try {
      await api.post("/gmail/send", form);
      setCompose(false);
      setForm({ to: "", subject: "", body: "" });
      showToast("Email sent!");
    } finally { setSending(false); }
  };

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  };

  return (
    <div className="page">
      <div className="page__header" style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ flex: 1 }}>
          <h1 className="page__title">📧 Gmail</h1>
          <p className="page__sub">{messages.length} messages</p>
        </div>
        <button className="btn btn--primary btn--sm" onClick={() => setCompose(true)}>✏️ Compose</button>
      </div>

      {/* Search bar */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <input
          style={{ flex: 1, background: "var(--bg)", border: "1px solid var(--border)", color: "var(--text)", borderRadius: 8, padding: "7px 12px", fontSize: "0.85rem" }}
          placeholder="Search mail… (e.g. from:someone subject:hello)"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => e.key === "Enter" && loadMessages(query)}
        />
        <button className="btn btn--primary btn--sm" onClick={() => loadMessages(query)}>Search</button>
      </div>

      <div style={{ display: "flex", gap: 16, minHeight: 500 }}>
        {/* Message list */}
        <div style={{ flex: selected ? "0 0 360px" : "1", overflow: "auto" }}>
          {loading ? <div className="loading">Loading…</div> : messages.length === 0 ? (
            <div className="empty">No messages found.</div>
          ) : (
            <div style={{ border: "1px solid var(--border)", borderRadius: "var(--radius)", overflow: "hidden" }}>
              {messages.map((m, i) => (
                <div
                  key={m.id}
                  onClick={() => openMessage(m.id)}
                  style={{
                    padding: "12px 14px",
                    borderBottom: i < messages.length - 1 ? "1px solid var(--border)" : "none",
                    cursor: "pointer",
                    background: selected?.id === m.id ? "rgba(79,142,247,0.08)" : "var(--card)",
                    borderLeft: isUnread(m) ? "3px solid var(--accent)" : "3px solid transparent",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                    <span style={{ fontWeight: isUnread(m) ? 700 : 400, fontSize: "0.85rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 200 }}>
                      {m.from.split("<")[0].trim() || m.from}
                    </span>
                    <span style={{ fontSize: "0.72rem", color: "var(--text-dim)", whiteSpace: "nowrap" }}>{fmtDate(m.date)}</span>
                  </div>
                  <div style={{ fontSize: "0.82rem", fontWeight: isUnread(m) ? 600 : 400, marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {m.subject || "(no subject)"}
                  </div>
                  <div style={{ fontSize: "0.75rem", color: "var(--text-dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {m.snippet}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Message detail */}
        {selected && (
          <div className="card" style={{ flex: 1, overflow: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
              <div>
                <h2 style={{ fontSize: "1rem", fontWeight: 700, marginBottom: 6 }}>{selected.subject}</h2>
                <div style={{ fontSize: "0.8rem", color: "var(--text-dim)" }}>From: {selected.from}</div>
                <div style={{ fontSize: "0.8rem", color: "var(--text-dim)" }}>To: {selected.to}</div>
                <div style={{ fontSize: "0.8rem", color: "var(--text-dim)" }}>{selected.date}</div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn btn--ghost btn--sm" onClick={() => { setForm({ to: selected.from.match(/<(.+)>/)?.[1] || selected.from, subject: `Re: ${selected.subject}`, body: "" }); setCompose(true); }}>
                  ↩ Reply
                </button>
                <button className="btn btn--danger btn--sm" onClick={() => trash(selected.id)}>🗑</button>
                <button className="btn btn--ghost btn--sm" onClick={() => setSelected(null)}>✕</button>
              </div>
            </div>
            <hr style={{ borderColor: "var(--border)", marginBottom: 16 }} />
            <pre style={{ fontFamily: "inherit", fontSize: "0.85rem", lineHeight: 1.6, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
              {selected.body}
            </pre>
          </div>
        )}
      </div>

      {/* Compose modal */}
      {compose && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div className="card" style={{ width: "min(520px, 95vw)", display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h2 style={{ fontSize: "1rem", fontWeight: 700 }}>New Email</h2>
              <button className="btn btn--ghost btn--sm" onClick={() => setCompose(false)}>✕</button>
            </div>
            <div className="form-group">
              <label>To</label>
              <input value={form.to} onChange={e => setForm(f => ({ ...f, to: e.target.value }))} placeholder="recipient@example.com" />
            </div>
            <div className="form-group">
              <label>Subject</label>
              <input value={form.subject} onChange={e => setForm(f => ({ ...f, subject: e.target.value }))} placeholder="Subject" />
            </div>
            <div className="form-group">
              <label>Message</label>
              <textarea rows={8} value={form.body} onChange={e => setForm(f => ({ ...f, body: e.target.value }))} placeholder="Write your message…" />
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button className="btn btn--ghost btn--sm" onClick={() => setCompose(false)}>Cancel</button>
              <button className="btn btn--primary btn--sm" onClick={send} disabled={sending}>
                {sending ? "Sending…" : "📤 Send"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div style={{ position: "fixed", bottom: 24, right: 24, background: "var(--green)", color: "#fff", padding: "10px 18px", borderRadius: 8, fontWeight: 600, fontSize: "0.85rem", zIndex: 300 }}>
          {toast}
        </div>
      )}
    </div>
  );
}
