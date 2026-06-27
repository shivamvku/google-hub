/**
 * LandingPage — futuristic marketing page with MUI icons throughout.
 * configured=true  → show Sign In banner + Sign In CTA
 * configured=false → show only Get Started
 */
import FolderIcon        from "@mui/icons-material/Folder";
import EmailIcon         from "@mui/icons-material/Email";
import CalendarMonthIcon from "@mui/icons-material/CalendarMonth";
import TableChartIcon    from "@mui/icons-material/TableChart";
import DescriptionIcon   from "@mui/icons-material/Description";
import SmartDisplayIcon  from "@mui/icons-material/SmartDisplay";
import ArrowForwardIcon  from "@mui/icons-material/ArrowForward";
import SettingsIcon      from "@mui/icons-material/Settings";
import WavingHandIcon    from "@mui/icons-material/WavingHand";
import HubIcon           from "@mui/icons-material/Hub";

const API = import.meta.env.VITE_API_BASE || "http://localhost:8001";

const GOOGLE_SVG = (
  <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true" style={{ flexShrink: 0 }}>
    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
  </svg>
);

const FEATURES = [
  { Icon: FolderIcon,        name: "Drive",    desc: "Browse, upload, search and share files across your entire Drive." },
  { Icon: EmailIcon,         name: "Gmail",    desc: "Read, compose and manage emails without leaving the app." },
  { Icon: CalendarMonthIcon, name: "Calendar", desc: "View upcoming events, create new ones and invite attendees." },
  { Icon: TableChartIcon,    name: "Sheets",   desc: "Read and write spreadsheet data with full range support." },
  { Icon: DescriptionIcon,   name: "Docs",     desc: "Create and edit documents, insert text at any position." },
  { Icon: SmartDisplayIcon,  name: "YouTube",  desc: "Search videos, view your channel stats and uploaded videos." },
];

const STEPS = [
  { n: "01", title: "Create a GCP project",    desc: "One click on Google Cloud Console." },
  { n: "02", title: "Enable 6 APIs at once",   desc: "A single batch-enable URL does all of them." },
  { n: "03", title: "Configure consent screen",desc: "Add your email as a test user." },
  { n: "04", title: "Download credentials",    desc: "Create an OAuth client, click Download JSON." },
  { n: "05", title: "Drop the file & sign in", desc: "Drag the JSON in — no copy-paste needed." },
];

interface Props { onGetStarted: () => void; configured: boolean; }

