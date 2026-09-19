import Dexie, { type Table } from 'dexie'
import type { LedgerRow } from '../ledger/excel'

export type CachedBook = {
  fileId: string
  userEmail: string
  name: string
  folderId: string
  rows: LedgerRow[]
  dirty: boolean
  lastSyncedAt: number | null
  sheetName?: string
  sheets?: string[]
}

class SmartCBDatabase extends Dexie {
  books!: Table<CachedBook, string>

  constructor() {
    super('smartcb')
    this.version(1).stores({
      books: 'fileId, userEmail',
    })
  }
}

export const db = new SmartCBDatabase()

export async function getCachedBook(fileId: string): Promise<CachedBook | undefined> {
  return db.books.get(fileId)
}

export async function listCachedBooks(email: string): Promise<CachedBook[]> {
  return db.books.where('userEmail').equals(email).toArray()
}

export async function saveCachedBook(book: CachedBook): Promise<void> {
  await db.books.put(book)
}
