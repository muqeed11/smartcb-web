import { useState } from 'react'

type Props = {
  onReconnect: () => Promise<void>
}

export function AuthExpiredBanner({ onReconnect }: Props) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  return (
    <div className="banner error">
      <div>
        <p>Google sign-in expired. Your sheets are still here. Reconnect to sync with Drive.</p>
        {error ? <p className="form-error">{error}</p> : null}
      </div>
      <button
        type="button"
        className="btn ghost"
        disabled={busy}
        onClick={() => {
          setBusy(true)
          setError(null)
          void onReconnect()
            .catch((err) => {
              setError(err instanceof Error ? err.message : 'Could not reconnect')
            })
            .finally(() => setBusy(false))
        }}
      >
        {busy ? 'Reconnecting…' : 'Reconnect'}
      </button>
    </div>
  )
}
