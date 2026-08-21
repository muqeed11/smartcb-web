import { useState, type FormEvent } from 'react'
import { getClientId, saveClientId, signIn, type Session } from '../auth/googleAuth'

type Props = {
  onSignedIn: (session: Session) => void
}

export function LoginPage({ onSignedIn }: Props) {
  const [clientId, setClientId] = useState(getClientId())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    const trimmed = clientId.trim()
    if (!trimmed) {
      setError('Paste your Google OAuth Client ID first.')
      return
    }
    saveClientId(trimmed)
    setBusy(true)
    try {
      const session = await signIn('select_account')
      onSignedIn(session)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="login-shell">
      <section className="login-card">
        <p className="eyebrow">Cash book</p>
        <h1>SmartCB</h1>
        <p className="lede">
          Sign in with Gmail. Entries save on this device first, then sync to your Drive folder named
          SmartCB.
        </p>
        <form className="login-form" onSubmit={handleSubmit}>
          <label htmlFor="clientId">Google OAuth Client ID</label>
          <input
            id="clientId"
            name="clientId"
            value={clientId}
            onChange={(event) => setClientId(event.target.value)}
            placeholder="123456789-abc.apps.googleusercontent.com"
            autoComplete="off"
            spellCheck={false}
          />
          <button type="submit" className="btn primary" disabled={busy}>
            {busy ? 'Opening Google…' : 'Sign in with Google'}
          </button>
          {error ? <p className="form-error">{error}</p> : null}
        </form>
        <details className="setup">
          <summary>How to create the Client ID (once)</summary>
          <ol>
            <li>
              Open{' '}
              <a href="https://console.cloud.google.com/" target="_blank" rel="noreferrer">
                Google Cloud Console
              </a>{' '}
              and create a project.
            </li>
            <li>Enable the Google Drive API.</li>
            <li>
              Configure the OAuth consent screen (External, Testing) and add your Gmail as a test
              user.
            </li>
            <li>Create credentials → OAuth client ID → Web application.</li>
            <li>
              Authorized JavaScript origins must include <code>http://localhost:5173</code> and{' '}
              <code>https://YOUR_GITHUB_USERNAME.github.io</code>.
            </li>
            <li>Paste the Client ID above, then sign in.</li>
          </ol>
        </details>
      </section>
    </main>
  )
}
