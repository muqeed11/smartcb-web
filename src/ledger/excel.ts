import * as XLSX from 'xlsx'

export type LedgerRow = {
  date: string
  description: string
  cashIn: number
  cashOut: number
  balance: number
}

function toNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/,/g, '').trim())
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

function normalizeHeader(value: string): string {
  return value.toLowerCase().replace(/[^a-z]/g, '')
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

export function formatDateTime(date = new Date()): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

function formatCellDate(value: unknown): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return formatDateTime(value)
  }
  if (typeof value === 'number') {
    const parsed = XLSX.SSF.parse_date_code(value)
    if (parsed) {
      const date = new Date(parsed.y, parsed.m - 1, parsed.d, parsed.H, parsed.M, parsed.S)
      return formatDateTime(date)
    }
  }
  return String(value ?? '').trim()
}

export function recomputeBalances(rows: LedgerRow[]): LedgerRow[] {
  let balance = 0
  return rows.map((row) => {
    balance += row.cashIn - row.cashOut
    return { ...row, balance }
  })
}

export function parseWorkbook(buffer: ArrayBuffer): LedgerRow[] {
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true })
  const sheet = workbook.Sheets[workbook.SheetNames[0] ?? '']
  if (!sheet) return []

  const table = XLSX.utils.sheet_to_json<(string | number | Date | null)[]>(sheet, {
    header: 1,
    defval: '',
    raw: true,
  })
  if (table.length === 0) return []

  const headers = (table[0] ?? []).map((cell) => normalizeHeader(String(cell ?? '')))
  const dateIdx = headers.findIndex((h) => h.includes('date'))
  const descIdx = headers.findIndex((h) => h.includes('desc'))
  const inIdx = headers.findIndex((h) => h.includes('cashin') || h === 'in')
  const outIdx = headers.findIndex((h) => h.includes('cashout') || h.includes('expense') || h === 'out')
  const balIdx = headers.findIndex((h) => h.includes('balance'))

  const rows: LedgerRow[] = []
  for (let i = 1; i < table.length; i += 1) {
    const line = table[i] ?? []
    const description = String(descIdx >= 0 ? (line[descIdx] ?? '') : '').trim()
    const cashIn = toNumber(inIdx >= 0 ? line[inIdx] : 0)
    const cashOut = toNumber(outIdx >= 0 ? line[outIdx] : 0)
    if (!description && cashIn === 0 && cashOut === 0) continue
    rows.push({
      date: formatCellDate(dateIdx >= 0 ? line[dateIdx] : ''),
      description,
      cashIn,
      cashOut,
      balance: toNumber(balIdx >= 0 ? line[balIdx] : 0),
    })
  }
  return recomputeBalances(rows)
}

export function serializeWorkbook(rows: LedgerRow[]): Uint8Array {
  const table = [
    ['Date', 'Description', 'Cash In', 'Cash Out', 'Balance'],
    ...rows.map((row) => [row.date, row.description, row.cashIn, row.cashOut, row.balance]),
  ]
  const sheet = XLSX.utils.aoa_to_sheet(table)
  sheet['!cols'] = [{ wch: 22 }, { wch: 32 }, { wch: 12 }, { wch: 12 }, { wch: 12 }]
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, sheet, 'Ledger')
  const output = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer | Uint8Array
  return output instanceof Uint8Array ? output : new Uint8Array(output)
}

export function bookLabel(fileName: string): string {
  return fileName.replace(/\.(xlsx|xls)$/i, '')
}
