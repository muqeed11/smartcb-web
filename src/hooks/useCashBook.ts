import { useCallback, useEffect, useRef, useState } from 'react'
import { AuthExpiredError, ensureFreshToken, signIn, type Session } from '../auth/googleAuth'
import { getCachedBook, listCachedBooks, saveCachedBook, type CachedBook } from '../db/localDb'
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
const CATALOG_KEY = 'smartcb.catalog.v1'

type BookCatalog = { folderId: string; books: DriveBook[] }

function lastBookKey(email: string): string {
  return `${LAST_BOOK_KEY}.${email}`
}

function catalogKey(email: string): string {
  return `${CATALOG_KEY}.${email}`
}

function loadCatalog(email: string): BookCatalog | null {
  try {
    const raw = localStorage.getItem(catalogKey(email))
    if (!raw) return null
    const parsed = JSON.parse(raw) as BookCatalog
    if (!parsed.folderId || !Array.isArray(parsed.books)) return null
    return parsed
  } catch {
    return null
  }
}

function saveCatalog(email: string, folderId: string, books: DriveBook[]): void {
  localStorage.setItem(catalogKey(email), JSON.stringify({ folderId, books }))
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

export function useCashBook(session: Session | null, onAuthExpired?: () => void) {
  const email = session?.email
  const initialCatalog = email ? loadCatalog(email) : null

  const [books, setBooks] = useState<DriveBook[]>(initialCatalog?.books ?? [])
  const [folderId, setFolderId] = useState<string | null>(initialCatalog?.folderId ?? null)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [lastBookId, setLastBookId] = useState<string | null>(() =>
    email ? localStorage.getItem(lastBookKey(email)) : null,
  )
  const [rows, setRows] = useState<LedgerRow[]>([])
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle')
  const [syncError, setSyncError] = useState<string | null>(null)
  const [listing, setListing] = useState(!initialCatalog?.books.length)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [authExpired, setAuthExpired] = useState(false)
  const [sheets, setSheets] = useState<string[]>([])
  const [activeSheet, setActiveSheet] = useState<string | null>(null)

  const rowsRef = useRef<LedgerRow[]>([])
  const booksRef = useRef<DriveBook[]>([])
  const folderRef = useRef<string | null>(null)
  const activeRef = useRef<string | null>(null)
  const sheetRef = useRef<string | null>(null)
  const sheetsRef = useRef<string[]>([])
  const sourceRef = useRef<ArrayBuffer | null>(null)
  const timerRef = useRef<number | null>(null)
  const onAuthExpiredRef = useRef(onAuthExpired)

  rowsRef.current = rows
  booksRef.current = books
  folderRef.current = folderId
  activeRef.current = activeId
  sheetRef.current = activeSheet
  sheetsRef.current = sheets
  onAuthExpiredRef.current = onAuthExpired

  const rememberBook = useCallback((email: string, fileId: string) => {
    localStorage.setItem(lastBookKey(email), fileId)
    setLastBookId(fileId)
  }, [])

  const handleAuthError = useCallback((error: unknown) => {
    if (error instanceof DriveAuthError || error instanceof AuthExpiredError) {
      setAuthExpired(true)
      onAuthExpiredRef.current?.()
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
        sheets: sheetsRef.current,
      })
    },
    [session?.email],
  )

  const pushToDrive = useCallback(async (interactive = false): Promise<boolean> => {
    const fileId = activeRef.current
    if (!fileId || !navigator.onLine) {
      if (!navigator.onLine) setSyncStatus('offline')
      return false
    }
    setSyncStatus('syncing')
    setSyncError(null)
    try {
      const fresh = await ensureFreshToken({ interactive })
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
      setAuthExpired(false)
      return true
    } catch (error) {
      if (handleAuthError(error)) {
        setSyncStatus('offline')
        return false
      }
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

  const applyCachedLedger = useCallback((cached: CachedBook) => {
    const sheet = cached.sheetName ?? 'Ledger'
    const names = cached.sheets?.length ? cached.sheets : [sheet]
    setSheets(names)
    setActiveSheet(sheet)
    sheetRef.current = sheet
    setRows(cached.rows)
    sourceRef.current = bytesToArrayBuffer(serializeWorkbook(cached.rows, null, sheet))
    setSyncStatus(cached.dirty ? 'local' : 'offline')
    if (cached.folderId) {
      setFolderId(cached.folderId)
      folderRef.current = cached.folderId
    }
  }, [])

  const loadBook = useCallback(
    async (token: string, email: string, book: DriveBook) => {
      const cached = await getCachedBook(book.id)
      if (cached?.userEmail === email) applyCachedLedger(cached)

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
        sheets: names,
      })
      setSyncStatus('synced')
      setAuthExpired(false)
    },
    [applyCachedLedger, scheduleSync],
  )

  const rememberCatalog = useCallback((email: string, folder: string, listed: DriveBook[]) => {
    setFolderId(folder)
    folderRef.current = folder
    setBooks(listed)
    booksRef.current = listed
    saveCatalog(email, folder, listed)
    setLastBookId(localStorage.getItem(lastBookKey(email)))
    setAuthExpired(false)
  }, [])

  const hydrateLocal = useCallback(async (email: string): Promise<boolean> => {
    setLastBookId(localStorage.getItem(lastBookKey(email)))
    const catalog = loadCatalog(email)
    if (catalog) {
      setFolderId(catalog.folderId)
      folderRef.current = catalog.folderId
      setBooks(catalog.books)
      booksRef.current = catalog.books
      return catalog.books.length > 0
    }
    const cached = await listCachedBooks(email)
    if (cached.length === 0) return false
    const folder = cached.find((item) => item.folderId)?.folderId ?? ''
    const listed = cached.map((item) => ({ id: item.fileId, name: item.name }))
    if (folder) {
      setFolderId(folder)
      folderRef.current = folder
    }
    setBooks(listed)
    booksRef.current = listed
    return true
  }, [])

  const refreshFromDrive = useCallback(
    async (interactive = false) => {
      const fresh = await ensureFreshToken({ interactive })
      const folder = await findOrCreateFolder(fresh.accessToken)
      const listed = mergeBooks(
        await listBooks(fresh.accessToken, folder),
        await loadPickedBooks(fresh.accessToken, fresh.email),
      )
      rememberCatalog(fresh.email, folder, listed)
      return fresh
    },
    [rememberCatalog],
  )

  const bootstrap = useCallback(async () => {
    if (!email) {
      setListing(false)
      return
    }
    setActiveId(null)
    activeRef.current = null
    setRows([])
    setSheets([])
    setActiveSheet(null)
    sheetRef.current = null
    sourceRef.current = null
    setLoadError(null)
    const hadCache = await hydrateLocal(email)
    setListing(!hadCache)
    try {
      await refreshFromDrive(false)
    } catch (error) {
      if (handleAuthError(error)) return
      if (!hadCache) {
        setLoadError(error instanceof Error ? error.message : 'Could not read sheets in SmartCB')
      }
    } finally {
      setListing(false)
    }
  }, [email, handleAuthError, hydrateLocal, refreshFromDrive])

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
      setLoadError(null)
      const cached = await getCachedBook(fileId)
      const hasCache = cached?.userEmail === session.email
      if (hasCache && cached) applyCachedLedger(cached)
      setLoading(!hasCache)
      try {
        const fresh = await ensureFreshToken({ interactive: true })
        await loadBook(fresh.accessToken, fresh.email, book)
        rememberBook(session.email, fileId)
        setAuthExpired(false)
      } catch (error) {
        if (hasCache) {
          if (!handleAuthError(error)) {
            setSyncStatus('error')
            setSyncError(error instanceof Error ? error.message : 'Could not refresh this sheet')
          }
          rememberBook(session.email, fileId)
          if (cached?.dirty) scheduleSync()
          return
        }
        if (handleAuthError(error)) {
          setActiveId(null)
          activeRef.current = null
          return
        }
        setLoadError(error instanceof Error ? error.message : 'Could not open this sheet')
        setActiveId(null)
        activeRef.current = null
      } finally {
        setLoading(false)
      }
    },
    [applyCachedLedger, handleAuthError, loadBook, rememberBook, scheduleSync, session],
  )

  const createNewBook = useCallback(
    async (rawName: string) => {
      if (!session) return
      const fresh = await ensureFreshToken({ interactive: true })
      const folder = folderRef.current ?? (await findOrCreateFolder(fresh.accessToken))
      setFolderId(folder)
      folderRef.current = folder
      const created = await createBook(fresh.accessToken, folder, withXlsx(rawName))
      const listed = mergeBooks(booksRef.current, [created])
      rememberCatalog(fresh.email, folder, listed)
      await selectBook(created.id)
    },
    [rememberCatalog, selectBook, session],
  )

  const importFromDrive = useCallback(async () => {
    if (!session) return
    const fresh = await ensureFreshToken({ interactive: true })
    const picked = await pickWorkbooks(fresh.accessToken)
    if (picked.length === 0) return
    savePickedIds(fresh.email, [...loadPickedIds(fresh.email), ...picked.map((book) => book.id)])
    const listed = mergeBooks(booksRef.current, picked)
    const folder = folderRef.current ?? (await findOrCreateFolder(fresh.accessToken))
    rememberCatalog(fresh.email, folder, listed)
  }, [rememberCatalog, session])

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
      const uploaded = await pushToDrive(true)
      setActiveSheet(name)
      sheetRef.current = name
      const parsed = parseWorkbook(sourceRef.current, name)
      setRows(parsed)
      await persistLocal(fileId, parsed, !uploaded, uploaded ? Date.now() : null)
    },
    [persistLocal, pushToDrive],
  )

  const commitRows = useCallback(
    async (next: LedgerRow[]) => {
      const fileId = activeRef.current
      if (!fileId) return
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

  const addEntry = useCallback(
    async (entry: { description: string; amount: number; kind: 'in' | 'out' }) => {
      await commitRows(
        recomputeBalances([
          ...rowsRef.current,
          {
            date: formatDateTime(),
            description: entry.description.trim(),
            cashIn: entry.kind === 'in' ? entry.amount : 0,
            cashOut: entry.kind === 'out' ? entry.amount : 0,
            balance: 0,
          },
        ]),
      )
    },
    [commitRows],
  )

  const updateLatest = useCallback(
    async (entry: { description: string; amount: number; kind: 'in' | 'out' }) => {
      const current = rowsRef.current
      if (current.length === 0) return
      const last = current.at(-1)
      if (!last) return
      await commitRows(
        recomputeBalances([
          ...current.slice(0, -1),
          {
            date: last.date,
            description: entry.description.trim(),
            cashIn: entry.kind === 'in' ? entry.amount : 0,
            cashOut: entry.kind === 'out' ? entry.amount : 0,
            balance: 0,
          },
        ]),
      )
    },
    [commitRows],
  )

  const reconnect = useCallback(async () => {
    if (!email) return
    try {
      await signIn('')
    } catch {
      await signIn('select_account')
    }
    setAuthExpired(false)
    const fresh = await refreshFromDrive(false)
    const fileId = activeRef.current
    if (!fileId) return
    const book = booksRef.current.find((item) => item.id === fileId)
    if (book) await loadBook(fresh.accessToken, fresh.email, book)
  }, [email, loadBook, refreshFromDrive])

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
    authExpired,
    sheets,
    activeSheet,
    selectBook,
    selectSheet,
    createNewBook,
    importFromDrive,
    closeBook,
    addEntry,
    updateLatest,
    reconnect,
    retrySync: () => pushToDrive(true),
    reload: bootstrap,
  }
}
