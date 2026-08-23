import { useMemo, useState } from 'react'
import type { Session } from '../auth/googleAuth'
import { AppHeader } from '../components/AppHeader'
import { CreateBookModal } from '../components/CreateBookModal'
import { DriveLoader } from '../components/DriveLoader'
import { bookKind, isGoogleSheet, type DriveBook } from '../drive/driveApi'
import { bookLabel } from '../ledger/excel'

type Props = {
  session: Session
  books: DriveBook[]
  lastBookId: string | null
  listing: boolean
  loadError: string | null
  onSelect: (fileId: string) => void
  onCreate: (name: string) => Promise<void>
  onImportFromDrive: () => Promise<void>
  onReload: () => void
  onLogout: () => void
  onSwitchAccount: () => void
}

function formatModified(value?: string, mimeType?: string): string {
  const kind = bookKind(mimeType)
  if (!value) return kind
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return kind
  return `${kind} · Updated ${date.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}`
}

export function BooksPage({
  session,
  books,
  lastBookId,
  listing,
  loadError,
  onSelect,
  onCreate,
  onImportFromDrive,
  onReload,
  onLogout,
  onSwitchAccount,
}: Props) {
  const [createOpen, setCreateOpen] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)

  const ordered = useMemo(() => {
    if (!lastBookId) return books
    return [...books].sort((a, b) => Number(b.id === lastBookId) - Number(a.id === lastBookId))
  }, [books, lastBookId])

  return (
    <div className="app-shell">
      <AppHeader session={session} onLogout={onLogout} onSwitchAccount={onSwitchAccount} />

      <main className="books">
        <section className="books-intro">
          <p className="lede">Sheets from the SmartCB folder of your Google Drive.</p>
        </section>

        {loadError ? (
          <div className="banner error">
            <p>{loadError}</p>
            <button type="button" className="btn ghost" onClick={onReload}>
              Try again
            </button>
          </div>
        ) : null}

        {importError ? <p className="form-error">{importError}</p> : null}

        <section className="books-toolbar">
          <h2>{`${books.length} ${books.length === 1 ? 'sheet' : 'sheets'}`}</h2>
          <div className="books-toolbar-actions">
            <button
              type="button"
              className="btn ghost small"
              onClick={() => {
                setImportError(null)
                setImporting(true)
                void onImportFromDrive()
                  .catch((error) => {
                    setImportError(error instanceof Error ? error.message : 'Could not open Drive')
                  })
                  .finally(() => setImporting(false))
              }}
              disabled={listing || importing}
            >
              {importing ? 'Opening Drive…' : 'From Drive'}
            </button>
            <button
              type="button"
              className="btn primary small"
              onClick={() => setCreateOpen(true)}
              disabled={listing}
            >
              + New CB
            </button>
          </div>
        </section>

        {ordered.length === 0 ? (
          <p className="empty">
            No sheets yet. Tap + New CB to create one, or From Drive to open an existing Excel file or
            Google Sheet.
          </p>
        ) : (
          <ul className="book-list">
            {ordered.map((book) => (
              <li key={book.id}>
                <button
                  type="button"
                  className="book-card"
                  onClick={() => onSelect(book.id)}
                  disabled={listing}
                >
                  <span
                    className={isGoogleSheet(book.mimeType) ? 'book-icon google' : 'book-icon'}
                    aria-hidden="true"
                  >
                    {isGoogleSheet(book.mimeType) ? 'GS' : 'XL'}
                  </span>
                  <span className="book-copy">
                    <strong>{bookLabel(book.name)}</strong>
                    <span className="muted">{formatModified(book.modifiedTime, book.mimeType)}</span>
                  </span>
                  <span className="book-open">
                    {book.id === lastBookId ? 'Last opened' : 'Open'}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </main>

      {listing && !loadError ? <DriveLoader overlay label="Loading from Drive" /> : null}

      {createOpen ? (
        <CreateBookModal busy={listing} onClose={() => setCreateOpen(false)} onCreate={onCreate} />
      ) : null}
    </div>
  )
}
