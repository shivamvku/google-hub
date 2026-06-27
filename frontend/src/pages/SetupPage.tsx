import { useState } from "react";
import FolderIcon        from "@mui/icons-material/Folder";
import EmailIcon         from "@mui/icons-material/Email";
import CalendarMonthIcon from "@mui/icons-material/CalendarMonth";
import TableChartIcon    from "@mui/icons-material/TableChart";
import DescriptionIcon   from "@mui/icons-material/Description";
import SmartDisplayIcon  from "@mui/icons-material/SmartDisplay";
import CheckCircleIcon   from "@mui/icons-material/CheckCircle";
import ErrorIcon         from "@mui/icons-material/Error";
import ExpandMoreIcon    from "@mui/icons-material/ExpandMore";
import ExpandLessIcon    from "@mui/icons-material/ExpandLess";
import RefreshIcon       from "@mui/icons-material/Refresh";
import LogoutIcon        from "@mui/icons-material/Logout";
import LinkIcon          from "@mui/icons-material/Link";
import WarningAmberIcon  from "@mui/icons-material/WarningAmber";
import api from "../api";

export interface ServiceStatus { ok: boolean; error: string | null; }
export interface PreflightResult { all_ok: boolean; services: Record<string, ServiceStatus>; }

interface Props { preflight: PreflightResult; onRetry: () => void; }

const SERVICE_META: Record<string, { label: string; Icon: React.ElementType; api: string; steps: string[] }> = {
  drive: {
    label: "Google Drive", Icon: FolderIcon, api: "Google Drive API",
    steps: [
      'Go to Google Cloud Console → "APIs & Services" → "Library".',
      'Search for "Google Drive API" and click Enable.',
      'Ensure scope "https://www.googleapis.com/auth/drive" is in the OAuth consent screen.',
      'If in Testing mode, add your email under "Test users".',
      'Log out and sign in again.',
    ],
  },
  gmail: {
    label: "Gmail", Icon: EmailIcon, api: "Gmail API",
    steps: [
      'Go to Google Cloud Console → "APIs & Services" → "Library".',
      'Search for "Gmail API" and click Enable.',
      'Add scope "https://www.googleapis.com/auth/gmail.modify" to the consent screen.',
      'Add yourself as a Test user during development.',
      'Log out and sign in again.',
    ],
  },
  calendar: {
    label: "Google Calendar", Icon: CalendarMonthIcon, api: "Google Calendar API",
    steps: [
      'Go to Google Cloud Console → "APIs & Services" → "Library".',
      'Search for "Google Calendar API" and click Enable.',
      'Add scope "https://www.googleapis.com/auth/calendar" to the consent screen.',
      'Verify your email is in the Test users list.',
      'Log out and sign in again.',
    ],
  },
  sheets: {
    label: "Google Sheets", Icon: TableChartIcon, api: "Google Sheets API",
    steps: [
      'Go to Google Cloud Console → "APIs & Services" → "Library".',
      'Search for "Google Sheets API" and click Enable.',
      'Add scope "https://www.googleapis.com/auth/spreadsheets" to the consent screen.',
      'Log out and sign in again.',
    ],
  },
  docs: {
    label: "Google Docs", Icon: DescriptionIcon, api: "Google Docs API",
    steps: [
      'Go to Google Cloud Console → "APIs & Services" → "Library".',
      'Search for "Google Docs API" and click Enable.',
      'Add scope "https://www.googleapis.com/auth/documents" to the consent screen.',
      'Log out and sign in again.',
    ],
  },
  youtube: {
    label: "YouTube", Icon: SmartDisplayIcon, api: "YouTube Data API v3",
    steps: [
      'Go to Google Cloud Console → "APIs & Services" → "Library".',
      'Search for "YouTube Data API v3" and click Enable.',
      'Add scope "https://www.googleapis.com/auth/youtube" to the consent screen.',
      'YouTube requires project verification for full quota. Test users work in development.',
      'Log out and sign in again.',
    ],
  },
};

const COMMON_STEPS = [
  { title: "Open Google Cloud Console", detail: "Select your project (or create one).", link: "https://console.cloud.google.com", linkLabel: "console.cloud.google.com" },
  { title: "Confirm OAuth App Type", detail: 'OAuth 2.0 Client ID must be "Web application" with redirect URI http://localhost:8001/auth/callback', link: "https://console.cloud.google.com/apis/credentials", linkLabel: "Go to Credentials" },
  { title: "OAuth Consent Screen Status", detail: 'If in "Testing" status, only Test users can log in. Add your email as a Test user.', link: "https://console.cloud.google.com/apis/credentials/consent", linkLabel: "Go to Consent Screen" },
];

