import { getPickerApiKey, getProjectNumber } from '../auth/googleAuth'
import {
  GOOGLE_SHEET_MIME,
  XLS_MIME,
  XLSX_MIME,
  type DriveBook,
} from './driveApi'

const WORKBOOK_MIMES = [XLSX_MIME, XLS_MIME, GOOGLE_SHEET_MIME].join(',')

function loadPicker(): Promise<void> {
  if (window.google?.picker) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-smartcb-picker]')
    const onReady = () => {
      const gapi = window.gapi
      if (!gapi) {
        reject(new Error('Google Picker failed to load'))
        return
      }
      gapi.load('picker', () => resolve())
    }
    if (existing) {
      existing.addEventListener('load', onReady)
      existing.addEventListener('error', () => reject(new Error('Google Picker failed to load')))
      return
    }
    const script = document.createElement('script')
    script.src = 'https://apis.google.com/js/api.js'
    script.async = true
    script.dataset.smartcbPicker = '1'
    script.onload = onReady
    script.onerror = () => reject(new Error('Google Picker failed to load'))
    document.head.appendChild(script)
  })
}

export function canPickFromDrive(): boolean {
  return Boolean(getPickerApiKey())
}

export async function pickWorkbooks(accessToken: string): Promise<DriveBook[]> {
  const apiKey = getPickerApiKey()
  if (!apiKey) {
    throw new Error('Add a Google Picker API key to choose existing Drive files.')
  }
  await loadPicker()
  const pickerApi = window.google?.picker
  if (!pickerApi) throw new Error('Google Picker is unavailable')

  return new Promise((resolve) => {
    const view = new pickerApi.DocsView()
      .setIncludeFolders(false)
      .setMimeTypes(WORKBOOK_MIMES)
    const picker = new pickerApi.PickerBuilder()
      .addView(view)
      .enableFeature(pickerApi.Feature.MULTISELECT_ENABLED)
      .setOAuthToken(accessToken)
      .setDeveloperKey(apiKey)
      .setAppId(getProjectNumber())
      .setTitle('Choose Excel or Google Sheets')
      .setCallback((data) => {
        if (data[pickerApi.Response.ACTION] === pickerApi.Action.PICKED) {
          const docs = (data[pickerApi.Response.DOCUMENTS] ?? []) as PickerDoc[]
          resolve(
            docs.map((doc) => ({
              id: doc.id,
              name: doc.name,
              mimeType: doc.mimeType,
            })),
          )
          return
        }
        if (data[pickerApi.Response.ACTION] === pickerApi.Action.CANCEL) {
          resolve([])
        }
      })
      .build()
    picker.setVisible(true)
  })
}

type PickerDoc = {
  id: string
  name: string
  mimeType?: string
}
