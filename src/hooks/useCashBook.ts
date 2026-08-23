import { useCallback, useEffect, useRef, useState } from 'react'
import { AuthExpiredError, ensureFreshToken, type Session } from '../auth/googleAuth'
import { getCachedBook, saveCachedBook } from '../db/localDb'
import {
  createBook,
  downloadBook,
  DriveAuthError,
  findOrCreateFolder,
  getBook,
  listBooks,
  uploadBook,
  type DriveBook,
} from '../drive/driveApi'
import { pickWorkbooks } from '../drive/picker'
import {
  bytesToArrayBuffer,
  formatDateTime,
  listSheetNames,
  parseWorkbook,
  recomputeBalances,
  serializeWorkbook,
  type LedgerRow,
} from '../ledger/excel'

export type SyncStatus = 'idle' | 'local' | 'syncing' | 'synced' | 'offline' | 'error'

const LAST_BOOK_KEY = 'smartcb.lastBookId'

function lastBookKey(email: string): string {
  return `${LAST_BOOK_KEY}.${email}`
}

function pickedKey(email: string): string {
  return `smartcb.pickedFileIds.${email}`
}

function loadPickedIds(email: string): string[] {
  try {
    const raw = localStorage.getItem(pickedKey(email))
    const parsed = raw ? (JSON.parse(raw) as unknown) : []
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : []
  } catch {
    return []
  }
}

function savePickedIds(email: string, ids: string[]): void {
  localStorage.setItem(pickedKey(email), JSON.stringify([...new Set(ids)]))
}

function mergeBooks(current: DriveBook[], extra: DriveBook[]): DriveBook[] {
  const byId = new Map(current.map((book) => [book.id, book]))
  for (const book of extra) byId.set(book.id, book)
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name))
}

async function loadPickedBooks(token: string, email: string): Promise<DriveBook[]> {
  const books: DriveBook[] = []
  for (const fileId of loadPickedIds(email)) {
    try {
      books.push(await getBook(token, fileId))
    } catch {
      // Picked file may have been deleted or access revoked.
    }
  }
  return books
}

function withXlsx(name: string): string {
  const trimmed = name.trim() || 'Cash Book'
  return /\.(xlsx|xls)$/i.test(trimmed) ? trimmed.replace(/\.xls$/i, '.xlsx') : `${trimmed}.xlsx`
}

