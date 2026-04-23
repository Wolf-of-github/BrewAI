import { useState, useEffect } from 'react'
import {
  User,
  Mail,
  LogOut,
  ChevronLeft,
  Sparkles,
  FileText,
  Download,
  Sun,
  Moon,
  BarChart2,
  Tag,
} from 'lucide-react'
import { useTheme } from '../context/ThemeContext'
import { getBillingStatus } from '../lib/api'

// ─── Sub-components ────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-bold uppercase tracking-widest mb-4" style={{ color: 'var(--text-faint)' }}>
      {children}
    </p>
  )
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: number | string }) {
  return (
    <div
      className="flex-1 flex flex-col gap-1.5 rounded-xl p-4"
      style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
    >
      <div className="flex items-center gap-2" style={{ color: 'var(--text-faint)' }}>
        {icon}
        <span className="text-xs">{label}</span>
      </div>
      <p className="text-2xl font-bold tabular-nums" style={{ color: 'var(--text-primary)' }}>{value}</p>
    </div>
  )
}

// ─── Profile Navbar ────────────────────────────────────────────────────────────

function ProfileNavbar({ onBack, onSignOut }: { onBack: () => void; onSignOut: () => void }) {
  const { theme, toggleTheme } = useTheme()

  return (
    <nav
      className="sticky top-0 z-50 border-b backdrop-blur-md"
      style={{ background: 'var(--navbar-bg)', borderColor: 'var(--border)' }}
    >
      <div className="max-w-350 mx-auto px-6 h-14 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 text-sm transition-colors"
            style={{ color: 'var(--text-muted)' }}
            onMouseEnter={(e) => (e.currentTarget as HTMLElement).style.color = 'var(--text-primary)'}
            onMouseLeave={(e) => (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'}
          >
            <ChevronLeft className="w-4 h-4" />
            Dashboard
          </button>
          <span style={{ color: 'var(--text-xfaint)' }}>·</span>
          <div className="flex items-center gap-2">
            <img src="/brew.png" alt="Brew AI" className="w-5 h-5 object-contain" />
            <span className="font-semibold tracking-tight text-sm" style={{ color: 'var(--text-primary)' }}>
              Brew AI
            </span>
          </div>
          <span
            className="text-[10px] font-semibold px-2 py-0.5 rounded-full border"
            style={{
              color: 'var(--blue)',
              background: 'var(--blue-subtle)',
              borderColor: 'var(--blue-border)',
            }}
          >
            Profile
          </span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={toggleTheme}
            aria-label="Toggle theme"
            className="w-8 h-8 flex items-center justify-center rounded-lg transition-colors"
            style={{ background: 'var(--blue-subtle)', color: 'var(--text-muted)' }}
          >
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
          <button
            onClick={onSignOut}
            className="flex items-center gap-1.5 text-xs transition-colors"
            style={{ color: 'var(--text-faint)' }}
            onMouseEnter={(e) => (e.currentTarget as HTMLElement).style.color = 'var(--text-primary)'}
            onMouseLeave={(e) => (e.currentTarget as HTMLElement).style.color = 'var(--text-faint)'}
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Sign out</span>
          </button>
        </div>
      </div>
    </nav>
  )
}



// ─── Main Profile Page ─────────────────────────────────────────────────────────

type BillingStatus = {
  plan: 'free' | 'pro' | 'beta'
  daily_tailor_count: number
  daily_tailor_limit: number
  jd_count: number
  download_count: number
  next_billing_date: string | null
}

export default function Profile({
  user,
  onBack,
  onSignOut,
}: {
  user: { email: string; picture: string }
  onBack: () => void
  onSignOut: () => void
}) {
  const [billing, setBilling] = useState<BillingStatus | null>(null)

  useEffect(() => {
    getBillingStatus().then(setBilling).catch(() => {})
  }, [])

  const isPro = billing?.plan === 'pro'
  const isBeta = billing?.plan === 'beta'

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}>

      <ProfileNavbar onBack={onBack} onSignOut={onSignOut} />

      <div className="flex-1 max-w-3xl w-full mx-auto px-4 sm:px-6 py-10 flex flex-col gap-6">

        {/* ── Account ──────────────────────────────────────────── */}
        <section
          className="rounded-2xl border p-6"
          style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
        >
          <SectionLabel>Account</SectionLabel>
          <div className="flex items-center gap-5">
            <div
              className="w-14 h-14 rounded-2xl border overflow-hidden flex items-center justify-center shrink-0"
              style={{ background: 'var(--blue-subtle)', borderColor: 'var(--blue-border)' }}
            >
              {user.picture ? (
                <img src={user.picture} alt={user.email} className="w-full h-full object-cover" />
              ) : (
                <User className="w-6 h-6" style={{ color: 'var(--text-muted)' }} />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
                {user.email.split('@')[0]}
              </p>
              <div className="flex items-center gap-1.5 text-sm mt-0.5" style={{ color: 'var(--text-faint)' }}>
                <Mail className="w-3.5 h-3.5 shrink-0" />
                {user.email}
              </div>
            </div>
            {/* Plan badge */}
            {isPro ? (
              <div
                className="flex items-center gap-2 px-3 py-1.5 rounded-xl border"
                style={{ background: 'rgba(245,158,11,0.1)', borderColor: 'rgba(245,158,11,0.3)' }}
              >
                <Sparkles className="w-3.5 h-3.5" style={{ color: '#f59e0b' }} />
                <span className="text-sm font-semibold" style={{ color: '#f59e0b' }}>Pro</span>
              </div>
            ) : isBeta ? (
              <div
                className="flex items-center gap-2 px-3 py-1.5 rounded-xl border"
                style={{ background: 'rgba(139,92,246,0.1)', borderColor: 'rgba(139,92,246,0.3)' }}
              >
                <Tag className="w-3.5 h-3.5" style={{ color: '#8b5cf6' }} />
                <span className="text-sm font-semibold" style={{ color: '#8b5cf6' }}>Beta</span>
              </div>
            ) : (
              <div
                className="flex items-center gap-2 px-3 py-1.5 rounded-xl border"
                style={{ background: 'var(--blue-subtle)', borderColor: 'var(--border)' }}
              >
                <FileText className="w-3.5 h-3.5" style={{ color: 'var(--text-faint)' }} />
                <span className="text-sm font-semibold" style={{ color: 'var(--text-faint)' }}>Free</span>
              </div>
            )}
          </div>
        </section>

        {/* ── Usage stats ──────────────────────────────────────── */}
        <section
          className="rounded-2xl border p-6"
          style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
        >
          <SectionLabel>Usage</SectionLabel>
          <div className="flex gap-3">
            <StatCard
              icon={<BarChart2 className="w-3.5 h-3.5" />}
              label="Resumes tailored"
              value={billing?.jd_count ?? '—'}
            />
            <StatCard
              icon={<Download className="w-3.5 h-3.5" />}
              label="Downloads"
              value={billing?.download_count ?? '—'}
            />
            <StatCard
              icon={<FileText className="w-3.5 h-3.5" />}
              label="Today's tailors"
              value={billing ? `${billing.daily_tailor_count} / ${isPro ? '∞' : billing.daily_tailor_limit}` : '—'}
            />
          </div>
        </section>


      </div>
    </div>
  )
}
