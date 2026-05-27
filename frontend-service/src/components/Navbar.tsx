import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Sun, Moon } from 'lucide-react'
import { signInWithGoogle, getCookieUser } from '../lib/firebase'
import { useTheme } from '../context/ThemeContext'

export default function Navbar() {
  const navigate = useNavigate()
  const { theme, toggleTheme } = useTheme()
  const [loading, setLoading] = useState(false)

  async function handleSignIn() {
    if (getCookieUser()) {
      navigate('/dashboard')
      return
    }
    setLoading(true)
    try {
      await signInWithGoogle()
      navigate('/dashboard')
    } finally {
      setLoading(false)
    }
  }

  return (
    <nav
      className="sticky top-0 z-50 border-b backdrop-blur-md"
      style={{
        background: 'var(--navbar-bg)',
        borderColor: 'var(--border)',
      }}
    >
      <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 sm:h-16 flex items-center justify-between">
        <button
          id="home-button"
          onClick={() => navigate('/')}
          className="flex items-center gap-2 cursor-pointer bg-transparent border-none p-0"
        >
          <img src="/brew.png" alt="Brew AI" className="w-7 h-7 object-contain" />
          <span className="font-semibold tracking-tight" style={{ color: 'var(--text-primary)' }}>
            Brew AI
          </span>
        </button>

        <div className="flex items-center gap-3">
          <button
            onClick={toggleTheme}
            aria-label="Toggle theme"
            className="w-8 h-8 flex items-center justify-center rounded-lg transition-colors"
            style={{
              background: 'var(--blue-subtle)',
              color: 'var(--text-muted)',
            }}
          >
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>

          <button
            onClick={handleSignIn}
            disabled={loading}
            className="text-sm font-medium px-4 py-2 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              background: 'var(--accent)',
              color: 'var(--accent-text)',
            }}
          >
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </div>
      </div>
    </nav>
  )
}
