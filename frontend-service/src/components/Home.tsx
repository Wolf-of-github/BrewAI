import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Upload, LucideGithub, FileSearch, Download } from 'lucide-react'
import { signInWithGoogle } from '../lib/firebase'

const GoogleIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24">
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
  </svg>
)

const steps = [
  {
    step: '01',
    icon: <Upload className="w-5 h-5" />,
    title: 'Upload your resume',
    desc: 'Your base document becomes the foundation. Skills, experience, projects — all in one place.',
    detail: 'We parse everything so you never start from scratch again.',
    color: 'amber',
  },
  {
    step: '02',
    icon: <LucideGithub className="w-5 h-5" />,
    title: 'Connect GitHub',
    desc: 'Optional, but powerful. We pull in real project context directly from your repos.',
    detail: 'Your commits speak louder than bullet points.',
    color: 'purple',
  },
  {
    step: '03',
    icon: <FileSearch className="w-5 h-5" />,
    title: 'Paste the job description',
    desc: 'Any role, any company. BrewAI reads what recruiters and ATS actually care about.',
    detail: 'Keywords, skills, requirements — extracted instantly.',
    color: 'orange',
  },
  {
    step: '04',
    icon: <Download className="w-5 h-5" />,
    title: 'Download and apply',
    desc: 'Your resume, tailored to that specific role. Clean, one-page, ATS-ready.',
    detail: 'Ready to send in seconds.',
    color: 'amber',
  },
]

// Colors are always amber/blue — they look fine in both themes
const colorMap: Record<string, { bg: string; text: string; border: string; glow: string; pulse: string }> = {
  amber: {
    bg: 'bg-[#F59E0B]',
    text: 'text-[#F59E0B]',
    border: 'border-[#F59E0B]/30',
    glow: 'shadow-[#F59E0B]/20',
    pulse: 'bg-[#F59E0B]',
  },
  orange: {
    bg: 'bg-[#F59E0B]',
    text: 'text-[#F59E0B]',
    border: 'border-[#F59E0B]/30',
    glow: 'shadow-[#F59E0B]/20',
    pulse: 'bg-[#F59E0B]',
  },
  purple: {
    bg: 'bg-[#4A6FA5]',
    text: 'text-[#E5E7EB]',
    border: 'border-[#4A6FA5]/50',
    glow: 'shadow-[#4A6FA5]/40',
    pulse: 'bg-[#4A6FA5]',
  },
}

