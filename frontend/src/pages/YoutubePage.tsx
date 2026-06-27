import { useEffect, useState } from "react";
import api from "../api";

interface Video {
  videoId: string; title: string; channel: string;
  published: string; thumbnail: string; description: string; url: string;
}
interface Channel {
  id: string; title: string; description: string;
  subscribers: string; views: string; videos: string; thumbnail: string;
}
interface VideoStats {
  id: string; title: string; views: string; likes: string; comments: string; published: string;
}

const fmt = (n: string) => {
  const num = parseInt(n || "0");
  if (num >= 1e6) return `${(num / 1e6).toFixed(1)}M`;
  if (num >= 1e3) return `${(num / 1e3).toFixed(1)}K`;
  return n;
};

export default function YoutubePage() {
  const [query, setQuery]       = useState("");
  const [results, setResults]   = useState<Video[]>([]);
  const [loading, setLoading]   = useState(false);
  const [channel, setChannel]   = useState<Channel | null>(null);
  const [myVideos, setMyVideos] = useState<Video[]>([]);
  const [tab, setTab]           = useState<"search" | "channel" | "my-videos">("search");
  const [stats, setStats]       = useState<VideoStats | null>(null);
  const [statsId, setStatsId]   = useState("");

  useEffect(() => {
    api.get("/youtube/channel").then(r => { if (!r.data.error) setChannel(r.data); }).catch(() => {});
    api.get("/youtube/my-videos").then(r => setMyVideos(r.data)).catch(() => {});
  }, []);

  const search = async () => {
    if (!query.trim()) return;
    setLoading(true);
    const r = await api.get(`/youtube/search?q=${encodeURIComponent(query)}&max_results=12`);
    setResults(r.data);
    setLoading(false);
  };

  const loadStats = async (id: string) => {
    const r = await api.get(`/youtube/video/${id}/stats`);
    setStats(r.data);
  };

  const tabs = [
    { key: "search",    label: "🔍 Search" },
    { key: "channel",   label: "📺 My Channel" },
    { key: "my-videos", label: "🎬 My Videos" },
  ] as const;

  return (
    <div className="page">
      <div className="page__header">
        <h1 className="page__title">▶️ YouTube</h1>
      </div>

      {/* Tab bar */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20, borderBottom: "1px solid var(--border)", paddingBottom: 12 }}>
        {tabs.map(t => (
          <button
            key={t.key}
            className={`btn btn--sm ${tab === t.key ? "btn--primary" : "btn--ghost"}`}
            onClick={() => setTab(t.key)}
          >{t.label}</button>
        ))}
      </div>

      {/* Search tab */}
      {tab === "search" && (
        <>
          <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
            <input
              style={{ flex: 1, background: "var(--bg)", border: "1px solid var(--border)", color: "var(--text)", borderRadius: 8, padding: "8px 12px", fontSize: "0.875rem" }}
              placeholder="Search YouTube…"
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => e.key === "Enter" && search()}
            />
            <button className="btn btn--primary" onClick={search}>Search</button>
          </div>
          {loading ? <div className="loading">Searching…</div> : results.length === 0 ? (
            <div className="empty">Enter a query and press Search.</div>
          ) : (
            <div className="card-grid">
              {results.map(v => (
                <div key={v.videoId} className="card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <a href={v.url} target="_blank">
                    <img className="thumb" src={v.thumbnail} alt={v.title} loading="lazy" />
                  </a>
                  <div>
                    <div className="card__title">{v.title}</div>
                    <div className="card__meta">{v.channel} · {new Date(v.published).getFullYear()}</div>
                    {v.description && <div style={{ fontSize: "0.75rem", color: "var(--text-dim)", marginTop: 4 }}>{v.description}</div>}
                  </div>
                  <div className="card__actions">
                    <a className="btn btn--primary btn--sm" href={v.url} target="_blank">▶ Watch</a>
                    <button className="btn btn--ghost btn--sm" onClick={() => { loadStats(v.videoId); setStats(null); setStatsId(v.videoId); }}>📊 Stats</button>
                  </div>
                  {stats && statsId === v.videoId && (
                    <div style={{ background: "var(--bg)", borderRadius: 8, padding: 10, fontSize: "0.8rem" }}>
                      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                        <span>👁 {fmt(stats.views)} views</span>
                        <span>👍 {fmt(stats.likes)} likes</span>
                        <span>💬 {fmt(stats.comments)} comments</span>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Channel tab */}
      {tab === "channel" && (
        channel ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div className="card" style={{ display: "flex", gap: 20, alignItems: "center", flexWrap: "wrap" }}>
              <img src={channel.thumbnail} alt={channel.title} style={{ width: 80, height: 80, borderRadius: "50%", objectFit: "cover" }} />
              <div style={{ flex: 1 }}>
                <h2 style={{ fontSize: "1.2rem", fontWeight: 700, marginBottom: 6 }}>{channel.title}</h2>
                <p style={{ fontSize: "0.85rem", color: "var(--text-dim)", marginBottom: 12 }}>{channel.description?.slice(0, 200)}{(channel.description?.length || 0) > 200 ? "…" : ""}</p>
                <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
                  <div><span style={{ fontSize: "1.3rem", fontWeight: 700 }}>{fmt(channel.subscribers)}</span><div style={{ fontSize: "0.75rem", color: "var(--text-dim)" }}>Subscribers</div></div>
                  <div><span style={{ fontSize: "1.3rem", fontWeight: 700 }}>{fmt(channel.views)}</span><div style={{ fontSize: "0.75rem", color: "var(--text-dim)" }}>Total Views</div></div>
                  <div><span style={{ fontSize: "1.3rem", fontWeight: 700 }}>{fmt(channel.videos)}</span><div style={{ fontSize: "0.75rem", color: "var(--text-dim)" }}>Videos</div></div>
                </div>
              </div>
              <a className="btn btn--primary btn--sm" href={`https://www.youtube.com/channel/${channel.id}`} target="_blank">View Channel</a>
            </div>
          </div>
        ) : (
          <div className="empty">No YouTube channel found for this account.</div>
        )
      )}

      {/* My Videos tab */}
      {tab === "my-videos" && (
        myVideos.length === 0 ? (
          <div className="empty">No uploaded videos found.</div>
        ) : (
          <div className="card-grid">
            {myVideos.map(v => (
              <div key={v.videoId} className="card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <a href={v.url} target="_blank">
                  <img className="thumb" src={v.thumbnail} alt={v.title} loading="lazy" />
                </a>
                <div>
                  <div className="card__title">{v.title}</div>
                  <div className="card__meta">{new Date(v.published).toLocaleDateString()}</div>
                </div>
                <div className="card__actions">
                  <a className="btn btn--primary btn--sm" href={v.url} target="_blank">▶ Watch</a>
                  <button className="btn btn--ghost btn--sm" onClick={() => loadStats(v.videoId)}>📊 Stats</button>
                </div>
                {stats && stats.id === v.videoId && (
                  <div style={{ background: "var(--bg)", borderRadius: 8, padding: 10, fontSize: "0.8rem" }}>
                    <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                      <span>👁 {fmt(stats.views)}</span>
                      <span>👍 {fmt(stats.likes)}</span>
                      <span>💬 {fmt(stats.comments)}</span>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}
