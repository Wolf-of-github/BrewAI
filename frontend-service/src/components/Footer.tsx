import { useState } from 'react'
import { X } from 'lucide-react'
import { sendContactEmail } from '../lib/api'

export default function Footer() {
  const [contactOpen, setContactOpen] = useState(false)

  return (
    <>
      <footer className="border-t" style={{ background: 'var(--bg-primary)', borderColor: 'var(--border)' }}>
        <div className="max-w-5xl mx-auto px-6 py-10 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <img src="/brew.png" alt="Brew AI" className="w-5 h-5 object-contain" />
            <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Brew AI</span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <p className="text-xs" style={{ color: 'var(--text-faint)' }}>
              © {new Date().getFullYear()} Brew AI. Built for tech aspirants.
            </p>
          </div>
          <div className="flex items-center gap-4 text-xs" style={{ color: 'var(--text-faint)' }}>
            <a
              href="/privacy"
              className="transition-colors"
              onMouseEnter={(e) => (e.currentTarget as HTMLElement).style.color = 'var(--text-primary)'}
              onMouseLeave={(e) => (e.currentTarget as HTMLElement).style.color = 'var(--text-faint)'}
            >
              Privacy
            </a>
            <a
              href="/terms"
              className="transition-colors"
              onMouseEnter={(e) => (e.currentTarget as HTMLElement).style.color = 'var(--text-primary)'}
              onMouseLeave={(e) => (e.currentTarget as HTMLElement).style.color = 'var(--text-faint)'}
            >
              Terms
            </a>
            <button
              onClick={() => setContactOpen(true)}
              className="transition-colors bg-transparent border-none p-0 cursor-pointer text-xs"
              style={{ color: 'var(--text-faint)' }}
              onMouseEnter={(e) => (e.currentTarget as HTMLElement).style.color = 'var(--text-primary)'}
              onMouseLeave={(e) => (e.currentTarget as HTMLElement).style.color = 'var(--text-faint)'}
            >
              Contact
            </button>
          </div>
        </div>
      </footer>

      {contactOpen && <ContactModal onClose={() => setContactOpen(false)} />}
    </>
  )
}

function ContactModal({ onClose }: { onClose: () => void }) {
  const [email, setEmail] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await sendContactEmail(email.trim(), body.trim(), subject.trim() || undefined)
      setSent(true)
    } catch (err) {
      setError((err as Error).message ?? 'Failed to send. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="w-full max-w-md rounded-2xl p-6 shadow-xl flex flex-col gap-4"
        style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)' }}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>Contact Us</h2>
          <button onClick={onClose} style={{ color: 'var(--text-faint)' }}>
            <X className="w-4 h-4" />
          </button>
        </div>

        {sent ? (
          <div className="py-6 text-center">
            <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Message sent!</p>
            <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>We'll get back to you soon.</p>
            <button
              onClick={onClose}
              className="mt-4 text-sm font-medium px-4 py-2 rounded-lg"
              style={{ background: 'var(--accent)', color: 'var(--accent-text)' }}
            >
              Close
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
                Your email <span style={{ color: 'var(--accent)' }}>*</span>
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="text-sm rounded-lg px-3 py-2 outline-none"
                style={{
                  background: 'var(--input-bg)',
                  border: '1px solid var(--border)',
                  color: 'var(--text-primary)',
                }}
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
                Subject <span style={{ color: 'var(--text-faint)' }}>(optional)</span>
              </label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="What's this about?"
                className="text-sm rounded-lg px-3 py-2 outline-none"
                style={{
                  background: 'var(--input-bg)',
                  border: '1px solid var(--border)',
                  color: 'var(--text-primary)',
                }}
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
                Message <span style={{ color: 'var(--accent)' }}>*</span>
              </label>
              <textarea
                required
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Tell us what's on your mind…"
                rows={5}
                className="text-sm rounded-lg px-3 py-2 outline-none resize-none"
                style={{
                  background: 'var(--input-bg)',
                  border: '1px solid var(--border)',
                  color: 'var(--text-primary)',
                }}
              />
            </div>

            {error && (
              <p className="text-xs" style={{ color: 'var(--error, #ef4444)' }}>{error}</p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="text-sm font-medium px-4 py-2 rounded-lg transition-opacity disabled:opacity-50"
              style={{ background: 'var(--accent)', color: 'var(--accent-text)' }}
            >
              {submitting ? 'Sending…' : 'Send message'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
