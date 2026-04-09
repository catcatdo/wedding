# Wedding Gift Lookup

Synology NAS deployable full-stack app for publicly browsing wedding-gift transfer records while limiting unauthenticated edits to phone numbers only.

## What changed from the prototype

This repository started as a GitHub Pages frontend + Google Apps Script bridge. It is now a single-container Node.js app that:

- serves the frontend and backend together
- is suitable for Synology Container Manager / Docker
- supports a **public-first access model**
  - **public / guest**: search records and edit **전화번호 only**
  - **admin**: optionally log in to edit phone, memo, name, bank, account number, and description
- keeps **Google Sheets** as the preferred initial backend when configured
- falls back to a local JSON data file for development/testing
- masks account numbers and hides memo for non-admin users
- keeps a simple append-only audit log for updates

## Architecture

- `public/` - frontend served by Express
- `src/server.js` - Express app + auth + API
- `src/data-store.js` - data access layer
  - `google-sheets` mode via service account
  - `local` mode via `data/records.json`
- `data/records.json` - local sample/dev dataset
- `data/audit.log` - update audit trail (generated at runtime)
- `Dockerfile`, `docker-compose.yml` - Synology-friendly deployment assets
- `apps-script/` - legacy prototype kept for reference only

## Security model

The app is now designed for public read access behind HTTPS:

- anyone can search and browse records without logging in
- public users can submit updates to `전화번호` only
- account numbers stay masked for non-admin users
- memo content is hidden from non-admin users and is not searchable in public mode
- optional admin login still uses a signed HTTP-only session cookie

This is intentionally lightweight and not enterprise IAM. Public phone-number updates are convenient but inherently easier to abuse than authenticated writes. For internet-facing deployments, add rate limiting, CSRF protection, short audit review loops, and consider IP restrictions or a trusted reverse proxy.

## Environment variables

Copy `.env.example` to `.env` and set at least these values:

```env
PORT=3000
APP_BASE_URL=https://gift.example.com
SESSION_SECRET=change-this-long-random-secret
ADMIN_ACCESS_CODE=admin-access-code
DATA_SOURCE=google-sheets
GOOGLE_SHEETS_SPREADSHEET_ID=1YyZYdcdOyE5ct9GaKGIspa0zhzDAjVWWv5NgEG8Ilk8
GOOGLE_SHEETS_SHEET_NAME=시트1
COOKIE_SECURE=true
TRUST_PROXY=true
```

`USER_ACCESS_CODE` is now optional and effectively legacy. If set, it grants the same phone-only permissions as public access.

### Google Sheets mode (primary / intended deployment)

```env
DATA_SOURCE=google-sheets
GOOGLE_SHEETS_SPREADSHEET_ID=1YyZYdcdOyE5ct9GaKGIspa0zhzDAjVWWv5NgEG8Ilk8
GOOGLE_SHEETS_SHEET_NAME=시트1
GOOGLE_SERVICE_ACCOUNT_EMAIL=service-account@your-project.iam.gserviceaccount.com
GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nREPLACE_WITH_YOUR_REAL_SERVICE_ACCOUNT_PRIVATE_KEY\n-----END PRIVATE KEY-----\n"
```

The spreadsheet id and sheet name above are prefilled in `.env.example`, but the real Google service account email/private key must be supplied by the user. Those credentials are not stored in this repository.

### Local mode

```env
DATA_SOURCE=local
LOCAL_DATA_PATH=./data/records.json
```

## Google Sheets setup

1. Create a Google Cloud service account.
2. Enable the **Google Sheets API**.
3. Share spreadsheet `1YyZYdcdOyE5ct9GaKGIspa0zhzDAjVWWv5NgEG8Ilk8` / sheet `시트1` with the service account email as an editor.
4. Put the real service account email/private key into `.env` (the repo only ships placeholders).
5. Keep the sheet headers compatible with these columns:
   - `id`
   - `거래일시`
   - `출금`
   - `거래내용`
   - `상대계좌번호`
   - `상대은행`
   - `상대계좌예금주명`
   - `전화번호`
   - `메모`

If some columns are missing, the app will try to add them.

## Local development

```bash
npm install
cp .env.example .env
npm start
```

Open <http://localhost:3000>.

Public search and phone updates work immediately without login. The login box is only for optional admin access.

Sample data is provided in `data/records.json`.

## Smoke test

```bash
npm install
npm run smoke
```

## Docker / Synology Container Manager

### Option A - build from repo on a Linux box / CI

```bash
docker build -t wedding-gift-lookup:latest .
docker run -d \
  --name wedding-gift-lookup \
  -p 3000:3000 \
  --env-file .env \
  -v $(pwd)/data:/app/data \
  --restart unless-stopped \
  wedding-gift-lookup:latest
```

### Option B - Synology Container Manager project

1. Copy the repo to the NAS.
2. In **Container Manager → Project**, create a new project from `docker-compose.yml`.
3. Upload or create a `.env` file beside the compose file.
4. Set the project path so `./data` persists on NAS storage.
5. Deploy the project.
6. Confirm the app responds on `http://NAS-IP:3000/api/health`.

### Reverse proxy / HTTPS on Synology

1. Open **Control Panel → Login Portal → Advanced → Reverse Proxy**.
2. Create a rule:
   - source: `https://gift.yourdomain.com`
   - destination: `http://127.0.0.1:3000`
3. Attach a valid certificate in **Security → Certificate**.
4. Keep `COOKIE_SECURE=true` when using HTTPS.
5. Leave `TRUST_PROXY=true` so Express respects Synology’s reverse proxy headers.

## Privacy and operational notes

- Do not expose the container directly to the internet without HTTPS.
- Use a long random `SESSION_SECRET`.
- Treat `ADMIN_ACCESS_CODE` like a password and rotate it after the wedding workflow ends.
- Public users can change phone numbers, so review `data/audit.log` for suspicious edits.
- If you do not need the legacy user login, leave `USER_ACCESS_CODE` unset.
- Audit log entries are stored locally at `data/audit.log`; review and back them up if needed.
- Google service account credentials should live in environment variables or Synology secrets, not in the repo.

## API summary

- `GET /api/records?q=...` public search/browse
- `GET /api/records/:id` public detail view with masked account number and hidden memo
- `PATCH /api/records/:id` public phone-number update; admin can edit extra fields
- `POST /api/auth/login` optional admin or legacy user login
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `GET /api/health`

## Notes

- The old `frontend/` and `apps-script/` directories are retained for reference/migration context.
- For production, consider adding rate limiting, CSRF protection, and named user accounts if the audience grows.
