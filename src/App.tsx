import { lazy, Suspense, useEffect, useState } from 'react'
import { clearSession, logout, restoreSession, switchAccount, type Session } from './auth/googleAuth'
import { DriveLoader } from './components/DriveLoader'
import { useCashBook } from './hooks/useCashBook'
import { BooksPage } from './pages/BooksPage'
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
    return <DriveLoader overlay label="Opening SmartCB" />
  }

  if (!session) {
    return <LoginPage onSignedIn={setSession} />
  }

  return (
    <SignedInApp
      session={session}
      onLogout={() => void handleLogout()}
      onSwitchAccount={() => void handleSwitch()}
      onAuthExpired={() => {
        clearSession()
        setSession(null)
      }}
    />
  )
}

type SignedInProps = {
  session: Session
  onLogout: () => void
  onSwitchAccount: () => void
  onAuthExpired: () => void
}

function SignedInApp({ session, onLogout, onSwitchAccount, onAuthExpired }: SignedInProps) {
  const book = useCashBook(session, onAuthExpired)
  const activeId = book.activeId
  const activeBook = book.books.find((item) => item.id === activeId)

  if (!activeId) {
    return (
      <BooksPage
        session={session}
        books={book.books}
        lastBookId={book.lastBookId}
        listing={book.listing}
        loadError={book.loadError}
        onSelect={(fileId) => void book.selectBook(fileId)}
        onCreate={book.createNewBook}
        onImportFromDrive={book.importFromDrive}
        onReload={() => void book.reload()}
        onLogout={onLogout}
        onSwitchAccount={onSwitchAccount}
      />
    )
  }

  return (
    <Suspense
      fallback={<DriveLoader overlay label="Loading from Drive" />}
    >
      <LedgerPage
        session={session}
        bookName={activeBook?.name ?? 'Cash Book.xlsx'}
        sheetName={book.activeSheet}
        sheets={book.sheets}
        rows={book.rows}
        syncStatus={book.syncStatus}
        syncError={book.syncError}
        loading={book.loading}
        loadError={book.loadError}
        onChangeSheet={book.closeBook}
        onSelectSheet={(name) => void book.selectSheet(name)}
        onAddEntry={book.addEntry}
        onUpdateLatest={book.updateLatest}
        onRetrySync={() => void book.retrySync()}
        onReload={() => void book.selectBook(activeId)}
        onLogout={onLogout}
        onSwitchAccount={onSwitchAccount}
      />
    </Suspense>
  )
}
