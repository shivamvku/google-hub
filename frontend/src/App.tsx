import { useCallback, useEffect, useState } from "react";
import { Routes, Route, NavLink, useLocation } from "react-router-dom";
import FolderIcon        from "@mui/icons-material/Folder";
import EmailIcon         from "@mui/icons-material/Email";
import CalendarMonthIcon from "@mui/icons-material/CalendarMonth";
import TableChartIcon    from "@mui/icons-material/TableChart";
import DescriptionIcon   from "@mui/icons-material/Description";
import SmartDisplayIcon  from "@mui/icons-material/SmartDisplay";
import MenuIcon          from "@mui/icons-material/Menu";
import LogoutIcon        from "@mui/icons-material/Logout";
import HubIcon           from "@mui/icons-material/Hub";
import BlockIcon         from "@mui/icons-material/Block";
import OpenInNewIcon     from "@mui/icons-material/OpenInNew";
import ArrowForwardIcon  from "@mui/icons-material/ArrowForward";

import api from "./api";
import DrivePage    from "./pages/DrivePage";
import GmailPage    from "./pages/GmailPage";
import CalendarPage from "./pages/CalendarPage";
import SheetsPage   from "./pages/SheetsPage";
import DocsPage     from "./pages/DocsPage";
import YoutubePage  from "./pages/YoutubePage";
import LandingPage  from "./pages/LandingPage";
import FirstRunPage from "./pages/FirstRunPage";
import SetupPage, { type PreflightResult } from "./pages/SetupPage";

const API = import.meta.env.VITE_API_BASE || "http://localhost:8001";

interface User { email: string; name: string; picture: string; }
interface AuthError { error: string; message: string; }

type AppState = "loading" | "landing" | "setup-wizard" | "preflight-check" | "setup-error" | "auth-error" | "ready";

const NAV = [
  { path: "/",         Icon: FolderIcon,        label: "Drive"    },
  { path: "/gmail",    Icon: EmailIcon,          label: "Gmail"    },
  { path: "/calendar", Icon: CalendarMonthIcon,  label: "Calendar" },
  { path: "/sheets",   Icon: TableChartIcon,     label: "Sheets"   },
  { path: "/docs",     Icon: DescriptionIcon,    label: "Docs"     },
  { path: "/youtube",  Icon: SmartDisplayIcon,   label: "YouTube"  },
];

