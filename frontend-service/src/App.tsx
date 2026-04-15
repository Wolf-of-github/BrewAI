import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import './index.css'
import Navbar from './components/Navbar'
import Footer from './components/Footer'
import Home from './components/Home'
import Dashboard from './components/Dashboard'
import Profile from './components/Profile'
import Privacy from './components/Privacy'
import Terms from './components/Terms'
import { getCookieUser, signOut } from './lib/firebase'
import { ThemeProvider } from './context/ThemeContext'

function RequireAuth({ children }: { children: React.ReactNode }) {
  const user = getCookieUser()
  if (!user) return <Navigate to="/" replace />
  return <>{children}</>
}

function HomeRoute() {
  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--bg-base)' }}>
      <Navbar />
      <div className="flex-1">
        <Home />
      </div>
      <Footer />
    </div>
  )
}

function DashboardRoute() {
  const navigate = useNavigate()
  const user = getCookieUser()!

  function handleSignOut() {
    if (!window.confirm('Are you sure you want to sign out?')) return
    signOut()
    navigate('/', { replace: true })
  }

  return (
    <Dashboard
      user={user}
      onSignOut={handleSignOut}
      onProfile={() => navigate('/profile')}
      onHome={() => navigate('/')}
    />
  )
}

function ProfileRoute() {
  const navigate = useNavigate()
  const user = getCookieUser()!

  function handleSignOut() {
    if (!window.confirm('Are you sure you want to sign out?')) return
    signOut()
    navigate('/', { replace: true })
  }

  return (
    <Profile
      user={user}
      onBack={() => navigate('/dashboard')}
      onSignOut={handleSignOut}
    />
  )
}

export default function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<HomeRoute />} />
          <Route
            path="/dashboard"
            element={
              <RequireAuth>
                <DashboardRoute />
              </RequireAuth>
            }
          />
          <Route
            path="/profile"
            element={
              <RequireAuth>
                <ProfileRoute />
              </RequireAuth>
            }
          />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/terms" element={<Terms />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  )
}
