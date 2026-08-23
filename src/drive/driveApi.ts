import { serializeWorkbook, type LedgerRow } from '../ledger/excel'

const DRIVE = 'https://www.googleapis.com/drive/v3'
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3'
export const SMARTCB_FOLDER = 'SmartCB'
export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
export const XLS_MIME = 'application/vnd.ms-excel'
export const GOOGLE_SHEET_MIME = 'application/vnd.google-apps.spreadsheet'
const SHORTCUT_MIME = 'application/vnd.google-apps.shortcut'

export type DriveBook = {
  id: string
  name: string
  mimeType?: string
  modifiedTime?: string
}

type DriveListFile = DriveBook & {
  shortcutDetails?: { targetId?: string; targetMimeType?: string }
}

export function isGoogleSheet(mimeType?: string): boolean {
  return mimeType === GOOGLE_SHEET_MIME
}

export function bookKind(mimeType?: string): 'Google Sheet' | 'Excel' {
  return isGoogleSheet(mimeType) ? 'Google Sheet' : 'Excel'
}

export class DriveAuthError extends Error {
  constructor() {
    super('unauthorized')
    this.name = 'DriveAuthError'
  }
}

async function driveFetch(token: string, url: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers)
  headers.set('Authorization', `Bearer ${token}`)
  const res = await fetch(url, { ...init, headers })
  if (res.status === 401) throw new DriveAuthError()
  if (!res.ok) {
    const body = await res.text()
    throw new Error(body || `Drive request failed (${res.status})`)
  }
  return res
}

export async function findOrCreateFolder(token: string): Promise<string> {
  const query = encodeURIComponent(
    `name='${SMARTCB_FOLDER}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
  )
  const res = await driveFetch(
    token,
    `${DRIVE}/files?q=${query}&fields=files(id,name)&pageSize=10&supportsAllDrives=true&includeItemsFromAllDrives=true`,
  )
  const data = (await res.json()) as { files?: DriveBook[] }
  const folders = data.files ?? []
  if (folders.length === 0) {
    const created = await driveFetch(token, `${DRIVE}/files?fields=id,name`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: SMARTCB_FOLDER,
        mimeType: 'application/vnd.google-apps.folder',
      }),
    })
    const folder = (await created.json()) as DriveBook
    return folder.id
  }
  if (folders.length === 1 && folders[0]?.id) return folders[0].id

  for (const folder of folders) {
    if (!folder.id) continue
    const books = await listBooks(token, folder.id)
    if (books.length > 0) return folder.id
  }
  return folders[0].id
}

function isWorkbookMime(mimeType?: string): boolean {
  return (
    mimeType === XLSX_MIME ||
    mimeType === XLS_MIME ||
    mimeType === GOOGLE_SHEET_MIME ||
    Boolean(mimeType?.includes('spreadsheet'))
  )
}

export async function listBooks(token: string, folderId: string): Promise<DriveBook[]> {
  const query =
    `'${folderId}' in parents and trashed=false and (` +
    `mimeType='${XLSX_MIME}' or mimeType='${XLS_MIME}' or mimeType='${GOOGLE_SHEET_MIME}' or ` +
    `mimeType='${SHORTCUT_MIME}' or name contains '.xlsx' or name contains '.xls')`
  const files: DriveListFile[] = []
  let pageToken: string | undefined
  do {
    const params = new URLSearchParams({
      q: query,
      fields: 'nextPageToken,files(id,name,modifiedTime,mimeType,shortcutDetails(targetId,targetMimeType))',
      orderBy: 'name',
      pageSize: '100',
      supportsAllDrives: 'true',
      includeItemsFromAllDrives: 'true',
    })
    if (pageToken) params.set('pageToken', pageToken)
    const res = await driveFetch(token, `${DRIVE}/files?${params.toString()}`)
    const data = (await res.json()) as { files?: DriveListFile[]; nextPageToken?: string }
    files.push(...(data.files ?? []))
    pageToken = data.nextPageToken
  } while (pageToken)

  const books: DriveBook[] = []
  for (const file of files) {
    if (file.mimeType === SHORTCUT_MIME) {
      const targetId = file.shortcutDetails?.targetId
      const targetMime = file.shortcutDetails?.targetMimeType
      if (!targetId || !isWorkbookMime(targetMime)) continue
      books.push({
        id: targetId,
        name: file.name,
        mimeType: targetMime,
        modifiedTime: file.modifiedTime,
      })
      continue
    }
    books.push({
      id: file.id,
      name: file.name,
      mimeType: file.mimeType,
      modifiedTime: file.modifiedTime,
    })
  }
  return books
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(buffer).set(bytes)
  return buffer
}

function multipartBody(metadata: object, bytes: Uint8Array): { body: Blob; contentType: string } {
  const boundary = `smartcb_${crypto.randomUUID().replace(/-/g, '')}`
  const metaPart =
    `--${boundary}\r\n` +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    `${JSON.stringify(metadata)}\r\n`
  const fileHead = `--${boundary}\r\nContent-Type: ${XLSX_MIME}\r\n\r\n`
  const closing = `\r\n--${boundary}--`
  const body = new Blob([metaPart, fileHead, toArrayBuffer(bytes), closing])
  return { body, contentType: `multipart/related; boundary=${boundary}` }
}

export async function downloadBook(token: string, fileId: string, mimeType?: string): Promise<ArrayBuffer> {
  const url = isGoogleSheet(mimeType)
    ? `${DRIVE}/files/${fileId}/export?mimeType=${encodeURIComponent(XLSX_MIME)}`
    : `${DRIVE}/files/${fileId}?alt=media`
  const res = await driveFetch(token, url)
  return res.arrayBuffer()
}

export async function getBook(token: string, fileId: string): Promise<DriveBook> {
  const res = await driveFetch(
    token,
    `${DRIVE}/files/${fileId}?fields=id,name,mimeType,modifiedTime&supportsAllDrives=true`,
  )
  return (await res.json()) as DriveBook
}

export async function createBook(
  token: string,
  folderId: string,
  name: string,
  rows: LedgerRow[] = [],
): Promise<DriveBook> {
  const bytes = serializeWorkbook(rows)
  const { body, contentType } = multipartBody(
    { name, mimeType: XLSX_MIME, parents: [folderId] },
    bytes,
  )
  const res = await driveFetch(token, `${UPLOAD}/files?uploadType=multipart&fields=id,name,mimeType,modifiedTime`, {
    method: 'POST',
    headers: { 'Content-Type': contentType },
    body,
  })
  return (await res.json()) as DriveBook
}

export async function uploadBook(
  token: string,
  fileId: string,
  name: string,
  rows: LedgerRow[],
  previous?: ArrayBuffer | null,
  sheetName?: string,
  mimeType?: string,
): Promise<ArrayBuffer> {
  const bytes = serializeWorkbook(rows, previous, sheetName)
  const metadata = isGoogleSheet(mimeType) ? { name } : { name, mimeType: XLSX_MIME }
  const { body, contentType } = multipartBody(metadata, bytes)
  await driveFetch(token, `${UPLOAD}/files/${fileId}?uploadType=multipart`, {
    method: 'PATCH',
    headers: { 'Content-Type': contentType },
    body,
  })
  return toArrayBuffer(bytes)
}
