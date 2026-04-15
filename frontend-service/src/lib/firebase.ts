import { initializeApp } from 'firebase/app'
import { getAuth, GoogleAuthProvider, signInWithPopup } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: "AIzaSyDdeXplm3_YKXytDfJuUqQUrd6YzTWQjM8",
  authDomain: "brewai-490803.firebaseapp.com",
  projectId: "brewai-490803",
  storageBucket: "brewai-490803.firebasestorage.app",
  messagingSenderId: "492446558940",
  appId: "1:492446558940:web:bdb215b0890eba786b6219",
  measurementId: "G-GBTSQXLFNK"
}

const app = initializeApp(firebaseConfig)
export const auth = getAuth(app)
export const db = getFirestore(app)
const provider = new GoogleAuthProvider()

export async function signInWithGoogle(): Promise<void> {
  const result = await signInWithPopup(auth, provider)
  const idToken = await result.user.getIdToken()

  const res = await fetch('https://auth-service-qtxt6w75sq-wl.a.run.app/auth/google', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken }),
  })

  if (!res.ok) throw new Error('Auth service error')

  const { token } = await res.json()

  // Store the JWT in a cookie (expires in 24h, same as the token)
  document.cookie = `brew_token=${token}; path=/; max-age=86400; SameSite=Strict`

  // Store display info for the UI (non-sensitive)
  const email = result.user.email ?? ''
  const picture = result.user.photoURL ?? ''
  document.cookie = `brew_email=${encodeURIComponent(email)}; path=/; max-age=86400; SameSite=Strict`
  document.cookie = `brew_picture=${encodeURIComponent(picture)}; path=/; max-age=86400; SameSite=Strict`
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
