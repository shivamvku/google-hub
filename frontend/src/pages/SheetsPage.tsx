import { useEffect, useState } from "react";
import api from "../api";

interface SheetFile { id: string; name: string; modifiedTime: string; }

export default function SheetsPage() {
  const [sheets, setSheets]   = useState<SheetFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<SheetFile | null>(null);
  const [values, setValues]   = useState<string[][]>([]);
  const [range, setRange]     = useState("Sheet1");
  const [loadingData, setLoadingData] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [toast, setToast]     = useState("");
  const [editCell, setEditCell] = useState<{ r: number; c: number; val: string } | null>(null);

  const load = () => {
    setLoading(true);
    api.get("/sheets/list").then(r => setSheets(r.data)).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const openSheet = (s: SheetFile) => {
    setSelected(s);
    loadRange(s.id, range);
  };

  const loadRange = (id: string, r: string) => {
    setLoadingData(true);
    api.get(`/sheets/${id}/values?range=${encodeURIComponent(r)}`)
      .then(res => setValues(res.data.values || []))
      .finally(() => setLoadingData(false));
  };

  const createSheet = async () => {
    if (!newTitle.trim()) return;
    const r = await api.post("/sheets/create", { title: newTitle });
    setNewTitle("");
    load();
    showToast(`Created "${r.data.title}"`);
  };

  const saveCell = async () => {
    if (!editCell || !selected) return;
    const col = String.fromCharCode(65 + editCell.c);
    const cellRange = `${range.split("!")[0] || "Sheet1"}!${col}${editCell.r + 1}`;
    await api.post(`/sheets/${selected.id}/values`, {
      range: cellRange,
      values: [[editCell.val]],
    });
    const newValues = values.map((row, ri) =>
      row.map((cell, ci) => ri === editCell.r && ci === editCell.c ? editCell.val : cell)
    );
    setValues(newValues);
    setEditCell(null);
    showToast("Cell updated");
  };

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(""), 3000); };

  const maxCols = values.reduce((m, r) => Math.max(m, r.length), 0);

  return (
    <div className="page">
      <div className="page__header" style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div style={{ flex: 1 }}>
          <h1 className="page__title">📊 Google Sheets</h1>
          <p className="page__sub">{sheets.length} spreadsheets</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            style={{ background: "var(--bg)", border: "1px solid var(--border)", color: "var(--text)", borderRadius: 8, padding: "6px 10px", fontSize: "0.85rem" }}
            placeholder="New spreadsheet name…"
            value={newTitle}
            onChange={e => setNewTitle(e.target.value)}
            onKeyDown={e => e.key === "Enter" && createSheet()}
          />
          <button className="btn btn--primary btn--sm" onClick={createSheet}>+ Create</button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 16 }}>
        {/* File list */}
        <div style={{ width: 240, flexShrink: 0 }}>
          {loading ? <div className="loading">Loading…</div> : sheets.length === 0 ? (
            <div className="empty">No spreadsheets found.</div>
          ) : (
            <div style={{ border: "1px solid var(--border)", borderRadius: "var(--radius)", overflow: "hidden" }}>
              {sheets.map((s, i) => (
                <div
                  key={s.id}
                  onClick={() => openSheet(s)}
                  style={{
                    padding: "10px 14px",
                    cursor: "pointer",
                    background: selected?.id === s.id ? "rgba(79,142,247,0.08)" : "var(--card)",
                    borderBottom: i < sheets.length - 1 ? "1px solid var(--border)" : "none",
                    borderLeft: selected?.id === s.id ? "3px solid var(--accent)" : "3px solid transparent",
                  }}
                >
                  <div style={{ fontWeight: 500, fontSize: "0.85rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>📊 {s.name}</div>
                  <div style={{ fontSize: "0.72rem", color: "var(--text-dim)", marginTop: 2 }}>
                    {new Date(s.modifiedTime).toLocaleDateString()}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Sheet data */}
        {selected && (
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", gap: 8, marginBottom: 12, alignItems: "center" }}>
              <span style={{ fontWeight: 600 }}>{selected.name}</span>
              <input
                style={{ background: "var(--bg)", border: "1px solid var(--border)", color: "var(--text)", borderRadius: 8, padding: "5px 10px", fontSize: "0.82rem", width: 140 }}
                value={range}
                onChange={e => setRange(e.target.value)}
                onKeyDown={e => e.key === "Enter" && loadRange(selected.id, range)}
                placeholder="Range e.g. Sheet1!A1:E10"
              />
              <button className="btn btn--ghost btn--sm" onClick={() => loadRange(selected.id, range)}>Load</button>
              <a className="btn btn--ghost btn--sm" href={`https://docs.google.com/spreadsheets/d/${selected.id}`} target="_blank">↗ Open</a>
            </div>

            {loadingData ? <div className="loading">Loading data…</div> : values.length === 0 ? (
              <div className="empty">No data in this range.</div>
            ) : (
              <div className="tbl-wrap">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th style={{ width: 32, color: "var(--text-dim)" }}>#</th>
                      {Array.from({ length: maxCols }, (_, i) => (
                        <th key={i}>{String.fromCharCode(65 + i)}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {values.map((row, ri) => (
                      <tr key={ri}>
                        <td style={{ color: "var(--text-dim)", fontSize: "0.75rem" }}>{ri + 1}</td>
                        {Array.from({ length: maxCols }, (_, ci) => (
                          <td
                            key={ci}
                            onClick={() => setEditCell({ r: ri, c: ci, val: row[ci] || "" })}
                            style={{ cursor: "pointer", minWidth: 80 }}
                          >
                            {editCell?.r === ri && editCell?.c === ci ? (
                              <input
                                autoFocus
                                value={editCell.val}
                                onChange={e => setEditCell(ec => ec ? { ...ec, val: e.target.value } : null)}
                                onBlur={saveCell}
                                onKeyDown={e => { if (e.key === "Enter") saveCell(); if (e.key === "Escape") setEditCell(null); }}
                                style={{ background: "var(--bg2)", border: "1px solid var(--accent)", color: "var(--text)", borderRadius: 4, padding: "2px 6px", width: "100%", fontSize: "0.85rem" }}
                              />
                            ) : (
                              row[ci] || ""
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {toast && (
        <div style={{ position: "fixed", bottom: 24, right: 24, background: "var(--green)", color: "#fff", padding: "10px 18px", borderRadius: 8, fontWeight: 600, fontSize: "0.85rem", zIndex: 300 }}>
          {toast}
        </div>
      )}
    </div>
  );
}