export function useCashBook(session: Session | null, onAuthExpired: () => void) {
  const [books, setBooks] = useState<DriveBook[]>([])
  const [folderId, setFolderId] = useState<string | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [lastBookId, setLastBookId] = useState<string | null>(null)
  const [rows, setRows] = useState<LedgerRow[]>([])
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle')
  const [syncError, setSyncError] = useState<string | null>(null)
  const [listing, setListing] = useState(true)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [sheets, setSheets] = useState<string[]>([])
  const [activeSheet, setActiveSheet] = useState<string | null>(null)

  const rowsRef = useRef<LedgerRow[]>([])
  const booksRef = useRef<DriveBook[]>([])
  const folderRef = useRef<string | null>(null)
  const activeRef = useRef<string | null>(null)
  const sheetRef = useRef<string | null>(null)
  const sourceRef = useRef<ArrayBuffer | null>(null)
  const timerRef = useRef<number | null>(null)
  const onAuthExpiredRef = useRef(onAuthExpired)

  rowsRef.current = rows
  booksRef.current = books
  folderRef.current = folderId
  activeRef.current = activeId
  sheetRef.current = activeSheet
  onAuthExpiredRef.current = onAuthExpired

  const rememberBook = useCallback((email: string, fileId: string) => {
    localStorage.setItem(lastBookKey(email), fileId)
    setLastBookId(fileId)
  }, [])

  const handleAuthError = useCallback((error: unknown) => {
    if (error instanceof DriveAuthError || error instanceof AuthExpiredError) {
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
        sheetName: sheetRef.current ?? undefined,
      })
    },
    [session?.email],
  )

  const pushToDrive = useCallback(async (): Promise<boolean> => {
    const fileId = activeRef.current
    if (!fileId || !navigator.onLine) {
      if (!navigator.onLine) setSyncStatus('offline')
      return false
    }
    setSyncStatus('syncing')
    setSyncError(null)
    try {
      const fresh = await ensureFreshToken()
      const book = booksRef.current.find((item) => item.id === fileId)
      if (!book) return false
      sourceRef.current = await uploadBook(
        fresh.accessToken,
        fileId,
        book.name,
        rowsRef.current,
        sourceRef.current,
        sheetRef.current ?? 'Ledger',
        book.mimeType,
      )
      await persistLocal(fileId, rowsRef.current, false, Date.now())
      setSyncStatus('synced')
      return true
    } catch (error) {
      if (handleAuthError(error)) return false
      setSyncStatus('error')
      setSyncError(error instanceof Error ? error.message : 'Could not sync to Drive')
      return false
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
      const buffer = await downloadBook(token, book.id, book.mimeType)
      const names = listSheetNames(buffer)
      const preferred =
        (cached?.sheetName && names.includes(cached.sheetName) ? cached.sheetName : null) ??
        names.find((name) => parseWorkbook(buffer, name).length > 0) ??
        names[0] ??
        'Ledger'
      setSheets(names)
      setActiveSheet(preferred)
      sheetRef.current = preferred

      if (cached?.dirty && cached.userEmail === email) {
        setRows(cached.rows)
        sourceRef.current = bytesToArrayBuffer(serializeWorkbook(cached.rows, buffer, preferred))
        setSyncStatus('local')
        scheduleSync()
        return
      }

      const parsed = parseWorkbook(buffer, preferred)
      sourceRef.current = buffer
      setRows(parsed)
      await saveCachedBook({
        fileId: book.id,
        userEmail: email,
        name: book.name,
        folderId: folderRef.current ?? '',
        rows: parsed,
        dirty: false,
        lastSyncedAt: Date.now(),
        sheetName: preferred,
      })
      setSyncStatus('synced')
    },
    [scheduleSync],
  )

  const bootstrap = useCallback(async () => {
    if (!session) {
      setListing(false)
      return
    }
    setListing(true)
    setLoadError(null)
    setActiveId(null)
    activeRef.current = null
    setRows([])
    setSheets([])
    setActiveSheet(null)
    sheetRef.current = null
    sourceRef.current = null
    try {
      const fresh = await ensureFreshToken()
      const folder = await findOrCreateFolder(fresh.accessToken)
      setFolderId(folder)
      folderRef.current = folder
      const listed = mergeBooks(
        await listBooks(fresh.accessToken, folder),
        await loadPickedBooks(fresh.accessToken, fresh.email),
      )
      setBooks(listed)
      booksRef.current = listed
      setLastBookId(localStorage.getItem(lastBookKey(fresh.email)))
    } catch (error) {
      if (handleAuthError(error)) return
      setLoadError(error instanceof Error ? error.message : 'Could not read sheets in SmartCB')
    } finally {
      setListing(false)
    }
  }, [handleAuthError, session])

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
      if (!session) return
      const book = booksRef.current.find((item) => item.id === fileId)
      if (!book) return
      setActiveId(fileId)
      activeRef.current = fileId
      setLoading(true)
      setLoadError(null)
      try {
        const fresh = await ensureFreshToken()
        await loadBook(fresh.accessToken, fresh.email, book)
        rememberBook(session.email, fileId)
      } catch (error) {
        if (handleAuthError(error)) return
        setLoadError(error instanceof Error ? error.message : 'Could not open this sheet')
        setActiveId(null)
        activeRef.current = null
      } finally {
        setLoading(false)
      }
    },
    [handleAuthError, loadBook, rememberBook, session],
  )

  const createNewBook = useCallback(
    async (rawName: string) => {
      if (!session) return
      const fresh = await ensureFreshToken()
      const folder = folderRef.current ?? (await findOrCreateFolder(fresh.accessToken))
      setFolderId(folder)
      folderRef.current = folder
      const created = await createBook(fresh.accessToken, folder, withXlsx(rawName))
      const listed = mergeBooks(booksRef.current, [created])
      setBooks(listed)
      booksRef.current = listed
      await selectBook(created.id)
    },
    [selectBook, session],
  )

  const importFromDrive = useCallback(async () => {
    if (!session) return
    const fresh = await ensureFreshToken()
    const picked = await pickWorkbooks(fresh.accessToken)
    if (picked.length === 0) return
    savePickedIds(fresh.email, [...loadPickedIds(fresh.email), ...picked.map((book) => book.id)])
    const listed = mergeBooks(booksRef.current, picked)
    setBooks(listed)
    booksRef.current = listed
  }, [session])

  const closeBook = useCallback(() => {
    setActiveId(null)
    activeRef.current = null
    setRows([])
    setSheets([])
    setActiveSheet(null)
    sheetRef.current = null
    sourceRef.current = null
    setSyncStatus('idle')
    setSyncError(null)
    setLoadError(null)
  }, [])

  const selectSheet = useCallback(
    async (name: string) => {
      const fileId = activeRef.current
      if (!fileId || !sourceRef.current || name === sheetRef.current) return
      sourceRef.current = bytesToArrayBuffer(
        serializeWorkbook(rowsRef.current, sourceRef.current, sheetRef.current ?? 'Ledger'),
      )
      await persistLocal(fileId, rowsRef.current, true, null)
      const uploaded = await pushToDrive()
      setActiveSheet(name)
      sheetRef.current = name
      const parsed = parseWorkbook(sourceRef.current, name)
      setRows(parsed)
      await persistLocal(fileId, parsed, !uploaded, uploaded ? Date.now() : null)
    },
    [persistLocal, pushToDrive],
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
      sourceRef.current = bytesToArrayBuffer(
        serializeWorkbook(next, sourceRef.current, sheetRef.current ?? 'Ledger'),
      )
      setSyncStatus(navigator.onLine ? 'local' : 'offline')
      await persistLocal(fileId, next, true, null)
      scheduleSync()
    },
    [persistLocal, scheduleSync],
  )

  return {
    books,
    activeId,
    lastBookId,
    rows,
    syncStatus,
    syncError,
    listing,
    loading,
    loadError,
    sheets,
    activeSheet,
    selectBook,
    selectSheet,
    createNewBook,
    importFromDrive,
    closeBook,
    addEntry,
    retrySync: pushToDrive,
    reload: bootstrap,
  }
}
