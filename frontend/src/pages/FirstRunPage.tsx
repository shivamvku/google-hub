/**
 * FirstRunPage — one-step-at-a-time setup wizard.
 *
 * Each step occupies the full card. The user performs an action,
 * then clicks "Next →" (which may validate). Progress bar across top.
 *
 * Step 1 — Create GCP Project        (opens link, user pastes Project ID, validates)
 * Step 2 — Enable 6 APIs             (opens batch-enable link)
 * Step 3 — Configure Consent Screen  (opens consent screen link)
 * Step 4 — Create OAuth Client       (opens credentials link, shows redirect URI)
 * Step 5 — Upload JSON               (drop zone → auto-parsed → done)
 */
import { useCallback, useRef, useState } from "react";
import HubIcon           from "@mui/icons-material/Hub";
import OpenInNewIcon     from "@mui/icons-material/OpenInNew";
import CheckCircleIcon   from "@mui/icons-material/CheckCircle";
import BoltIcon          from "@mui/icons-material/Bolt";
import UploadFileIcon    from "@mui/icons-material/UploadFile";
import ContentCopyIcon   from "@mui/icons-material/ContentCopy";
import ArrowForwardIcon  from "@mui/icons-material/ArrowForward";
import ArrowBackIcon     from "@mui/icons-material/ArrowBack";
import FolderIcon        from "@mui/icons-material/Folder";
import EmailIcon         from "@mui/icons-material/Email";
import CalendarMonthIcon from "@mui/icons-material/CalendarMonth";
import TableChartIcon    from "@mui/icons-material/TableChart";
import DescriptionIcon   from "@mui/icons-material/Description";
import SmartDisplayIcon  from "@mui/icons-material/SmartDisplay";
import SecurityIcon      from "@mui/icons-material/Security";
import KeyIcon           from "@mui/icons-material/Key";
import api from "../api";

interface Props { onConfigured: () => void; }

const GC          = "https://console.cloud.google.com";
const ALL_APIS    = "drive.googleapis.com,gmail.googleapis.com,calendar-json.googleapis.com,sheets.googleapis.com,docs.googleapis.com,youtube.googleapis.com";
// In production VITE_API_BASE is "" so we use window.location.origin for the full URL
const REDIRECT_URI = import.meta.env.VITE_API_BASE
  ? `${import.meta.env.VITE_API_BASE}/auth/callback`
  : `${typeof window !== "undefined" ? window.location.origin : ""}/auth/callback`;

const API_CHIPS = [
  { Icon: FolderIcon,        name: "Drive"    },
  { Icon: EmailIcon,         name: "Gmail"    },
  { Icon: CalendarMonthIcon, name: "Calendar" },
  { Icon: TableChartIcon,    name: "Sheets"   },
  { Icon: DescriptionIcon,   name: "Docs"     },
  { Icon: SmartDisplayIcon,  name: "YouTube"  },
];

const TOTAL_STEPS = 5;

