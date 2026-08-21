import { serializeWorkbook, type LedgerRow } from '../ledger/excel'

const DRIVE = 'https://www.googleapis.com/drive/v3'
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3'
export const SMARTCB_FOLDER = 'SmartCB'
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
const XLS_MIME = 'application/vnd.ms-excel'

export type DriveBook = {
  id: string
  name: string
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
  const res = await driveFetch(token, `${DRIVE}/files?q=${query}&fields=files(id,name)&pageSize=10`)
  const data = (await res.json()) as { files?: DriveBook[] }
  const existing = data.files?.[0]
  if (existing?.id) return existing.id

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

export async function listBooks(token: string, folderId: string): Promise<DriveBook[]> {
  const query = encodeURIComponent(
    `'${folderId}' in parents and trashed=false and (mimeType='${XLSX_MIME}' or mimeType='${XLS_MIME}' or name contains '.xlsx' or name contains '.xls')`,
  )
  const res = await driveFetch(
    token,
    `${DRIVE}/files?q=${query}&fields=files(id,name)&orderBy=name&pageSize=100`,
  )
  const data = (await res.json()) as { files?: DriveBook[] }
  return data.files ?? []
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

export async function downloadBook(token: string, fileId: string): Promise<ArrayBuffer> {
  const res = await driveFetch(token, `${DRIVE}/files/${fileId}?alt=media`)
  return res.arrayBuffer()
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
  const res = await driveFetch(token, `${UPLOAD}/files?uploadType=multipart&fields=id,name`, {
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
): Promise<void> {
  const bytes = serializeWorkbook(rows)
  const { body, contentType } = multipartBody({ name, mimeType: XLSX_MIME }, bytes)
  await driveFetch(token, `${UPLOAD}/files/${fileId}?uploadType=multipart`, {
    method: 'PATCH',
    headers: { 'Content-Type': contentType },
    body,
  })
}
