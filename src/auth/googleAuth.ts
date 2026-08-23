export const SCOPES = [
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/drive.file',
].join(' ')

const CLIENT_ID_KEY = 'smartcb.googleClientId'
const SESSION_KEY = 'smartcb.session.v2'
const LEGACY_SESSION_KEY = 'smartcb.session'
const DEFAULT_CLIENT_ID =
  '517810463661-jasm5nolp2ie75cic0fl9acts0sb5nek.apps.googleusercontent.com'

export type Session = {
  email: string
  name: string
  picture: string
  accessToken: string
  expiresAt: number
}

type TokenPrompt = '' | 'none' | 'consent' | 'select_account'

export class AuthExpiredError extends Error {
  constructor() {
    super('Google sign-in expired')
    this.name = 'AuthExpiredError'
  }
}

export function getClientId(): string {
  const fromEnv = import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim()
  if (fromEnv) return fromEnv
  const fromStorage = localStorage.getItem(CLIENT_ID_KEY)?.trim()
  if (fromStorage) return fromStorage
  return DEFAULT_CLIENT_ID
}

export function getProjectNumber(): string {
  return getClientId().split('-')[0] ?? ''
}

export function getPickerApiKey(): string {
  return import.meta.env.VITE_GOOGLE_API_KEY?.trim() ?? ''
}

export function saveClientId(id: string): void {
  localStorage.setItem(CLIENT_ID_KEY, id.trim())
}

export function getSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY) ?? localStorage.getItem(LEGACY_SESSION_KEY)
    if (!raw) return null
    const session = JSON.parse(raw) as Session
    if (!session.accessToken || !session.email) return null
    return session
  } catch {
    return null
  }
}

export function isTokenFresh(session: Session, skewMs = 60_000): boolean {
  return Number.isFinite(session.expiresAt) && Date.now() + skewMs < session.expiresAt
}

function saveSession(session: Session): void {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session))
  localStorage.removeItem(LEGACY_SESSION_KEY)
}

export function clearSession(): void {
  localStorage.removeItem(SESSION_KEY)
  localStorage.removeItem(LEGACY_SESSION_KEY)
}

function loadGis(): Promise<void> {
  if (window.google?.accounts?.oauth2) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-smartcb-gis]')
    if (existing) {
      existing.addEventListener('load', () => resolve())
      existing.addEventListener('error', () => reject(new Error('Failed to load Google Sign-In')))
      return
    }
    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.defer = true
    script.dataset.smartcbGis = '1'
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Failed to load Google Sign-In'))
    document.head.appendChild(script)
  })
}

async function fetchProfile(accessToken: string): Promise<Pick<Session, 'email' | 'name' | 'picture'>> {
  const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) throw new Error('Could not load Google profile')
  const data = (await res.json()) as { email?: string; name?: string; picture?: string }
  if (!data.email) throw new Error('Google account has no email')
  return {
    email: data.email,
    name: data.name ?? '',
    picture: data.picture ?? '',
  }
}

function expiryMs(expiresIn?: number): number {
  const seconds = Number(expiresIn)
  if (!Number.isFinite(seconds) || seconds <= 0) return 3600 * 1000
  return seconds * 1000
}

function requestToken(prompt: TokenPrompt, hint?: string): Promise<GoogleTokenResponse> {
  return new Promise((resolve, reject) => {
    void (async () => {
      try {
        await loadGis()
        const clientId = getClientId()
        if (!clientId) {
          reject(new Error('missing-client-id'))
          return
        }
        const oauth = window.google?.accounts.oauth2
        if (!oauth) {
          reject(new Error('Google Sign-In is unavailable'))
          return
        }
        const client = oauth.initTokenClient({
          client_id: clientId,
          scope: SCOPES,
          hint,
          include_granted_scopes: true,
          callback: (response) => {
            if (response.error) {
              reject(new Error(response.error_description || response.error))
              return
            }
            resolve(response)
          },
          error_callback: (error) => {
            reject(new Error(error.message || error.type || 'Sign-in cancelled'))
          },
        })
        client.requestAccessToken({ prompt })
      } catch (error) {
        reject(error instanceof Error ? error : new Error('Sign-in failed'))
      }
    })()
  })
}

let tokenRequest: Promise<Session> | null = null
let restorePromise: Promise<Session | null> | null = null

async function obtainSession(prompt: TokenPrompt, existing?: Session | null): Promise<Session> {
  if (tokenRequest) return tokenRequest
  tokenRequest = (async () => {
    const token = await requestToken(prompt, existing?.email)
    if (!token.access_token) throw new Error('No access token returned')
    const profile = existing?.email
      ? { email: existing.email, name: existing.name, picture: existing.picture }
      : await fetchProfile(token.access_token)
    const session: Session = {
      ...profile,
      accessToken: token.access_token,
      expiresAt: Date.now() + expiryMs(token.expires_in),
    }
    saveSession(session)
    return session
  })().finally(() => {
    tokenRequest = null
  })
  return tokenRequest
}

export async function signIn(prompt: Exclude<TokenPrompt, 'none'> = 'select_account'): Promise<Session> {
  const session = await obtainSession(prompt, getSession())
  restorePromise = Promise.resolve(session)
  return session
}

export async function restoreSession(): Promise<Session | null> {
  if (!restorePromise) {
    restorePromise = (async () => {
      const existing = getSession()
      if (!existing) return null
      if (isTokenFresh(existing)) return existing
      try {
        return await obtainSession('none', existing)
      } catch {
        return null
      }
    })()
  }
  return restorePromise
}

export async function logout(): Promise<void> {
  const session = getSession()
  restorePromise = null
  clearSession()
  if (session?.accessToken) {
    try {
      await loadGis()
      await new Promise<void>((resolve) => {
        window.google?.accounts.oauth2.revoke(session.accessToken, () => resolve())
        window.setTimeout(() => resolve(), 1200)
      })
    } catch {
      // Local session is already cleared.
    }
  }
}

export async function switchAccount(): Promise<Session> {
  await logout()
  return signIn('select_account')
}

export async function ensureFreshToken(): Promise<Session> {
  const existing = getSession()
  if (existing && isTokenFresh(existing, 60_000)) return existing
  try {
    return await obtainSession('none', existing)
  } catch {
    throw new AuthExpiredError()
  }
}