// ── DropZone ──────────────────────────────────────────────────────────────────
function DropZone({ onFile, disabled, uploading }: {
  onFile: (f: File) => void; disabled: boolean; uploading: boolean;
}) {
  const [dragging, setDragging] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  const handle = (f?: File) => {
    if (!f || disabled) return;
    if (!f.name.endsWith(".json")) {
      alert("Please select the .json file downloaded from Google Cloud Console.");
      return;
    }
    onFile(f);
  };
  return (
    <div
      className={`dropzone ${dragging ? "dropzone--active" : ""} ${disabled ? "dropzone--disabled" : ""}`}
      onClick={() => !disabled && ref.current?.click()}
      onDragOver={e => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={e => { e.preventDefault(); setDragging(false); handle(e.dataTransfer.files[0]); }}
      role="button" tabIndex={disabled ? -1 : 0} aria-label="Drop client secrets JSON"
      onKeyDown={e => e.key === "Enter" && !disabled && ref.current?.click()}
    >
      <input ref={ref} type="file" accept=".json" style={{ display: "none" }}
        onChange={e => handle(e.target.files?.[0])} />
      <UploadFileIcon sx={{ fontSize: 40, color: uploading ? "var(--accent)" : "var(--text-dim)" }} />
      <p className="dropzone__label">
        {uploading ? "Reading credentials…" : <>Drop <code>client_secret_*.json</code> here</>}
        <span className="dropzone__sub">{uploading ? "" : "or click to browse"}</span>
      </p>
    </div>
  );
}

// ── Progress bar ──────────────────────────────────────────────────────────────
function ProgressBar({ current, total }: { current: number; total: number }) {
  return (
    <div className="wiz-progress" role="progressbar"
      aria-valuenow={current} aria-valuemin={1} aria-valuemax={total}>
      <div className="wiz-progress__track">
        <div className="wiz-progress__fill"
          style={{ width: `${((current - 1) / (total - 1)) * 100}%` }} />
        {Array.from({ length: total }, (_, i) => (
          <div key={i}
            className={`wiz-progress__dot ${i + 1 < current ? "done" : ""} ${i + 1 === current ? "active" : ""}`}
            style={{ left: `${(i / (total - 1)) * 100}%` }}>
            {i + 1 < current
              ? <CheckCircleIcon sx={{ fontSize: 14 }} />
              : <span>{i + 1}</span>}
          </div>
        ))}
      </div>
      <div className="wiz-progress__labels">
        {["Create Project", "Enable APIs", "Consent Screen", "OAuth Client", "Upload JSON"]
          .map((l, i) => (
            <span key={i} className={`wiz-progress__label ${i + 1 === current ? "active" : ""}`}>{l}</span>
          ))}
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function FirstRunPage({ onConfigured }: Props) {
  const [step,        setStep]        = useState(1);
  const [projectId,   setProjectId]   = useState("");
  const [pidError,    setPidError]    = useState("");
  const [linkClicked, setLinkClicked] = useState(false);
  const [uploading,   setUploading]   = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [warning,     setWarning]     = useState<string | null>(null);
  const [copied,      setCopied]      = useState(false);
  const [allDone,     setAllDone]     = useState(false);

  const gcUrl = useCallback((path: string) => {
    const q = projectId ? `?project=${encodeURIComponent(projectId)}` : "";
    return `${GC}${path}${q}`;
  }, [projectId]);

  const openLink = (url: string) => {
    window.open(url, "_blank", "noreferrer");
    setLinkClicked(true);
  };

  const copyUri = () => {
    navigator.clipboard.writeText(REDIRECT_URI);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const goNext = () => {
    if (step === 1) {
      if (!projectId.trim()) { setPidError("Please paste your Project ID before continuing."); return; }
      setPidError("");
    }
    setLinkClicked(false);
    setStep(s => s + 1);
  };

  const goBack = () => { setLinkClicked(false); setStep(s => s - 1); };

  const handleJsonFile = useCallback(async (file: File) => {
    setUploading(true); setUploadError(null); setWarning(null);
    const form = new FormData();
    form.append("file", file);
    try {
      const { data } = await api.post("/setup/parse-json", form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      if (data.warning) setWarning(data.warning);
      setAllDone(true);
    } catch (err: any) {
      const msg = err?.response?.data?.detail || err?.message || "Failed to parse file.";
      setUploadError(typeof msg === "string" ? msg : JSON.stringify(msg));
    } finally { setUploading(false); }
  }, []);

  // ── Done screen ────────────────────────────────────────────────────────────
  if (allDone) {
    return (
      <div className="wiz-page">
        <div className="wiz-done">
          <CheckCircleIcon sx={{ fontSize: 64, color: "var(--green)" }} />
          <h2 className="wiz-done__title">Setup Complete!</h2>
          <p className="wiz-done__sub">
            Google Hub is configured. Sign in with your Google account to continue.
          </p>
          {warning && (
            <div className="wiz-warning">
              <SecurityIcon sx={{ fontSize: 16 }} /> {warning}
            </div>
          )}
          <button className="wiz-btn wiz-btn--primary wiz-btn--lg" onClick={onConfigured}>
            Continue to Sign In <ArrowForwardIcon sx={{ fontSize: 18 }} />
          </button>
        </div>
      </div>
    );
  }

  // ── Wizard ─────────────────────────────────────────────────────────────────
  return (
    <div className="wiz-page">
      <div className="wiz-shell">

        {/* Header */}
        <div className="wiz-header">
          <HubIcon sx={{ fontSize: 28, color: "var(--accent)" }} />
          <div>
            <h1 className="wiz-header__title">Google Hub Setup</h1>
            <p className="wiz-header__sub">One-time setup · ~5 minutes</p>
          </div>
        </div>

        {/* Progress */}
        <ProgressBar current={step} total={TOTAL_STEPS} />

        {/* Step card */}
        <div className="wiz-card">

          {/* ── Step 1 ── */}
          {step === 1 && (
            <>
              <div className="wiz-step-header">
                <div className="wiz-step-icon"><FolderIcon sx={{ fontSize: 22 }} /></div>
                <div>
                  <h2 className="wiz-step-title">Create a Google Cloud Project</h2>
                  <p className="wiz-step-sub">You need a GCP project to house your APIs and credentials.</p>
                </div>
              </div>
              <div className="wiz-body">
                <ol className="wiz-instructions">
                  <li>Click the button below — Google Cloud Console will open.</li>
                  <li>Give the project any name (e.g. <strong>Google Hub</strong>) and click <strong>Create</strong>.</li>
                  <li>Once created, copy the <strong>Project ID</strong> shown below the project name.</li>
                  <li>Paste it in the field below and click <strong>Next</strong>.</li>
                </ol>

                <button className="wiz-btn wiz-btn--outline" onClick={() => openLink(`${GC}/projectcreate`)}>
                  <OpenInNewIcon sx={{ fontSize: 16 }} /> Open Google Cloud Console
                  {linkClicked && <CheckCircleIcon sx={{ fontSize: 15, color: "var(--green)", marginLeft: 4 }} />}
                </button>

                <div className="wiz-field">
                  <label className="wiz-label" htmlFor="pid">
                    Project ID <span className="wiz-label-hint">(from the Google Cloud Console, looks like <em>my-project-123456</em>)</span>
                  </label>
                  <input
                    id="pid" className={`wiz-input ${pidError ? "wiz-input--error" : ""}`}
                    type="text" placeholder="e.g. google-hub-123456"
                    value={projectId} onChange={e => { setProjectId(e.target.value.trim()); setPidError(""); }}
                    autoComplete="off" spellCheck={false}
                  />
                  {pidError && <p className="wiz-field-error">{pidError}</p>}
                </div>
              </div>
            </>
          )}

          {/* ── Step 2 ── */}
          {step === 2 && (
            <>
              <div className="wiz-step-header">
                <div className="wiz-step-icon"><BoltIcon sx={{ fontSize: 22 }} /></div>
                <div>
                  <h2 className="wiz-step-title">Enable all 6 Google APIs</h2>
                  <p className="wiz-step-sub">One click enables everything — Drive, Gmail, Calendar, Sheets, Docs, YouTube.</p>
                </div>
              </div>
              <div className="wiz-body">
                <div className="wiz-chips">
                  {API_CHIPS.map(({ Icon, name }) => (
                    <span key={name} className="wiz-chip">
                      <Icon sx={{ fontSize: 14 }} /> {name}
                    </span>
                  ))}
                </div>
                <ol className="wiz-instructions">
                  <li>Click the button below. Google will open a confirmation page with all 6 APIs listed.</li>
                  <li>Your project <strong className="wiz-pid">{projectId}</strong> is pre-selected.</li>
                  <li>Click <strong>Enable</strong> and wait for the confirmation.</li>
                  <li>Come back here and click <strong>Next</strong>.</li>
                </ol>
                <button className="wiz-btn wiz-btn--outline"
                  onClick={() => openLink(`${GC}/flows/enableapi?apiid=${ALL_APIS}&project=${projectId}`)}>
                  <BoltIcon sx={{ fontSize: 16 }} /> Enable all 6 APIs now
                  {linkClicked && <CheckCircleIcon sx={{ fontSize: 15, color: "var(--green)", marginLeft: 4 }} />}
                </button>
                {!linkClicked && (
                  <p className="wiz-hint">Click the button above, then come back and click Next →</p>
                )}
              </div>
            </>
          )}

          {/* ── Step 3 ── */}
          {step === 3 && (
            <>
              <div className="wiz-step-header">
                <div className="wiz-step-icon"><SecurityIcon sx={{ fontSize: 22 }} /></div>
                <div>
                  <h2 className="wiz-step-title">Configure Google Auth Platform</h2>
                  <p className="wiz-step-sub">Set up your app identity and test users (Google's new Auth Platform UI).</p>
                </div>
              </div>
              <div className="wiz-body">

                <div className="wiz-notice">
                  <strong>Note:</strong> Google recently replaced the old "OAuth consent screen" with the new
                  <strong> Google Auth Platform</strong>. The page you'll see says
                  <em> "Google Auth Platform not configured yet"</em> — that's normal.
                </div>

                <div className="wiz-notice" style={{ borderLeftColor: "var(--yellow)", background: "rgba(234,179,8,0.06)" }}>
                  <strong>⚠ When signing in later</strong>, Google will show a warning:
                  <em> "Google hasn't verified this app"</em>. This is expected for apps in
                  Testing mode. Click <strong>Continue</strong> (not "Back to safety") to proceed.
                  This warning disappears only after Google verifies your app, which you don't
                  need for personal use.
                </div>

                <ol className="wiz-instructions">
                  <li>
                    Click <strong>Open Google Auth Platform</strong> below.
                    You'll see a page saying "Google Auth Platform not configured yet".
                  </li>
                  <li>
                    Click the blue <strong>Get started</strong> button on that page.
                  </li>
                  <li>
                    Under <strong>Branding</strong>: fill in <strong>App name</strong> (e.g. Google Hub)
                    and your <strong>User support email</strong>. Click <strong>Next</strong>.
                  </li>
                  <li>
                    Under <strong>Audience</strong>: select <strong>External</strong>.
                    Click <strong>Next</strong>.
                  </li>
                  <li>
                    Under <strong>Contact Information</strong>: add your email. Click <strong>Next</strong>.
                  </li>
                  <li>
                    Review and click <strong>Continue</strong> → then <strong>Create</strong>.
                  </li>
                  <li>
                    Back on the Auth Platform page, click <strong>Audience</strong> in the left sidebar.
                    Scroll to <strong>Test users</strong> → click <strong>Add users</strong> →
                    enter your Google email → <strong>Save</strong>.
                  </li>
                  <li>Come back here and click <strong>Next</strong>.</li>
                </ol>

                <button className="wiz-btn wiz-btn--outline"
                  onClick={() => openLink(gcUrl("/auth/overview"))}>
                  <OpenInNewIcon sx={{ fontSize: 16 }} /> Open Google Auth Platform
                  {linkClicked && <CheckCircleIcon sx={{ fontSize: 15, color: "var(--green)", marginLeft: 4 }} />}
                </button>

                {!linkClicked && (
                  <p className="wiz-hint">
                    Click above → "Get started" → fill Branding + Audience → add yourself as Test user → come back here
                  </p>
                )}
              </div>
            </>
          )}

          {/* ── Step 4 ── */}
          {step === 4 && (
            <>
              <div className="wiz-step-header">
                <div className="wiz-step-icon"><KeyIcon sx={{ fontSize: 22 }} /></div>
                <div>
                  <h2 className="wiz-step-title">Create OAuth Client ID</h2>
                  <p className="wiz-step-sub">Generate your app's credentials from the Clients section of Google Auth Platform.</p>
                </div>
              </div>
              <div className="wiz-body">
                <ol className="wiz-instructions">
                  <li>Click <strong>Open Clients Page</strong> below — this opens the <strong>Clients</strong> section of Google Auth Platform.</li>
                  <li>If you see "URL not found", click <strong>Clients</strong> in the left sidebar instead.</li>
                  <li>Click <strong>Create client</strong>.</li>
                  <li>Set <strong>Application type</strong> to <strong>Web application</strong>.</li>
                  <li>Under <strong>Authorised redirect URIs</strong>, click <strong>Add URI</strong> and paste exactly:</li>
                </ol>

                <div className="wiz-copy-row">
                  <code className="wiz-code">{REDIRECT_URI}</code>
                  <button className="wiz-copy-btn" onClick={copyUri} title={copied ? "Copied!" : "Copy"}>
                    {copied
                      ? <><CheckCircleIcon sx={{ fontSize: 14, color: "var(--green)" }} /> Copied!</>
                      : <><ContentCopyIcon sx={{ fontSize: 14 }} /> Copy</>}
                  </button>
                </div>

                <ol className="wiz-instructions" start={6}>
                  <li>Give it a name (e.g. <em>Google Hub Web</em>) and click <strong>Create</strong>.</li>
                  <li>A dialog appears — click the <strong>⬇ Download JSON</strong> button to save the file.</li>
                  <li>Keep that file — you'll upload it in the next step.</li>
                </ol>

                <button className="wiz-btn wiz-btn--outline"
                  onClick={() => openLink(gcUrl("/auth/clients"))}>
                  <OpenInNewIcon sx={{ fontSize: 16 }} /> Open Clients Page
                  {linkClicked && <CheckCircleIcon sx={{ fontSize: 15, color: "var(--green)", marginLeft: 4 }} />}
                </button>
                {!linkClicked && (
                  <p className="wiz-hint">Click above → Create client → Web application → paste redirect URI → Create → Download JSON</p>
                )}
              </div>
            </>
          )}

          {/* ── Step 5 ── */}
          {step === 5 && (
            <>
              <div className="wiz-step-header">
                <div className="wiz-step-icon"><UploadFileIcon sx={{ fontSize: 22 }} /></div>
                <div>
                  <h2 className="wiz-step-title">Upload your credentials file</h2>
                  <p className="wiz-step-sub">Drop the JSON you just downloaded — no copy-paste needed.</p>
                </div>
              </div>
              <div className="wiz-body">
                <ol className="wiz-instructions">
                  <li>Find the <code>client_secret_*.json</code> file you just downloaded.</li>
                  <li>Drag it onto the zone below, or click to browse.</li>
                  <li>We'll read your Client ID and Secret automatically and save them securely.</li>
                </ol>
                <DropZone onFile={handleJsonFile} disabled={uploading} uploading={uploading} />
                {uploadError && (
                  <div className="wiz-error">
                    <strong>Error:</strong> {uploadError}
                    <br /><small>Make sure you downloaded the correct file from Google Cloud Console → Credentials.</small>
                  </div>
                )}
              </div>
            </>
          )}

          {/* ── Nav buttons ── */}
          <div className="wiz-nav">
            {step > 1 && (
              <button className="wiz-btn wiz-btn--ghost" onClick={goBack}>
                <ArrowBackIcon sx={{ fontSize: 16 }} /> Back
              </button>
            )}
            {step === 1 && <div />}

            {step < 5 && (
              <button className="wiz-btn wiz-btn--primary" onClick={goNext}>
                {step === 1 && !projectId ? "Enter Project ID first" : "Next"}
                <ArrowForwardIcon sx={{ fontSize: 16 }} />
              </button>
            )}
            {step === 5 && (
              <p className="wiz-nav__hint">Drop the JSON file above to finish setup</p>
            )}
          </div>
        </div>

        {/* Step counter */}
        <p className="wiz-counter">Step {step} of {TOTAL_STEPS}</p>

      </div>
    </div>
  );
}
