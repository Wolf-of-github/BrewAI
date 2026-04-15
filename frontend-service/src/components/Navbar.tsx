import { useNavigate } from 'react-router-dom'
import { Sun, Moon } from 'lucide-react'
import { signInWithGoogle, getCookieUser } from '../lib/firebase'
import { useTheme } from '../context/ThemeContext'

export default function Navbar() {
  const navigate = useNavigate()
  const { theme, toggleTheme } = useTheme()

  async function handleSignIn() {
    if (getCookieUser()) {
      navigate('/dashboard')
      return
    }
    await signInWithGoogle()
    navigate('/dashboard')
  }

  return (
    <nav
      className="sticky top-0 z-50 border-b backdrop-blur-md"
      style={{
        background: 'var(--navbar-bg)',
        borderColor: 'var(--border)',
      }}
    >
      <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
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
          {/* Theme toggle */}
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
            className="text-sm font-medium px-4 py-2 rounded-lg transition-colors"
            style={{
              background: 'var(--accent)',
              color: 'var(--accent-text)',
            }}
          >
            Sign In
          </button>
        </div>
      </div>
    </nav>
  )
}
