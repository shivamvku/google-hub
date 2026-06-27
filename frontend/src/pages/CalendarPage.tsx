import { useEffect, useState } from "react";
import api from "../api";

interface CalEvent {
  id: string; title: string; start: string;
  end: string; description: string; location: string; link: string;
}
interface CalForm {
  title: string; start: string; end: string;
  description: string; location: string; attendees: string;
}

const fmtDT = (d: string) => {
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return d;
  return dt.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
};

const today = () => {
  const d = new Date();
  d.setSeconds(0, 0);
  return d.toISOString().slice(0, 16);
};
const hourLater = () => {
  const d = new Date(Date.now() + 3600000);
  d.setSeconds(0, 0);
  return d.toISOString().slice(0, 16);
};

export default function CalendarPage() {
  const [events, setEvents]   = useState<CalEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm]       = useState<CalForm>({ title: "", start: today(), end: hourLater(), description: "", location: "", attendees: "" });
  const [saving, setSaving]   = useState(false);
  const [toast, setToast]     = useState("");

  const load = () => {
    setLoading(true);
    api.get("/calendar/events?days=60")
      .then(r => setEvents(r.data))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const create = async () => {
    if (!form.title || !form.start || !form.end) return;
    setSaving(true);
    try {
      await api.post("/calendar/events", {
        title: form.title,
        start: new Date(form.start).toISOString(),
        end:   new Date(form.end).toISOString(),
        description: form.description,
        location: form.location,
        attendees: form.attendees.split(",").map(s => s.trim()).filter(Boolean),
      });
      setShowForm(false);
      setForm({ title: "", start: today(), end: hourLater(), description: "", location: "", attendees: "" });
      load();
      showToast("Event created!");
    } finally { setSaving(false); }
  };

  const del = async (id: string) => {
    if (!confirm("Delete this event?")) return;
    await api.delete(`/calendar/events/${id}`);
    setEvents(ev => ev.filter(e => e.id !== id));
    showToast("Event deleted");
  };

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(""), 3000); };

  // Group events by date
  const grouped: Record<string, CalEvent[]> = {};
  events.forEach(e => {
    const day = new Date(e.start).toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" });
    grouped[day] = [...(grouped[day] || []), e];
  });

  return (
    <div className="page">
      <div className="page__header" style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ flex: 1 }}>
          <h1 className="page__title">📅 Calendar</h1>
          <p className="page__sub">Upcoming {events.length} events (next 60 days)</p>
        </div>
        <button className="btn btn--primary btn--sm" onClick={() => setShowForm(true)}>+ New Event</button>
      </div>

      {loading ? <div className="loading">Loading…</div> : events.length === 0 ? (
        <div className="empty">No upcoming events.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {Object.entries(grouped).map(([day, dayEvents]) => (
            <div key={day}>
              <div style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>
                {day}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {dayEvents.map(e => (
                  <div key={e.id} className="card" style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
                    <div style={{ width: 4, borderRadius: 4, alignSelf: "stretch", background: "var(--accent)", flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, marginBottom: 3 }}>{e.title}</div>
                      <div style={{ fontSize: "0.8rem", color: "var(--text-dim)" }}>
                        {fmtDT(e.start)} — {fmtDT(e.end)}
                      </div>
                      {e.location && <div style={{ fontSize: "0.8rem", color: "var(--text-dim)", marginTop: 2 }}>📍 {e.location}</div>}
                      {e.description && <div style={{ fontSize: "0.8rem", marginTop: 4, color: "var(--text-dim)" }}>{e.description}</div>}
                    </div>
                    <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                      {e.link && <a className="btn btn--ghost btn--sm" href={e.link} target="_blank">Open</a>}
                      <button className="btn btn--danger btn--sm" onClick={() => del(e.id)}>🗑</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create event modal */}
      {showForm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div className="card" style={{ width: "min(500px, 100%)", display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <h2 style={{ fontSize: "1rem", fontWeight: 700 }}>New Event</h2>
              <button className="btn btn--ghost btn--sm" onClick={() => setShowForm(false)}>✕</button>
            </div>
            <div className="form-group">
              <label>Title *</label>
              <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Event title" />
            </div>
            <div style={{ display: "flex", gap: 12 }}>
              <div className="form-group" style={{ flex: 1 }}>
                <label>Start *</label>
                <input type="datetime-local" value={form.start} onChange={e => setForm(f => ({ ...f, start: e.target.value }))} />
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label>End *</label>
                <input type="datetime-local" value={form.end} onChange={e => setForm(f => ({ ...f, end: e.target.value }))} />
              </div>
            </div>
            <div className="form-group">
              <label>Location</label>
              <input value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} placeholder="Optional location" />
            </div>
            <div className="form-group">
              <label>Description</label>
              <textarea rows={3} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Optional description" />
            </div>
            <div className="form-group">
              <label>Attendees (comma-separated emails)</label>
              <input value={form.attendees} onChange={e => setForm(f => ({ ...f, attendees: e.target.value }))} placeholder="a@example.com, b@example.com" />
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button className="btn btn--ghost btn--sm" onClick={() => setShowForm(false)}>Cancel</button>
              <button className="btn btn--primary btn--sm" onClick={create} disabled={saving}>
                {saving ? "Creating…" : "✔ Create Event"}
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
