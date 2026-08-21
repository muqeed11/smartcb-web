import { useMemo, useState } from 'react'
import type { Session } from '../auth/googleAuth'
import { AddEntryModal } from '../components/AddEntryModal'
import { useCashBook, type SyncStatus } from '../hooks/useCashBook'
import { bookLabel } from '../ledger/excel'

type Props = {
  session: Session
  onLogout: () => void
  onSwitchAccount: () => void
  onAuthExpired: () => void
}

function money(value: number): string {
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(value)
}

function syncLabel(status: SyncStatus): string {
  switch (status) {
    case 'local':
      return 'Saved locally'
    case 'syncing':
      return 'Syncing to Drive'
    case 'synced':
      return 'Synced'
    case 'offline':
      return 'Offline — will sync later'
    case 'error':
      return 'Sync failed'
    default:
      return 'Ready'
  }
}

export function LedgerPage({ session, onLogout, onSwitchAccount, onAuthExpired }: Props) {
  const {
    books,
    activeId,
    rows,
    syncStatus,
    syncError,
    loading,
    loadError,
    selectBook,
    addEntry,
    retrySync,
    reload,
  } = useCashBook(session, onAuthExpired)
  const [modal, setModal] = useState<'in' | 'out' | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)

  const totals = useMemo(() => {
    const cashIn = rows.reduce((sum, row) => sum + row.cashIn, 0)
    const cashOut = rows.reduce((sum, row) => sum + row.cashOut, 0)
    const balance = rows.at(-1)?.balance ?? 0
    return { cashIn, cashOut, balance }
  }, [rows])

  const reversed = useMemo(() => [...rows].reverse(), [rows])
  const activeBook = books.find((book) => book.id === activeId)

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="mark">CB</span>
          <div>
            <strong>SmartCB</strong>
            <p>Drive folder SmartCB</p>
          </div>
        </div>
        <div className="topbar-right">
          {books.length > 1 ? (
            <label className="book-picker">
              <span>Book</span>
              <select
                value={activeId ?? ''}
                onChange={(event) => void selectBook(event.target.value)}
              >
                {books.map((book) => (
                  <option key={book.id} value={book.id}>
                    {bookLabel(book.name)}
                  </option>
                ))}
              </select>
            </label>
          ) : activeBook ? (
            <p className="book-name">{bookLabel(activeBook.name)}</p>
          ) : null}
          <button
            type="button"
            className="account-chip"
            onClick={() => setMenuOpen((open) => !open)}
            aria-expanded={menuOpen}
          >
            {session.picture ? (
              <img src={session.picture} alt="" referrerPolicy="no-referrer" />
            ) : (
              <span className="avatar-fallback">{session.email.slice(0, 1).toUpperCase()}</span>
            )}
            <span>{session.email}</span>
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

      <main className="ledger">
        {loadError ? (
          <div className="banner error">
            <p>{loadError}</p>
            <button type="button" className="btn ghost" onClick={() => void reload()}>
              Try again
            </button>
          </div>
        ) : null}

        <section className="summary">
          <article className="balance-card">
            <p>Current balance</p>
            <h1>{money(totals.balance)}</h1>
            <p className={`sync sync-${syncStatus}`}>{syncLabel(syncStatus)}</p>
            {syncStatus === 'error' ? (
              <button type="button" className="btn ghost compact" onClick={() => void retrySync()}>
                Retry sync
              </button>
            ) : null}
            {syncError ? <p className="form-error">{syncError}</p> : null}
          </article>
          <article className="stat">
            <p>Cash in</p>
            <strong className="positive">{money(totals.cashIn)}</strong>
          </article>
          <article className="stat">
            <p>Expenses</p>
            <strong className="negative">{money(totals.cashOut)}</strong>
          </article>
        </section>

        <section className="actions">
          <button type="button" className="btn cash" onClick={() => setModal('in')} disabled={loading}>
            Add cash
          </button>
          <button
            type="button"
            className="btn expense"
            onClick={() => setModal('out')}
            disabled={loading}
          >
            Add expense
          </button>
        </section>

        <section className="history">
          <div className="history-head">
            <h2>Activity</h2>
            {loading ? <span className="muted">Loading…</span> : <span className="muted">{rows.length} entries</span>}
          </div>
          {reversed.length === 0 && !loading ? (
            <p className="empty">No entries yet. Add cash or an expense to start this book.</p>
          ) : (
            <ul className="entry-list">
              {reversed.map((row, index) => (
                <li key={`${row.date}-${row.description}-${index}`}>
                  <div>
                    <strong>{row.description || '—'}</strong>
                    <time>{row.date}</time>
                  </div>
                  <div className="entry-amounts">
                    {row.cashIn > 0 ? <span className="positive">+{money(row.cashIn)}</span> : null}
                    {row.cashOut > 0 ? <span className="negative">−{money(row.cashOut)}</span> : null}
                    <span className="bal">Bal {money(row.balance)}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>

      {modal ? (
        <AddEntryModal kind={modal} onClose={() => setModal(null)} onSave={addEntry} />
      ) : null}
    </div>
  )
}
