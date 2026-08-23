# SmartCB

Local-first cash book in the browser. Sign in with Gmail, open an Excel workbook or Google Sheet, then add cash or expenses. Entries save on this device first and sync back to that spreadsheet.

**Live:** [https://muqeed11.github.io/smartcb-web/](https://muqeed11.github.io/smartcb-web/)

**Privacy policy:** [https://muqeed11.github.io/smartcb-web/privacy.html](https://muqeed11.github.io/smartcb-web/privacy.html)

## Use it

1. Open the GitHub Pages URL.
2. Sign in with Google.
3. Open a sheet from the list, create **+ New CB**, or choose **From Drive**.
4. Review cash in / cash out, then add cash or expenses.

## Make it available to every Google account

Google will not let the public use SmartCB while the OAuth app is in **Testing**, and it will not verify **full Drive** access for a small cash-book app. SmartCB now requests only `drive.file` (files you create in the app or pick from Drive).

Do this in [Google Cloud Console](https://console.cloud.google.com/) for the SmartCB-Web project:

### 1. APIs

Enable **Google Drive API** and **Google Picker API**.

Create a **Browser API key**, restrict it to HTTP referrers:

- `http://localhost:5173/*`
- `https://muqeed11.github.io/*`

Put the key in GitHub → Settings → Secrets and variables → Actions as `VITE_GOOGLE_API_KEY`, then redeploy. Also add it to `.env` for local runs.

### 2. OAuth branding

APIs & Services → **OAuth consent screen** / **Branding**:

- App name: SmartCB-Web
- User support email: your Gmail
- App home page: `https://muqeed11.github.io/smartcb-web/`
- Privacy policy: `https://muqeed11.github.io/smartcb-web/privacy.html`
- Authorized domains: `github.io`
- Developer contact: muqeednse@gmail.com

### 3. Scopes

Under **Data Access**, remove `https://www.googleapis.com/auth/drive` if it is listed. Keep:

- `.../auth/userinfo.email`
- `.../auth/userinfo.profile`
- `.../auth/drive.file`

### 4. Publish

Audience → **In production** → **Publish app**.

Any Google account can now start sign-in. Until Google finishes verification they still see the “unverified app” warning, and Google caps unverified sensitive-scope apps at **100 users**.

### 5. Submit verification

Still on the OAuth consent screen, submit for verification. You will need:

- The privacy policy URL above
- A short YouTube video (can be unlisted) that shows: Sign in → Google consent for Drive files → open a cash book → add cash / expense
- A sentence such as: “SmartCB uses drive.file only to read and update Excel or Google Sheets the user creates in the app or selects with Google Picker. It does not access the rest of Drive.”

After Google approves `drive.file`, the unsafe warning goes away and the 100-user cap no longer applies.

Sign out of SmartCB and sign in once after this change so Google asks for the new, narrower permission.

## Local development

```bash
npm install
npm run dev
```

## Deploy

Push to `main`. GitHub Actions builds the app and deploys to GitHub Pages.
