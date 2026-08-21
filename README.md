# SmartCB

Local-first cash book in the browser. Sign in with Gmail, choose an Excel workbook or Google Sheet from your Google Drive folder named **SmartCB**, then add cash or expenses. Entries save on this device first and sync back to that spreadsheet.

**Live:** [https://muqeed11.github.io/smartcb-web/](https://muqeed11.github.io/smartcb-web/)

## Use it

1. Open the GitHub Pages URL.
2. Sign in with Google and allow Drive access.
3. Pick an Excel workbook or Google Sheet from the Drive folder named **SmartCB**.
4. Review cash in / cash out, then add cash or expenses. Entries save locally first, then upload to Drive.

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