export default function LandingPage({ onGetStarted, configured }: Props) {
  const signIn = () => { window.location.href = `${API}/auth/login`; };

  return (
    <div className={`land${configured ? " land--returning" : ""}`}>

      {/* ── Returning user banner ─────────────────────────────── */}
      {configured && (
        <div className="land-return-banner" role="banner">
          <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <WavingHandIcon sx={{ fontSize: 18, color: "#eab308" }} />
            Welcome back — your Google Hub is ready.
          </span>
          <button className="land-btn land-btn--primary" onClick={signIn}>
            {GOOGLE_SVG} Sign In with Google
          </button>
        </div>
      )}

      {/* ── Nav ──────────────────────────────────────────────── */}
      <header className="land-nav">
        <div className="land-nav__brand">
          <span className="land-nav__orb" aria-hidden="true" />
          Google Hub
        </div>
        <nav className="land-nav__links" aria-label="Page sections">
          <a href="#features">Features</a>
          <a href="#how">How it works</a>
        </nav>
        <div className="land-nav__cta">
          {configured && (
            <button className="land-btn land-btn--ghost" onClick={signIn}>
              {GOOGLE_SVG} Sign In
            </button>
          )}
          <button className="land-btn land-btn--primary" onClick={configured ? onGetStarted : onGetStarted}>
            {configured
              ? <><SettingsIcon sx={{ fontSize: 16 }} /> Re-run Setup</>
              : <>Get Started <ArrowForwardIcon sx={{ fontSize: 16 }} /></>}
          </button>
        </div>
      </header>

      {/* ── Hero ─────────────────────────────────────────────── */}
      <section className="land-hero" aria-label="Hero">
        <div className="land-blob land-blob--blue"  aria-hidden="true" />
        <div className="land-blob land-blob--purple" aria-hidden="true" />

        <div className="land-hero__content">
          <div className="land-hero__badge">Your Google workspace, unified</div>
          <h1 className="land-hero__h1">
            One app.<br />
            <span className="land-hero__gradient">All of Google.</span>
          </h1>
          <p className="land-hero__sub">
            Drive, Gmail, Calendar, Sheets, Docs and YouTube — accessed through a
            single polished interface. Secured with per-user OAuth and encrypted token storage.
          </p>

          <div className="land-hero__actions">
            {configured ? (
              <>
                <button className="land-btn land-btn--primary land-btn--lg" onClick={signIn}>
                  {GOOGLE_SVG} Sign In with Google
                </button>
                <button className="land-btn land-btn--ghost land-btn--lg" onClick={onGetStarted}>
                  <SettingsIcon sx={{ fontSize: 18 }} /> Re-run Setup
                </button>
              </>
            ) : (
              <>
                <button className="land-btn land-btn--primary land-btn--lg" onClick={onGetStarted}>
                  Get Started — free <ArrowForwardIcon sx={{ fontSize: 18 }} />
                </button>
                <span className="land-hero__no-signin">
                  Already configured?{" "}
                  <button className="link-btn" onClick={onGetStarted}>Complete setup first →</button>
                </span>
              </>
            )}
          </div>

          <div className="land-hero__pills" aria-label="Supported services">
            {FEATURES.map(({ Icon, name }) => (
              <span key={name} className="land-pill">
                <Icon sx={{ fontSize: 13 }} /> {name}
              </span>
            ))}
          </div>
        </div>

        {/* Floating mockup */}
        <div className="land-hero__mockup" aria-hidden="true">
          <div className="mockup-card">
            <div className="mockup-topbar">
              <div className="mockup-dots"><span /><span /><span /></div>
              <div className="mockup-title">Google Hub</div>
            </div>
            <div className="mockup-body">
              <div className="mockup-sidebar">
                {FEATURES.map(({ Icon, name }) => (
                  <div key={name} className="mockup-nav-item">
                    <Icon sx={{ fontSize: 13 }} /><span>{name}</span>
                  </div>
                ))}
              </div>
              <div className="mockup-content">
                {[90, 70, 85, 60, 75, 50].map((w, i) => (
                  <div key={i} className="mockup-row">
                    <div className="mockup-row__dot" />
                    <div className="mockup-row__line" style={{ width: `${w}%` }} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Features ─────────────────────────────────────────── */}
      <section className="land-section" id="features">
        <div className="land-section__inner">
          <div className="land-label">Features</div>
          <h2 className="land-section__h2">Everything you use at Google,<br />in one place</h2>
          <p className="land-section__sub">No switching between tabs. No re-authentication. Just your data, instantly.</p>
          <div className="land-features">
            {FEATURES.map(({ Icon, name, desc }) => (
              <div key={name} className="land-feature-card">
                <div className="land-feature-card__icon">
                  <Icon sx={{ fontSize: 28, color: "var(--accent)" }} />
                </div>
                <h3 className="land-feature-card__name">{name}</h3>
                <p className="land-feature-card__desc">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ─────────────────────────────────────── */}
      <section className="land-section land-section--alt" id="how">
        <div className="land-section__inner">
          <div className="land-label">Setup</div>
          <h2 className="land-section__h2">Up and running in 5 steps</h2>
          <p className="land-section__sub">Each step is guided. Each link opens the exact right page.</p>
          <div className="land-steps">
            {STEPS.map((s, i) => (
              <div key={i} className="land-step">
                <div className="land-step__num">{s.n}</div>
                <div className="land-step__body">
                  <h3 className="land-step__title">{s.title}</h3>
                  <p className="land-step__desc">{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
          <div style={{ textAlign: "center", marginTop: 48 }}>
            {configured
              ? <button className="land-btn land-btn--primary land-btn--lg" onClick={signIn}>
                  {GOOGLE_SVG} Sign In with Google
                </button>
              : <button className="land-btn land-btn--primary land-btn--lg" onClick={onGetStarted}>
                  Start Setup Wizard <ArrowForwardIcon sx={{ fontSize: 18 }} />
                </button>
            }
          </div>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────── */}
      <footer className="land-footer">
        <div className="land-nav__brand">
          <HubIcon sx={{ fontSize: 20, color: "var(--accent)" }} /> Google Hub
        </div>
        <p className="land-footer__note">Open source · Self-hosted · Your data stays on your machine</p>
      </footer>

    </div>
  );
}
