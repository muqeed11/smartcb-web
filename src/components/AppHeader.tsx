import { useState, type ReactNode } from 'react'
import type { Session } from '../auth/googleAuth'

type Props = {
  session: Session
  subtitle?: string
  extra?: ReactNode
  onLogout: () => void
  onSwitchAccount: () => void
}

export function AppHeader({ session, subtitle = 'Drive folder SmartCB', extra, onLogout, onSwitchAccount }: Props) {
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <header className="topbar">
      <div className="brand-block">
        <div className="brand">
          <span className="mark">CB</span>
          <div className="brand-copy">
            <strong>SmartCB</strong>
            <p>{subtitle}</p>
          </div>
        </div>
        {extra}
      </div>
      <div className="topbar-right">
        <button
          type="button"
          className="account-chip"
          onClick={() => setMenuOpen((open) => !open)}
          aria-expanded={menuOpen}
          title={session.email}
        >
          {session.picture ? (
            <img src={session.picture} alt="" referrerPolicy="no-referrer" />
          ) : (
            <span className="avatar-fallback">{session.email.slice(0, 1).toUpperCase()}</span>
          )}
          <span className="user-email">{session.email}</span>
        </button>
        {menuOpen ? (
          <div className="account-menu">
            <button type="button" onClick={onSwitchAccount}>
              Switch account
            </button>
            <button type="button" onClick={onLogout}>
              Log out
            </button>
          </div>
        ) : null}
      </div>
    </header>
  )
}
