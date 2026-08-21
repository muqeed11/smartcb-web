import { useMemo, useState } from 'react'
import type { Session } from '../auth/googleAuth'
import { AddEntryModal } from '../components/AddEntryModal'
import { AppHeader } from '../components/AppHeader'
import { DriveLoader } from '../components/DriveLoader'
import type { SyncStatus } from '../hooks/useCashBook'
import { bookLabel, type LedgerRow } from '../ledger/excel'

type Props = {
  session: Session
  bookName: string
  sheetName: string | null
  sheets: string[]
  rows: LedgerRow[]
  syncStatus: SyncStatus
  syncError: string | null
  loading: boolean
  loadError: string | null
  onChangeSheet: () => void
  onSelectSheet: (name: string) => void
  onAddEntry: (entry: { description: string; amount: number; kind: 'in' | 'out' }) => Promise<void>
  onRetrySync: () => void
  onReload: () => void
  onLogout: () => void
  onSwitchAccount: () => void
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

export function LedgerPage({
  session,
  bookName,
  sheetName,
  sheets,
  rows,
  syncStatus,
  syncError,
  loading,
  loadError,
  onChangeSheet,
  onSelectSheet,
  onAddEntry,
  onRetrySync,
  onReload,
  onLogout,
  onSwitchAccount,
}: Props) {
  const [modal, setModal] = useState<'in' | 'out' | null>(null)

  const totals = useMemo(() => {
    const cashIn = rows.reduce((sum, row) => sum + row.cashIn, 0)
    const cashOut = rows.reduce((sum, row) => sum + row.cashOut, 0)
    const balance = rows.at(-1)?.balance ?? 0
    return { cashIn, cashOut, balance }
  }, [rows])

  const reversed = useMemo(() => [...rows].reverse(), [rows])

  return (
    <div className="app-shell">
      <AppHeader
        session={session}
        subtitle={
          sheetName && sheetName !== bookLabel(bookName)
            ? `${bookLabel(bookName)} · ${sheetName}`
            : bookLabel(bookName)
        }
        extra={
          <button type="button" className="btn ghost compact" onClick={onChangeSheet}>
            All sheets
          </button>
        }
        onLogout={onLogout}
        onSwitchAccount={onSwitchAccount}
      />

      <main className="ledger">
        {loadError ? (
          <div className="banner error">
            <p>{loadError}</p>
            <button type="button" className="btn ghost" onClick={onReload}>
              Try again
            </button>
          </div>
        ) : null}

        {sheets.length > 1 ? (
          <div className="sheet-tabs" role="tablist" aria-label="Worksheets">
            {sheets.map((name) => (
              <button
                key={name}
                type="button"
                role="tab"
                aria-selected={name === sheetName}
                className={name === sheetName ? 'sheet-tab active' : 'sheet-tab'}
                onClick={() => onSelectSheet(name)}
                disabled={loading}
              >
                {name}
              </button>
            ))}
          </div>
        ) : null}

        <section className="summary">
          <article className="balance-card">
            <div className="balance-head">
              <p>Current balance</p>
              <p className={`sync sync-${syncStatus}`}>{syncLabel(syncStatus)}</p>
            </div>
            <h1>{money(totals.balance)}</h1>
            {syncStatus === 'error' ? (
              <button type="button" className="btn ghost compact" onClick={onRetrySync}>
                Retry sync
              </button>
            ) : null}
            {syncError ? <p className="form-error">{syncError}</p> : null}
          </article>
          <div className="summary-row">
            <article className="stat">
              <p>Cash in</p>
              <strong className="positive">{money(totals.cashIn)}</strong>
            </article>
            <article className="stat">
              <p>Expenses</p>
              <strong className="negative">{money(totals.cashOut)}</strong>
            </article>
          </div>
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
          {reversed.length === 0 && !loading ? (
            <p className="empty">No transactions in this sheet yet. Add cash or an expense.</p>
          ) : (
            <>
              <ul className="entry-list">
                {reversed.map((row, index) => (
                  <li key={`${row.date}-${row.description}-${index}`}>
                    <div className="entry-copy">
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
              <div className="ledger-table-wrap">
                <table className="ledger-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Description</th>
                      <th className="num">Cash in</th>
                      <th className="num">Cash out</th>
                      <th className="num">Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reversed.map((row, index) => (
                      <tr key={`${row.date}-${row.description}-${index}`}>
                        <td>
                          <time>{row.date}</time>
                        </td>
                        <td>{row.description || '—'}</td>
                        <td className="num positive">{row.cashIn > 0 ? money(row.cashIn) : ''}</td>
                        <td className="num negative">{row.cashOut > 0 ? money(row.cashOut) : ''}</td>
                        <td className="num bal">{money(row.balance)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
      </main>

      {loading && !loadError ? <DriveLoader overlay label="Loading from Drive" /> : null}

      {modal ? (
        <AddEntryModal kind={modal} onClose={() => setModal(null)} onSave={onAddEntry} />
      ) : null}
    </div>
  )
}
