# SmartCB

Local-first cash book in the browser. Sign in with Gmail, add cash or expenses, and sync to Excel workbooks in a Google Drive folder named **SmartCB**. The spreadsheet stays in Drive — the app never presents it as Excel.

Live on GitHub Pages after the first successful Actions run.

## Use it

1. Open the GitHub Pages URL.
2. Paste your Google OAuth **Client ID** (saved in this browser).
3. Sign in with Google and allow Drive access.
4. Add cash / add expense. Entries save locally first, then upload to Drive.

## Google Cloud setup (required once)

The hosted site cannot sign in until you create a Client ID. Keep the OAuth app in **Testing** and add your Gmail as a test user.

1. Create a project at [Google Cloud Console](https://console.cloud.google.com/).
2. Enable **Google Drive API**.
3. OAuth consent screen: External, Testing, add yourself as a test user.
4. Create credentials → **OAuth client ID** → Web application.
5. Authorized JavaScript origins:
   - `http://localhost:5173`
   - `https://<your-github-username>.github.io`
6. Paste the Client ID on the SmartCB login screen.

## Local development

```bash
npm install
npm run dev
```

Optional: copy `.env.example` to `.env` and set `VITE_GOOGLE_CLIENT_ID`.

## Deploy

Push to `main`. GitHub Actions builds the app and deploys to GitHub Pages (`https://<user>.github.io/SmartCB/`).
