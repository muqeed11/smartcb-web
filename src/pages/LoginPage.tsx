import { useState, type FormEvent } from 'react'
import { signIn, type Session } from '../auth/googleAuth'

type Props = {
  onSignedIn: (session: Session) => void
}

export function LoginPage({ onSignedIn }: Props) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
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
        <p className="lede">Shows sheets from the SmartCB folder of your Google Drive.</p>
        <form className="login-form" onSubmit={handleSubmit}>
          <button type="submit" className="btn primary" disabled={busy}>
            {busy ? 'Opening Google…' : 'Sign in with Google'}
          </button>
          {error ? <p className="form-error">{error}</p> : null}
        </form>
      </section>
    </main>
  )
}
