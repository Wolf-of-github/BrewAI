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
  CheckCircle,
  X,
  CalendarDays,
  BarChart2,
  Tag,
} from 'lucide-react'
import { useTheme } from '../context/ThemeContext'
import { getBillingStatus, simulateDowngrade, redeemPromoCode } from '../lib/api'

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

// ─── Confirm modal (upgrade / downgrade) ──────────────────────────────────────

function ConfirmModal({
  title,
  body,
  confirmLabel,
  confirmStyle,
  onConfirm,
  onCancel,
}: {
  title: string
  body: string
  confirmLabel: string
  confirmStyle?: React.CSSProperties
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }}>
      <div
        className="relative w-full max-w-sm rounded-2xl p-6 flex flex-col gap-4"
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
      >
        <button
          onClick={onCancel}
          className="absolute top-4 right-4 transition-colors"
          style={{ color: 'var(--text-faint)' }}
          onMouseEnter={(e) => (e.currentTarget as HTMLElement).style.color = 'var(--text-primary)'}
          onMouseLeave={(e) => (e.currentTarget as HTMLElement).style.color = 'var(--text-faint)'}
        >
          <X className="w-4 h-4" />
        </button>
        <p className="font-semibold text-sm pr-6" style={{ color: 'var(--text-primary)' }}>{title}</p>
        <p className="text-xs leading-relaxed" style={{ color: 'var(--text-subtle)' }}>{body}</p>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-2 rounded-xl text-sm border transition-opacity hover:opacity-80"
            style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 py-2 rounded-xl text-sm font-semibold transition-opacity hover:opacity-80"
            style={confirmStyle ?? { background: 'var(--accent)', color: 'var(--accent-text)' }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
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
  const [modal, setModal] = useState<'upgrade' | 'downgrade' | null>(null)
  const [loading, setLoading] = useState(false)
  const [promoCode, setPromoCode] = useState('')
  const [promoLoading, setPromoLoading] = useState(false)
  const [promoMessage, setPromoMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    getBillingStatus().then(setBilling).catch(() => {})
  }, [])

  async function handleDowngrade() {
    setLoading(true)
    try {
      await simulateDowngrade()
      setBilling((prev) => prev ? { ...prev, plan: 'free', next_billing_date: null } : prev)
    } finally {
      setLoading(false)
      setModal(null)
    }
  }

  async function handleRedeemPromo() {
    if (!promoCode.trim()) return
    setPromoLoading(true)
    setPromoMessage(null)
    try {
      const res = await redeemPromoCode(promoCode.trim())
      setBilling((prev) => prev ? { ...prev, plan: 'beta', daily_tailor_limit: res.daily_tailor_limit } : prev)
      setPromoMessage({ type: 'success', text: `Beta access activated! ${res.daily_tailor_limit} tailors/day until ${new Date(res.promo_expiry).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}.` })
      setPromoCode('')
    } catch (err: unknown) {
      setPromoMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to redeem code.' })
    } finally {
      setPromoLoading(false)
    }
  }

  const isPro = billing?.plan === 'pro'
  const isBeta = billing?.plan === 'beta'

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}>
      {modal === 'upgrade' && (
        <ConfirmModal
          title="Coming Soon"
          body="Stripe payment integration is not yet available. Pro upgrades will be enabled shortly — check back soon!"
          confirmLabel="Got it"
          onConfirm={() => setModal(null)}
          onCancel={() => setModal(null)}
        />
      )}
      {modal === 'downgrade' && (
        <ConfirmModal
          title="Downgrade to Free"
          body="Your Pro access will end immediately. You'll be limited to 3 tailors per day. You can upgrade again at any time."
          confirmLabel={loading ? 'Downgrading…' : 'Confirm downgrade'}
          confirmStyle={{ background: 'var(--red-subtle, #fee2e2)', color: '#dc2626' }}
          onConfirm={handleDowngrade}
          onCancel={() => setModal(null)}
        />
      )}

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

        {/* ── Plan & Billing ───────────────────────────────────── */}
        <section
          className="rounded-2xl border p-6 flex flex-col gap-5"
          style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
        >
          <SectionLabel>Plan & Billing</SectionLabel>

          {/* Current plan card */}
          <div
            className="rounded-xl p-4 flex items-start justify-between gap-4"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
          >
            <div className="flex flex-col gap-1">
              <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                {isPro ? 'Pro Plan' : isBeta ? 'Beta Plan' : 'Free Plan'}
              </p>
              <p className="text-xs" style={{ color: 'var(--text-faint)' }}>
                {isPro
                  ? '$20 / month · Unlimited tailoring'
                  : isBeta
                  ? `${billing?.daily_tailor_limit ?? 20} tailors per day · Promo access`
                  : '3 tailors per day · Free forever'}
              </p>
              {isPro && billing?.next_billing_date && (
                <div className="flex items-center gap-1.5 mt-1 text-xs" style={{ color: 'var(--text-faint)' }}>
                  <CalendarDays className="w-3.5 h-3.5" />
                  Next billing: {new Date(billing.next_billing_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                </div>
              )}
            </div>
            {isPro ? (
              <span
                className="shrink-0 text-[10px] font-bold px-2.5 py-1 rounded-full"
                style={{ background: 'rgba(245,158,11,0.15)', color: '#f59e0b' }}
              >
                Active
              </span>
            ) : isBeta ? (
              <span
                className="shrink-0 text-[10px] font-bold px-2.5 py-1 rounded-full"
                style={{ background: 'rgba(139,92,246,0.15)', color: '#8b5cf6' }}
              >
                Active
              </span>
            ) : (
              <span
                className="shrink-0 text-[10px] font-bold px-2.5 py-1 rounded-full"
                style={{ background: 'var(--blue-subtle)', color: 'var(--text-faint)' }}
              >
                Active
              </span>
            )}
          </div>

          {/* Pro features list */}
          {!isPro && !isBeta && (
            <ul className="text-xs flex flex-col gap-2" style={{ color: 'var(--text-subtle)' }}>
              {['Unlimited resume tailoring', 'Priority AI processing', 'Cancel anytime'].map((f) => (
                <li key={f} className="flex items-center gap-2">
                  <CheckCircle className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--accent)' }} />
                  {f}
                </li>
              ))}
            </ul>
          )}

          {/* Upgrade / Downgrade */}
          <div className="flex gap-3">
            {!isPro && !isBeta ? (
              <button
                onClick={() => setModal('upgrade')}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-opacity hover:opacity-90"
                style={{ background: 'var(--accent)', color: 'var(--accent-text)' }}
              >
                <Sparkles className="w-4 h-4" />
                Upgrade to Pro — $20/mo
              </button>
            ) : isPro ? (
              <button
                onClick={() => setModal('downgrade')}
                className="py-2 px-4 rounded-xl text-xs border transition-opacity hover:opacity-80"
                style={{ borderColor: 'var(--border)', color: 'var(--text-faint)' }}
              >
                Downgrade to Free
              </button>
            ) : null}
          </div>

          {/* Policy note */}
          <p className="text-[10px] leading-relaxed" style={{ color: 'var(--text-faint)' }}>
            {isPro
              ? 'Downgrading takes effect immediately. You keep Pro access for the rest of the billing period.'
              : isBeta
              ? 'Beta access expires on the promo code expiry date.'
              : 'Upgrade takes effect immediately. Cancel anytime — no questions asked.'}
          </p>
        </section>

        {/* ── Promo Code ───────────────────────────────────── */}
        {!isPro && !isBeta && (
          <section
            className="rounded-2xl border p-6 flex flex-col gap-4"
            style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
          >
            <SectionLabel>Promo Code</SectionLabel>
            <div className="flex gap-2">
              <input
                type="text"
                value={promoCode}
                onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === 'Enter' && handleRedeemPromo()}
                placeholder="Enter code"
                className="flex-1 px-3 py-2 rounded-xl text-sm outline-none"
                style={{
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  color: 'var(--text-primary)',
                }}
              />
              <button
                onClick={handleRedeemPromo}
                disabled={promoLoading || !promoCode.trim()}
                className="px-4 py-2 rounded-xl text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-50"
                style={{ background: 'var(--accent)', color: 'var(--accent-text)' }}
              >
                {promoLoading ? 'Redeeming…' : 'Redeem'}
              </button>
            </div>
            {promoMessage && (
              <p
                className="text-xs"
                style={{ color: promoMessage.type === 'success' ? 'var(--accent)' : '#dc2626' }}
              >
                {promoMessage.text}
              </p>
            )}
          </section>
        )}

      </div>
    </div>
  )
}