// ── Auth error page ───────────────────────────────────────────────────────────
function AuthErrorPage({ err, onRetry, onSetup }: {
  err: AuthError; onRetry: () => void; onSetup: () => void;
}) {
  const isAccessDenied = err.error === "access_denied";
  const projectParam   = ""; // user knows their project

  return (
    <div className="wiz-page">
      <div className="wiz-done" style={{ borderColor: "rgba(239,68,68,0.25)", boxShadow: "0 0 60px rgba(239,68,68,0.06)" }}>
        <BlockIcon sx={{ fontSize: 56, color: "var(--red)" }} />
        <h2 className="wiz-done__title" style={{ color: "var(--red)" }}>
          {isAccessDenied ? "Access Blocked" : "Sign In Failed"}
        </h2>

        {isAccessDenied ? (
          <>
            <p className="wiz-done__sub">
              Your Google account is not added as a <strong>Test user</strong> in the Google Auth Platform.
              This is required while your app is in Testing mode.
            </p>

            <div className="auth-error-fix">
              <div className="auth-error-fix__step">
                <span className="auth-error-fix__num">1</span>
                <span>Open Google Auth Platform → Audience</span>
                <a
                  href="https://console.cloud.google.com/auth/audience"
                  target="_blank" rel="noreferrer"
                  className="wiz-btn wiz-btn--outline"
                  style={{ marginLeft: "auto", fontSize: "0.78rem", padding: "5px 10px" }}
                >
                  <OpenInNewIcon sx={{ fontSize: 13 }} /> Open Audience
                </a>
              </div>
              <div className="auth-error-fix__step">
                <span className="auth-error-fix__num">2</span>
                <span>Scroll to <strong>Test users</strong> → click <strong>Add users</strong></span>
              </div>
              <div className="auth-error-fix__step">
                <span className="auth-error-fix__num">3</span>
                <span>Enter your Google email and click <strong>Save</strong></span>
              </div>
              <div className="auth-error-fix__step">
                <span className="auth-error-fix__num">4</span>
                <span>Come back and click <strong>Try Again</strong></span>
              </div>
            </div>
          </>
        ) : (
          <p className="wiz-done__sub">
            {err.message || "An error occurred during sign in. Please try again."}
          </p>
        )}

        <div style={{ display: "flex", gap: 10, marginTop: 8, flexWrap: "wrap", justifyContent: "center" }}>
          <button className="wiz-btn wiz-btn--primary" onClick={onRetry}>
            Try Again <ArrowForwardIcon sx={{ fontSize: 16 }} />
          </button>
          {isAccessDenied && (
            <button className="wiz-btn wiz-btn--ghost" onClick={onSetup}>
              Back to Setup
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────────
export default function App() {
  const [appState,    setAppState]    = useState<AppState>("loading");
  const [user,        setUser]        = useState<User | null>(null);
  const [preflight,   setPreflight]   = useState<PreflightResult | null>(null);
  const [configured,  setConfigured]  = useState(false);
  const [authError,   setAuthError]   = useState<AuthError | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();

  useEffect(() => { setSidebarOpen(false); }, [location.pathname]);

  const bootApp = useCallback(async () => {
    setAppState("loading");
    try {
      const { data: setup } = await api.get("/setup/status");
      setConfigured(!!setup.configured);
      if (!setup.configured) { setAppState("landing"); return; }

      let authData: any;
      try {
        const { data } = await api.get("/auth/status");
        authData = data;
      } catch { setAppState("landing"); return; }

      if (!authData.authenticated) { setAppState("landing"); return; }
      setUser(authData);

      setAppState("preflight-check");
      try {
        const { data: pf } = await api.get<PreflightResult>("/preflight");
        setPreflight(pf);
        setAppState(pf.all_ok ? "ready" : "setup-error");
      } catch { setAppState("ready"); }
    } catch { setAppState("landing"); }
  }, []);

  useEffect(() => { bootApp(); }, [bootApp]);

  // Handle OAuth callback redirects — both success and error
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get("auth") === "success") {
      window.history.replaceState({}, "", "/");
      bootApp();
    } else if (params.get("auth_error")) {
      window.history.replaceState({}, "", "/");
      setAuthError({
        error:   params.get("auth_error") || "unknown_error",
        message: decodeURIComponent(params.get("auth_error_msg") || ""),
      });
      setAppState("auth-error");
    }
  }, [location.search, bootApp]);

  const handleLogout = useCallback(async () => {
    try { await api.post("/auth/logout"); } catch { }
    setUser(null); setPreflight(null); setAppState("landing");
  }, []);

  const retryPreflight = useCallback(async () => {
    setAppState("preflight-check");
    try {
      const { data: pf } = await api.get<PreflightResult>("/preflight");
      setPreflight(pf);
      setAppState(pf.all_ok ? "ready" : "setup-error");
    } catch { setAppState("ready"); }
  }, []);

  // ── Render states ─────────────────────────────────────────────────────────
  if (appState === "loading" || appState === "preflight-check")
    return <div className="loading">{appState === "preflight-check" ? "Checking permissions…" : "Loading…"}</div>;

  if (appState === "landing")
    return <LandingPage configured={configured} onGetStarted={() => setAppState("setup-wizard")} />;

  if (appState === "setup-wizard")
    return <FirstRunPage onConfigured={() => { setConfigured(true); setAppState("landing"); }} />;

  if (appState === "auth-error" && authError)
    return (
      <AuthErrorPage
        err={authError}
        onRetry={() => { window.location.href = `${API}/auth/login`; }}
        onSetup={() => setAppState("setup-wizard")}
      />
    );

  if (appState === "setup-error" && preflight)
    return <SetupPage preflight={preflight} onRetry={retryPreflight} />;

  if (!user)
    return <LandingPage configured={configured} onGetStarted={() => setAppState("setup-wizard")} />;

  // ── Full app shell ────────────────────────────────────────────────────────
  const initials  = user.name?.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase() || "?";
  const pageTitle = NAV.find(n => n.path === location.pathname)?.label || "Google Hub";

  return (
    <div className="hub-layout">
      <div className={`overlay ${sidebarOpen ? "show" : ""}`}
        onClick={() => setSidebarOpen(false)} aria-hidden="true" />

      <nav className={`hub-sidebar ${sidebarOpen ? "open" : ""}`} aria-label="Main navigation">
        <div className="sidebar__brand">
          <HubIcon sx={{ fontSize: 22, color: "var(--accent)" }} />
          Google Hub
        </div>
        <div className="sidebar__nav">
          {NAV.map(({ path, Icon, label }) => (
            <NavLink key={path} to={path} end={path === "/"}
              className={({ isActive }) => `sidebar__link${isActive ? " active" : ""}`}>
              <span className="sidebar__icon" aria-hidden="true">
                <Icon sx={{ fontSize: 18 }} />
              </span>
              {label}
            </NavLink>
          ))}
        </div>
        <div className="sidebar__footer">
          <button className="btn btn--ghost btn--sm" onClick={handleLogout}
            style={{ width: "100%", gap: 8 }}>
            <LogoutIcon sx={{ fontSize: 16 }} /> Logout
          </button>
        </div>
      </nav>

      <div className="hub-main">
        <header className="hub-topbar">
          <button className="hamburger" onClick={() => setSidebarOpen(o => !o)}
            aria-label="Toggle navigation">
            <MenuIcon sx={{ fontSize: 22 }} />
          </button>
          <span className="hub-topbar__title">{pageTitle}</span>
          <div className="hub-topbar__user">
            <span>{user.email}</span>
            <div className="hub-topbar__avatar" title={user.name}>
              {user.picture
                ? <img src={user.picture} alt={user.name} referrerPolicy="no-referrer" />
                : initials}
            </div>
          </div>
        </header>

        <Routes>
          <Route path="/"         element={<DrivePage />} />
          <Route path="/gmail"    element={<GmailPage />} />
          <Route path="/calendar" element={<CalendarPage />} />
          <Route path="/sheets"   element={<SheetsPage />} />
          <Route path="/docs"     element={<DocsPage />} />
          <Route path="/youtube"  element={<YoutubePage />} />
        </Routes>
      </div>
    </div>
  );
}