function ServiceRow({ name, status }: { name: string; status: ServiceStatus }) {
  const [open, setOpen] = useState(false);
  const meta = SERVICE_META[name];
  if (!meta) return null;
  const { Icon } = meta;
  return (
    <div className={`setup-service ${status.ok ? "setup-service--ok" : "setup-service--fail"}`}>
      <button className="setup-service__header"
        onClick={() => !status.ok && setOpen(o => !o)}
        aria-expanded={open} disabled={status.ok}>
        <span className="setup-service__icon"><Icon sx={{ fontSize: 18 }} /></span>
        <span className="setup-service__label">{meta.label}</span>
        <span className={`setup-service__badge ${status.ok ? "badge--ok" : "badge--fail"}`}>
          {status.ok
            ? <><CheckCircleIcon sx={{ fontSize: 15 }} /> OK</>
            : <><ErrorIcon sx={{ fontSize: 15 }} /> Not working</>}
        </span>
        {!status.ok && <span className="setup-service__chevron">
          {open ? <ExpandLessIcon sx={{ fontSize: 16 }} /> : <ExpandMoreIcon sx={{ fontSize: 16 }} />}
        </span>}
      </button>
      {!status.ok && open && (
        <div className="setup-service__body">
          {status.error && <p className="setup-service__error"><strong>Error:</strong> {status.error}</p>}
          <p className="setup-service__api-name">Required API: <code>{meta.api}</code></p>
          <ol className="setup-steps">{meta.steps.map((s, i) => <li key={i}>{s}</li>)}</ol>
        </div>
      )}
    </div>
  );
}

export default function SetupPage({ preflight, onRetry }: Props) {
  const [loading, setLoading] = useState(false);
  const [commonOpen, setCommonOpen] = useState(false);
  const failing = Object.entries(preflight.services).filter(([, s]) => !s.ok);
  const passing = Object.entries(preflight.services).filter(([, s]) => s.ok);

  const handleRetry = async () => {
    setLoading(true);
    try { await api.get("/preflight"); onRetry(); }
    catch { onRetry(); }
    finally { setLoading(false); }
  };

  return (
    <div className="setup-page">
      <div className="setup-container">
        <div className="setup-header">
          <div className="setup-header__icon">
            <WarningAmberIcon sx={{ fontSize: 36, color: "var(--yellow)" }} />
          </div>
          <h1 className="setup-header__title">Setup Required</h1>
          <p className="setup-header__sub">
            You're signed in, but <strong>{failing.length} service{failing.length > 1 ? "s need" : " needs"} attention</strong>.
            Follow the instructions to enable missing APIs.
          </p>
        </div>

        <div className="setup-summary">
          <span className="setup-summary__item setup-summary__item--fail">
            <ErrorIcon sx={{ fontSize: 13 }} /> {failing.length} failing
          </span>
          <span className="setup-summary__item setup-summary__item--ok">
            <CheckCircleIcon sx={{ fontSize: 13 }} /> {passing.length} passing
          </span>
        </div>

        <div className="setup-card setup-card--common">
          <button className="setup-card__toggle"
            onClick={() => setCommonOpen(o => !o)} aria-expanded={commonOpen}>
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <WarningAmberIcon sx={{ fontSize: 16, color: "var(--accent)" }} />
              Common prerequisites (check these first)
            </span>
            {commonOpen ? <ExpandLessIcon sx={{ fontSize: 18 }} /> : <ExpandMoreIcon sx={{ fontSize: 18 }} />}
          </button>
          {commonOpen && (
            <div className="setup-card__body">
              {COMMON_STEPS.map((s, i) => (
                <div key={i} className="common-step">
                  <div className="common-step__num">{i + 1}</div>
                  <div className="common-step__content">
                    <strong>{s.title}</strong>
                    <p>{s.detail}</p>
                    <a href={s.link} target="_blank" rel="noreferrer" className="setup-link">
                      <LinkIcon sx={{ fontSize: 13 }} /> {s.linkLabel}
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="setup-services">
          {failing.map(([name, status]) => <ServiceRow key={name} name={name} status={status} />)}
          {passing.map(([name, status]) => <ServiceRow key={name} name={name} status={status} />)}
        </div>

        <div className="setup-actions">
          <button className="btn btn--primary" onClick={handleRetry} disabled={loading}>
            <RefreshIcon sx={{ fontSize: 16 }} />
            {loading ? "Checking…" : "Re-check permissions"}
          </button>
          <p className="setup-actions__hint">
            After enabling APIs, log out and sign in again so Google issues a fresh token.
          </p>
          <button className="btn btn--ghost btn--sm"
            onClick={async () => { await api.post("/auth/logout"); window.location.href = "/"; }}>
            <LogoutIcon sx={{ fontSize: 15 }} /> Sign out and try again
          </button>
        </div>
      </div>
    </div>
  );
}
