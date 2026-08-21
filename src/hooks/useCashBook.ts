import { useCallback, useEffect, useRef, useState } from 'react'
import { ensureFreshToken, type Session } from '../auth/googleAuth'
import { getCachedBook, saveCachedBook } from '../db/localDb'
import {
  createBook,
  downloadBook,
  DriveAuthError,
  findOrCreateFolder,
  listBooks,
  uploadBook,
  type DriveBook,
} from '../drive/driveApi'
import {
  formatDateTime,
  parseWorkbook,
  recomputeBalances,
  type LedgerRow,
} from '../ledger/excel'

export type SyncStatus = 'idle' | 'local' | 'syncing' | 'synced' | 'offline' | 'error'

const LAST_BOOK_KEY = 'smartcb.lastBookId'

function lastBookKey(email: string): string {
  return `${LAST_BOOK_KEY}.${email}`
}

export function useCashBook(session: Session | null, onAuthExpired: () => void) {
  const [books, setBooks] = useState<DriveBook[]>([])
  const [folderId, setFolderId] = useState<string | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [rows, setRows] = useState<LedgerRow[]>([])
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle')
  const [syncError, setSyncError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const rowsRef = useRef<LedgerRow[]>([])
  const booksRef = useRef<DriveBook[]>([])
  const folderRef = useRef<string | null>(null)
  const activeRef = useRef<string | null>(null)
  const timerRef = useRef<number | null>(null)
  const onAuthExpiredRef = useRef(onAuthExpired)

  rowsRef.current = rows
  booksRef.current = books
  folderRef.current = folderId
  activeRef.current = activeId
  onAuthExpiredRef.current = onAuthExpired

  const rememberBook = useCallback((email: string, fileId: string) => {
    localStorage.setItem(lastBookKey(email), fileId)
  }, [])

  const handleAuthError = useCallback((error: unknown) => {
    if (error instanceof DriveAuthError) {
      onAuthExpiredRef.current()
      return true
    }
    return false
  }, [])

  const persistLocal = useCallback(
    async (fileId: string, nextRows: LedgerRow[], dirty: boolean, lastSyncedAt: number | null) => {
      const email = session?.email
      const folder = folderRef.current
      const book = booksRef.current.find((item) => item.id === fileId)
      if (!email || !folder || !book) return
      await saveCachedBook({
        fileId,
        userEmail: email,
        name: book.name,
        folderId: folder,
        rows: nextRows,
        dirty,
        lastSyncedAt,
      })
    },
    [session?.email],
  )

  const pushToDrive = useCallback(async () => {
    const fileId = activeRef.current
    if (!fileId || !navigator.onLine) {
      if (!navigator.onLine) setSyncStatus('offline')
      return
    }
    setSyncStatus('syncing')
    setSyncError(null)
    try {
      const fresh = await ensureFreshToken()
      const book = booksRef.current.find((item) => item.id === fileId)
      if (!book) return
      await uploadBook(fresh.accessToken, fileId, book.name, rowsRef.current)
      await persistLocal(fileId, rowsRef.current, false, Date.now())
      setSyncStatus('synced')
    } catch (error) {
      if (handleAuthError(error)) return
      setSyncStatus('error')
      setSyncError(error instanceof Error ? error.message : 'Could not sync to Drive')
    }
  }, [handleAuthError, persistLocal])

  const scheduleSync = useCallback(() => {
    if (timerRef.current) window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(() => {
      void pushToDrive()
    }, 1500)
  }, [pushToDrive])

  const loadBook = useCallback(
    async (token: string, email: string, book: DriveBook) => {
      const cached = await getCachedBook(book.id)
      if (cached?.dirty && cached.userEmail === email) {
        setRows(cached.rows)
        setSyncStatus('local')
        scheduleSync()
        return
      }
      const buffer = await downloadBook(token, book.id)
      const parsed = parseWorkbook(buffer)
      setRows(parsed)
      await saveCachedBook({
        fileId: book.id,
        userEmail: email,
        name: book.name,
        folderId: folderRef.current ?? '',
        rows: parsed,
        dirty: false,
        lastSyncedAt: Date.now(),
      })
      setSyncStatus('synced')
    },
    [scheduleSync],
  )

  const bootstrap = useCallback(async () => {
    if (!session) {
      setLoading(false)
      return
    }
    setLoading(true)
    setLoadError(null)
    try {
      const fresh = await ensureFreshToken()
      const folder = await findOrCreateFolder(fresh.accessToken)
      setFolderId(folder)
      folderRef.current = folder
      let listed = await listBooks(fresh.accessToken, folder)
      if (listed.length === 0) {
        const created = await createBook(fresh.accessToken, folder, 'Cash Book.xlsx')
        listed = [created]
      }
      setBooks(listed)
      booksRef.current = listed
      const preferred = localStorage.getItem(lastBookKey(fresh.email))
      const selected = listed.find((book) => book.id === preferred) ?? listed[0]
      if (!selected) throw new Error('No cash book found')
      setActiveId(selected.id)
      activeRef.current = selected.id
      rememberBook(fresh.email, selected.id)
      await loadBook(fresh.accessToken, fresh.email, selected)
    } catch (error) {
      if (handleAuthError(error)) return
      setLoadError(error instanceof Error ? error.message : 'Could not open SmartCB')
    } finally {
      setLoading(false)
    }
  }, [handleAuthError, loadBook, rememberBook, session])

  useEffect(() => {
    void bootstrap()
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current)
    }
  }, [bootstrap])

  useEffect(() => {
    const onOnline = () => {
      if (activeRef.current) void pushToDrive()
    }
    const onOffline = () => setSyncStatus('offline')
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [pushToDrive])

  const selectBook = useCallback(
    async (fileId: string) => {
      if (!session || fileId === activeId) return
      const book = books.find((item) => item.id === fileId)
      if (!book) return
      setActiveId(fileId)
      activeRef.current = fileId
      rememberBook(session.email, fileId)
      setLoading(true)
      try {
        const fresh = await ensureFreshToken()
        await loadBook(fresh.accessToken, fresh.email, book)
      } catch (error) {
        if (handleAuthError(error)) return
        setLoadError(error instanceof Error ? error.message : 'Could not open this book')
      } finally {
        setLoading(false)
      }
    },
    [activeId, books, handleAuthError, loadBook, rememberBook, session],
  )

  const addEntry = useCallback(
    async (entry: { description: string; amount: number; kind: 'in' | 'out' }) => {
      const fileId = activeRef.current
      if (!fileId) return
      const next = recomputeBalances([
        ...rowsRef.current,
        {
          date: formatDateTime(),
          description: entry.description.trim(),
          cashIn: entry.kind === 'in' ? entry.amount : 0,
          cashOut: entry.kind === 'out' ? entry.amount : 0,
          balance: 0,
        },
      ])
      setRows(next)
      setSyncStatus(navigator.onLine ? 'local' : 'offline')
      await persistLocal(fileId, next, true, null)
      scheduleSync()
    },
    [persistLocal, scheduleSync],
  )

  return {
    books,
    activeId,
    rows,
    syncStatus,
    syncError,
    loading,
    loadError,
    selectBook,
    addEntry,
    retrySync: pushToDrive,
    reload: bootstrap,
  }
}
