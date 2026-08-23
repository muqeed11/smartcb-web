/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GOOGLE_CLIENT_ID?: string
  readonly VITE_GOOGLE_API_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

interface GoogleTokenResponse {
  access_token?: string
  expires_in?: number
  error?: string
  error_description?: string
}

interface GoogleTokenClient {
  requestAccessToken: (override?: { prompt?: string }) => void
}

interface GooglePicker {
  Action: { PICKED: string; CANCEL: string; LOADED: string }
  Response: { ACTION: string; DOCUMENTS: string }
  Feature: { MULTISELECT_ENABLED: string }
  DocsView: new () => GooglePickerView
  PickerBuilder: new () => GooglePickerBuilder
}

interface GooglePickerView {
  setIncludeFolders: (include: boolean) => GooglePickerView
  setMimeTypes: (types: string) => GooglePickerView
}

interface GooglePickerBuilder {
  addView: (view: GooglePickerView) => GooglePickerBuilder
  enableFeature: (feature: string) => GooglePickerBuilder
  setOAuthToken: (token: string) => GooglePickerBuilder
  setDeveloperKey: (key: string) => GooglePickerBuilder
  setAppId: (id: string) => GooglePickerBuilder
  setTitle: (title: string) => GooglePickerBuilder
  setCallback: (callback: (data: Record<string, unknown>) => void) => GooglePickerBuilder
  build: () => { setVisible: (visible: boolean) => void }
}

interface Window {
  gapi?: {
    load: (api: string, callback: () => void) => void
  }
  google?: {
    picker?: GooglePicker
    accounts: {
      oauth2: {
        initTokenClient: (config: {
          client_id: string
          scope: string
          hint?: string
          include_granted_scopes?: boolean
          callback: (response: GoogleTokenResponse) => void
          error_callback?: (error: { type?: string; message?: string }) => void
        }) => GoogleTokenClient
        revoke: (token: string, done?: () => void) => void
      }
    }
  }
}
