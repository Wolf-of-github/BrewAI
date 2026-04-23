import { initializeApp } from 'firebase/app'
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithCustomToken } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

const AUTH_SERVICE_URL =
  import.meta.env.VITE_AUTH_SERVICE_URL ?? 'https://auth-service-nxyvtmg2na-uc.a.run.app'

const firebaseConfig = {
  apiKey: "AIzaSyCTS0kUJDrVbw74xDByZXrkOn27KPo-JH4",
  authDomain: "brew-prod-1723b.firebaseapp.com",
  projectId: "brew-prod-1723b",
  storageBucket: "brew-prod-1723b.firebasestorage.app",
  messagingSenderId: "191395174205",
  appId: "1:191395174205:web:d14c6acd22b541eb561754",
  measurementId: "G-923JGXB7JM"
}

const app = initializeApp(firebaseConfig)
export const auth = getAuth(app)
export const db = getFirestore(app)
const provider = new GoogleAuthProvider()

async function getErrorMessage(res: Response, fallback: string): Promise<string> {
  const body = await res.json().catch(() => null)
  if (body && typeof body === 'object' && 'error' in body && typeof body.error === 'string') {
    return body.error
  }
  return fallback
}

export async function signInWithGoogle(): Promise<void> {
  const result = await signInWithPopup(auth, provider)
  const idToken = await result.user.getIdToken()

  const res = await fetch(`${AUTH_SERVICE_URL}/auth/google`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken }),
  })

  if (!res.ok) {
    throw new Error(await getErrorMessage(res, 'Auth service error'))
  }

  const { token } = await res.json()

  // Store the JWT in a cookie (expires in 24h, same as the token)
  document.cookie = `brew_token=${token}; path=/; max-age=86400; SameSite=Strict`

  // Store display info for the UI (non-sensitive)
  const email = result.user.email ?? ''
  const picture = result.user.photoURL ?? ''
  document.cookie = `brew_email=${encodeURIComponent(email)}; path=/; max-age=86400; SameSite=Strict`
  document.cookie = `brew_picture=${encodeURIComponent(picture)}; path=/; max-age=86400; SameSite=Strict`
}

export async function signInToFirestore(customToken: string): Promise<void> {
  await signInWithCustomToken(auth, customToken)
}

export function signOut(): void {
  // Clear all brew cookies
  for (const name of ['brew_token', 'brew_email', 'brew_picture']) {
    document.cookie = `${name}=; path=/; max-age=0; SameSite=Strict`
  }
}

export function getCookieUser(): { email: string; picture: string } | null {
  const get = (name: string) => {
    const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`))
    return match ? decodeURIComponent(match[1]) : ''
  }
  const token = get('brew_token')
  if (!token) return null
  return { email: get('brew_email'), picture: get('brew_picture') }
}
