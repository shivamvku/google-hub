# Google Hub

One app for Drive, Gmail, Calendar, Sheets, Docs and YouTube.

## Local Development

```bash
# Backend
cd backend
uvicorn backend.main:app --port 8001 --reload   # run from google-hub/

# Frontend
cd frontend
npm run dev
```

## Deployment to Render via GitHub Actions

### Step 1 — Push to GitHub

```bash
cd google-hub
git init
git add .
git commit -m "chore: initial commit"
git branch -M main
git remote add origin https://github.com/shivamvkoud/google-hub.git
git push -u origin main
```

### Step 2 — Create Render Web Service

1. Go to [render.com](https://render.com) → New → Web Service
2. Choose **Deploy an existing image from a registry**
3. Image URL: `ghcr.io/shivamvkoud/google-hub:latest`
4. Set environment variables in Render dashboard:

| Variable | Value |
|---|---|
| `DB_FILE` | `/data/google_hub.db` |
| `COOKIE_SECURE` | `true` |
| `COOKIE_SAMESITE` | `none` |
| `CORS_ORIGIN` | `https://your-app.onrender.com` (same URL) |
| `PORT` | `8001` |

5. Add a **Disk** mounted at `/data` (for SQLite persistence)
6. Copy the **Deploy Hook URL** from Render Settings → Deploy Hook

### Step 3 — Add GitHub Secrets

Go to GitHub repo → Settings → Secrets → Actions → New secret:

| Secret | Value |
|---|---|
| `RENDER_DEPLOY_HOOK` | The Deploy Hook URL from Render |
| `RENDER_APP_URL` | `https://your-app.onrender.com` |

`GITHUB_TOKEN` is automatic — no setup needed.

### Step 4 — Update Google Cloud Console

After Render gives you a URL, add the production callback URL:

1. Go to [Google Auth Platform → Clients](https://console.cloud.google.com/auth/clients)
2. Edit your OAuth client
3. Add to Authorised redirect URIs:
   ```
   https://your-app.onrender.com/auth/callback
   ```

### Step 5 — Re-run Setup Wizard

On first production load, the setup wizard will run again to save credentials into the production DB.

## CI/CD Pipeline

```
git push main
    │
    ├─ Job 1: CI — TypeScript check + Python syntax check
    │
    ├─ Job 2: Build Docker image → push to ghcr.io (on CI pass)
    │         ghcr.io/shivamvkoud/google-hub:latest
    │         ghcr.io/shivamvkoud/google-hub:sha-<commit>
    │
    └─ Job 3: Trigger Render Deploy Hook → health check /health
```

PRs run only CI (no deploy). Pushes to `main` run CI + build + deploy.
