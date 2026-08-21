# SmartCB

Local-first cash book in the browser. Sign in with Gmail, add cash or expenses, and sync to Excel workbooks in a Google Drive folder named **SmartCB**. The spreadsheet stays in Drive — the app never presents it as Excel.

**Live:** [https://muqeed11.github.io/smartcb-web/](https://muqeed11.github.io/smartcb-web/)

## Use it

1. Open the GitHub Pages URL.
2. Sign in with Google and allow Drive access.
3. Add cash / add expense. Entries save locally first, then upload to Drive.

## Google Cloud

The OAuth Client ID is built into the app. In the Google Cloud OAuth client, Authorized JavaScript origins must include:

- `http://localhost:5173`
- `https://muqeed11.github.io`

Keep the OAuth app in **Testing** and add each Gmail account as a test user until the app is verified.

## Local development

```bash
npm install
npm run dev
```

## Deploy

Push to `main`. GitHub Actions builds the app and deploys to GitHub Pages.