export default function Home() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSignIn() {
    setLoading(true)
    setError(null)
    try {
      await signInWithGoogle()
      navigate('/dashboard', { replace: true })
    } catch (e) {
      setError('Sign-in failed. Please try again.')
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  return (
    <main style={{ background: 'var(--bg-primary)', color: 'var(--text-primary)' }}>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -top-40 -left-40 w-150 h-150 rounded-full blur-3xl opacity-60"
            style={{ background: 'var(--blue-muted)' }} />
          <div className="absolute -top-20 right-0 w-100 h-100 rounded-full blur-3xl opacity-50"
            style={{ background: 'var(--accent-subtle)' }} />
        </div>

        <div className="relative max-w-3xl mx-auto px-4 sm:px-6 pt-20 sm:pt-28 pb-16 sm:pb-20 text-center">
          <div
            className="inline-flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-full border mb-8"
            style={{
              background: 'var(--blue-subtle)',
              color: 'var(--text-muted)',
              borderColor: 'var(--blue-border)',
            }}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-[#F59E0B] animate-pulse" />
            Built for tech aspirants
          </div>

          <h1
            className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold tracking-tight leading-[1.05] mb-6"
            style={{ color: 'var(--text-primary)' }}
          >
            Just One Resume!{' '}
            <span className="text-transparent bg-clip-text bg-linear-to-r from-[#4A6FA5] to-[#F59E0B]">
              Every role.
            </span>
          </h1>

          <p className="text-base sm:text-lg max-w-md mx-auto mb-10 sm:mb-12 leading-relaxed" style={{ color: 'var(--text-muted)' }}>
            Stop rewriting your resume for every job. Just upload and let it{' '}
            <span
              className="relative inline-block font-bold px-2 py-0.5 rounded-md bg-linear-to-r from-[#4A6FA5] to-[#F59E0B]"
              style={{ color: 'var(--accent-text)' }}
            >
              BREW.
            </span>
          </p>

          {error && <p className="text-gray-600 text-sm mb-4">{error}</p>}

          <button
            onClick={handleSignIn}
            disabled={loading}
            className="inline-flex items-center gap-3 px-6 py-3.5 rounded-xl font-medium transition-all text-sm disabled:opacity-50 disabled:cursor-not-allowed border"
            style={{
              background: 'var(--bg-primary)',
              borderColor: 'var(--blue-border)',
              color: 'var(--text-primary)',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent-border)'
              ;(e.currentTarget as HTMLElement).style.boxShadow = '0 4px 16px var(--shadow-accent)'
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.borderColor = 'var(--blue-border)'
              ;(e.currentTarget as HTMLElement).style.boxShadow = ''
            }}
          >
            <GoogleIcon />
            {loading ? 'Signing in…' : 'Get started with Google'}
          </button>
        </div>
      </section>

      {/* How it works — vertical flow */}
      <section id="how" className="max-w-2xl mx-auto px-4 sm:px-6 pb-20 sm:pb-32 pt-8">
        <div className="text-center mb-16">
          <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: 'var(--accent)' }}>
            How it works
          </p>
          <h2 className="text-2xl sm:text-4xl font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>
            Four steps. That's it.
          </h2>
        </div>

        <div className="relative">
          {/* Vertical connector line */}
          <div className="absolute left-5 top-10 bottom-10 w-px bg-linear-to-b from-[#F59E0B]/40 via-[#4A6FA5]/60 to-[#F59E0B]/40" />

          <div className="flex flex-col gap-0">
            {steps.map((item, i) => {
              const c = colorMap[item.color]
              const isLast = i === steps.length - 1
              return (
                <div key={item.step} className="relative flex gap-6 group">
                  {/* Step icon */}
                  <div className="relative flex flex-col items-center shrink-0">
                    <div className={`relative w-10 h-10 rounded-xl ${c.bg} flex items-center justify-center text-[#1F2A44] shadow-lg ${c.glow} z-10 group-hover:scale-110 transition-transform duration-200`}>
                      {item.icon}
                      <span className={`absolute inset-0 rounded-xl ${c.pulse} opacity-20 animate-ping`} />
                    </div>
                  </div>

                  {/* Content */}
                  <div className="flex-1" style={{ paddingBottom: isLast ? 0 : '3rem' }}>
                    <p className="text-[10px] font-bold tracking-widest mb-1" style={{ color: 'var(--text-faint)' }}>
                      {item.step}
                    </p>
                    <h3 className="font-semibold text-base mb-2" style={{ color: 'var(--text-primary)' }}>
                      {item.title}
                    </h3>
                    <p className="text-sm leading-relaxed mb-1" style={{ color: 'var(--text-muted)' }}>
                      {item.desc}
                    </p>
                    <p className={`text-xs font-medium ${c.text} leading-relaxed`}>{item.detail}</p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section id="cta" className="border-t" style={{ borderColor: 'var(--border)' }}>
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-16 sm:py-24 text-center">
          <h2 className="text-2xl sm:text-4xl font-bold tracking-tight mb-3" style={{ color: 'var(--text-primary)' }}>
            Ready to apply smarter?
          </h2>
          <p className="mb-10" style={{ color: 'var(--text-muted)' }}>
            It takes two minutes to set up. Your next role might be closer than you think.
          </p>
          <button
            onClick={handleSignIn}
            disabled={loading}
            className="inline-flex items-center gap-3 px-6 py-3.5 rounded-xl font-medium transition-all text-sm disabled:opacity-50 disabled:cursor-not-allowed border"
            style={{
              background: 'var(--bg-primary)',
              borderColor: 'var(--blue-border)',
              color: 'var(--text-primary)',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent-border)'
              ;(e.currentTarget as HTMLElement).style.boxShadow = '0 8px 24px var(--shadow-accent)'
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.borderColor = 'var(--blue-border)'
              ;(e.currentTarget as HTMLElement).style.boxShadow = ''
            }}
          >
            <GoogleIcon />
            {loading ? 'Signing in…' : 'Sign in with Google'}
          </button>
        </div>
      </section>

    </main>
  )
}
