import { lazy, Suspense, useEffect, useState } from 'react'
import { logout, restoreSession, switchAccount, type Session } from './auth/googleAuth'
import { LoginPage } from './pages/LoginPage'

const LedgerPage = lazy(async () => {
  const module = await import('./pages/LedgerPage')
  return { default: module.LedgerPage }
})

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [booting, setBooting] = useState(true)

  useEffect(() => {
    let cancelled = false
    void restoreSession().then((restored) => {
      if (!cancelled) {
        setSession(restored)
        setBooting(false)
      }
    })
    return () => {
      cancelled = true
    }
  }, [])

  async function handleLogout() {
    await logout()
    setSession(null)
  }

  async function handleSwitch() {
    try {
      const next = await switchAccount()
      setSession(next)
    } catch {
      setSession(null)
    }
  }

  if (booting) {
    return (
      <main className="login-shell">
        <p className="muted">Opening SmartCB…</p>
      </main>
    )
  }

  if (!session) {
    return <LoginPage onSignedIn={setSession} />
  }

  return (
    <Suspense
      fallback={
        <main className="login-shell">
          <p className="muted">Opening your cash book…</p>
        </main>
      }
    >
      <LedgerPage
        session={session}
        onLogout={() => void handleLogout()}
        onSwitchAccount={() => void handleSwitch()}
        onAuthExpired={() => void handleLogout()}
      />
    </Suspense>
  )
}
