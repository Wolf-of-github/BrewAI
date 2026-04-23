import { useState, useRef, useEffect, useCallback } from 'react'
import { apiFetch, uploadResume as apiUploadResume, deleteResume as apiDeleteResume, getGithubStatus as apiGetGithubStatus, tailorResume as apiTailorResume, listTailored as apiListTailored, getTailoredContent, getGithubOAuthUrl, handleGithubCallback, disconnectGithub as apiDisconnectGithub, updateTailoredJob, recordDownload, getFirebaseToken } from '../lib/api'
import { auth, db, signInToFirestore } from '../lib/firebase'
import { doc, onSnapshot } from 'firebase/firestore'
import {
  Github,
  FileText,
  Plus,
  Trash2,
  Clock,
  CheckCircle,
  AlertCircle,
  X,
  Download,
  Sparkles,
  User,
  LogOut,
  Sun,
  Moon,
  Send,
} from 'lucide-react'
import { useTheme } from '../context/ThemeContext'

// ─── Types ────────────────────────────────────────────────────────────────────

interface ResumeFile {
  id: string
  name: string
  size: string
  uploadedAt: string
  active: boolean
}

interface JDEntry {
  id: string
  company: string
  role: string
  jd: string
  pastedAt: string
  status: 'pending' | 'processing' | 'done' | 'failed'
  gcs_url: string
  instructions: string[]
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color: 'var(--text-faint)' }}>
      {children}
    </p>
  )
}

// Resume Upload Panel
function ResumePanel() {
  const [resumes, setResumes] = useState<ResumeFile[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const MAX = 1

  function fetchResumes() {
    return apiFetch<{ resumes: Array<{ fileId: string; originalName: string; uploadedAt: string | null }> }>('/resume/list')
      .then(({ resumes: data }) => {
        setResumes(data.map((r, i) => ({
          id: r.fileId,
          name: r.originalName,
          size: '',
          uploadedAt: r.uploadedAt ? new Date(r.uploadedAt).toLocaleDateString() : 'Unknown',
          active: i === 0,
        })))
      })
  }

  useEffect(() => {
    fetchResumes().finally(() => setLoading(false))
  }, [])

  async function handleFiles(files: FileList | null) {
    if (!files || uploading) return
    const file = files[0]
    setUploading(true)
    try {
      await apiUploadResume(file)
      await fetchResumes()
    } catch (err) {
      console.error('[ResumePanel] upload failed:', err)
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  function setActive(id: string) {
    setResumes((prev) => prev.map((r) => ({ ...r, active: r.id === id })))
  }

  async function remove(id: string) {
    try {
      await apiDeleteResume()
      setResumes((prev) => {
        const next = prev.filter((r) => r.id !== id)
        if (next.length > 0 && !next.some((r) => r.active)) {
          next[0].active = true
        }
        return next
      })
    } catch (err) {
      console.error('[ResumePanel] delete failed:', err)
    }
  }

  return (
    <div
      id="resume-panel"
      className="rounded-2xl border p-5"
      style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
    >
      <SectionLabel>Resume ({resumes.length}/{MAX})</SectionLabel>

      <div className="flex flex-col gap-2 mb-4">
        {loading ? (
          <div className="flex flex-col gap-2">
            {[1, 2].map((i) => (
              <div key={i} className="h-10 rounded-xl animate-pulse" style={{ background: 'var(--blue-subtle)' }} />
            ))}
          </div>
        ) : resumes.map((r) => (
          <div
            key={r.id}
            onClick={() => setActive(r.id)}
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl border cursor-pointer transition-all"
            style={r.active ? {
              borderColor: 'var(--accent-border)',
              background: 'var(--accent-subtle)',
              boxShadow: '0 1px 4px var(--shadow-accent)',
            } : {
              borderColor: 'var(--border)',
              background: 'transparent',
            }}
          >
            <FileText
              className="w-4 h-4 shrink-0"
              style={{ color: r.active ? 'var(--accent)' : 'var(--text-xfaint)' }}
            />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{r.name}</p>
              <p className="text-[11px]" style={{ color: 'var(--text-faint)' }}>
                {r.size} · {r.uploadedAt}
              </p>
            </div>
            {r.active && (
              <span
                className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                style={{ color: 'var(--accent)', background: 'var(--accent-subtle)' }}
              >
                Active
              </span>
            )}
            <button
              onClick={(e) => { e.stopPropagation(); remove(r.id) }}
              className="transition-colors"
              style={{ color: 'var(--text-xfaint)' }}
              onMouseEnter={(e) => (e.currentTarget as HTMLElement).style.color = '#f87171'}
              onMouseLeave={(e) => (e.currentTarget as HTMLElement).style.color = 'var(--text-xfaint)'}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>

      {resumes.length < 1 ? (
        <>
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.doc,.docx"
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-dashed text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ borderColor: 'var(--blue-border)', color: 'var(--text-faint)' }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent-border)'
              ;(e.currentTarget as HTMLElement).style.color = 'var(--accent)'
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.borderColor = 'var(--blue-border)'
              ;(e.currentTarget as HTMLElement).style.color = 'var(--text-faint)'
            }}
          >
            <Plus className="w-4 h-4" />
            {uploading ? 'Uploading…' : 'Upload resume'}
          </button>
        </>
      ) : (
        <p className="text-center text-xs py-2" style={{ color: 'var(--text-faint)' }}>
          Maximum 1 resume reached
        </p>
      )}
    </div>
  )
}

// GitHub Connect Panel
function GitHubPanel() {
  const [saved, setSaved] = useState<string | null>(null)
  const [loadingCallback, setLoadingCallback] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)

  useEffect(() => {
    apiGetGithubStatus().then(({ github_id }: { github_id: string | null }) => {
      if (github_id) setSaved(github_id)
    }).catch(() => {})

    const params = new URLSearchParams(window.location.search)
    const code = params.get('code')
    if (code) {
      window.history.replaceState({}, '', window.location.pathname)
      setLoadingCallback(true)
      handleGithubCallback(code)
        .then(({ github_id }) => setSaved(github_id))
        .catch((err) => console.error('[GitHubPanel] OAuth callback failed:', err))
        .finally(() => setLoadingCallback(false))
    }
  }, [])

  async function connectWithGithub() {
    try {
      const { url } = await getGithubOAuthUrl()
      window.location.href = url
    } catch (err) {
      console.error('[GitHubPanel] failed to get OAuth URL:', err)
    }
  }

  return (
    <div
      id="github-panel"
      className="rounded-2xl border p-5"
      style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
    >
      <SectionLabel>GitHub</SectionLabel>

      {loadingCallback ? (
        <div
          className="flex items-center gap-3 px-3 py-2.5 rounded-xl border"
          style={{ borderColor: 'var(--blue-border)', background: 'var(--blue-subtle)' }}
        >
          <Github className="w-4 h-4 shrink-0 animate-pulse" style={{ color: 'var(--text-muted)' }} />
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Connecting…</p>
        </div>
      ) : saved ? (
        <div
          className="flex items-center gap-3 px-3 py-2.5 rounded-xl border"
          style={{ borderColor: 'var(--blue-border)', background: 'var(--blue-subtle)' }}
        >
          <Github className="w-4 h-4 shrink-0" style={{ color: 'var(--text-muted)' }} />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>@{saved}</p>
            <p className="text-[11px]" style={{ color: 'var(--text-faint)' }}>Connected</p>
          </div>
          <CheckCircle className="w-4 h-4 shrink-0 text-emerald-500" />
          <button
            disabled={disconnecting}
            onClick={async () => {
              setDisconnecting(true)
              try {
                await apiDisconnectGithub()
                setSaved(null)
              } catch (err) {
                console.error('[GitHubPanel] disconnect failed:', err)
              } finally {
                setDisconnecting(false)
              }
            }}
            className="text-[10px] transition-colors"
            style={{ color: 'var(--text-faint)' }}
            onMouseEnter={(e) => (e.currentTarget as HTMLElement).style.color = 'var(--accent)'}
            onMouseLeave={(e) => (e.currentTarget as HTMLElement).style.color = 'var(--text-faint)'}
          >
            {disconnecting ? 'Disconnecting…' : 'Disconnect'}
          </button>
        </div>
      ) : (
        <button
          onClick={connectWithGithub}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border text-sm transition-all"
          style={{
            borderColor: 'var(--blue-border)',
            background: 'var(--blue-subtle)',
            color: 'var(--text-muted)',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.background = 'var(--blue-muted)'
            ;(e.currentTarget as HTMLElement).style.color = 'var(--text-primary)'
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.background = 'var(--blue-subtle)'
            ;(e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'
          }}
        >
          <Github className="w-4 h-4" />
          Connect with GitHub
        </button>
      )}
    </div>
  )
}

// JD History Sidebar entry
function JDHistoryItem({
  entry,
  active,
  onClick,
  onUpdate,
}: {
  entry: JDEntry
  active: boolean
  onClick: () => void
  onUpdate: (id: string, company: string, role: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [company, setCompany] = useState(entry.company)
  const [role, setRole] = useState(entry.role)

  useEffect(() => {
    if (!editing) {
      setCompany(entry.company)
      setRole(entry.role)
    }
  }, [entry.company, entry.role, editing])

  const statusIcon =
    entry.status === 'done' ? (
      <CheckCircle className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
    ) : entry.status === 'processing' ? (
      <Sparkles className="w-3.5 h-3.5 shrink-0 animate-pulse" style={{ color: 'var(--accent)' }} />
    ) : entry.status === 'failed' ? (
      <AlertCircle className="w-3.5 h-3.5 shrink-0 text-red-400" />
    ) : (
      <AlertCircle className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--text-faint)' }} />
    )

  function saveEdit() {
    const c = company.trim() || entry.company
    const r = role.trim() || entry.role
    setCompany(c)
    setRole(r)
    setEditing(false)
    if (c !== entry.company || r !== entry.role) {
      updateTailoredJob(entry.id, { company: c, role: r }).catch(() => {})
      onUpdate(entry.id, c, r)
    }
  }

  if (editing) {
    return (
      <div
        className="w-full flex flex-col gap-1.5 px-3 py-2.5 rounded-xl border"
        style={active ? {
          background: 'var(--accent-subtle)',
          borderColor: 'var(--accent-border)',
        } : {
          borderColor: 'var(--blue-border)',
          background: 'var(--bg-secondary)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <input
          autoFocus
          value={company}
          onChange={(e) => setCompany(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditing(false) }}
          placeholder="Company"
          className="w-full text-xs bg-transparent border-b focus:outline-none pb-0.5"
          style={{
            borderColor: 'var(--blue-border)',
            color: 'var(--text-primary)',
          }}
        />
        <input
          value={role}
          onChange={(e) => setRole(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditing(false) }}
          placeholder="Role"
          className="w-full text-xs bg-transparent border-b focus:outline-none pb-0.5"
          style={{
            borderColor: 'var(--blue-border)',
            color: 'var(--text-primary)',
          }}
        />
        <div className="flex gap-2 mt-0.5">
          <button
            onClick={saveEdit}
            className="text-[10px] transition-colors"
            style={{ color: 'var(--accent)' }}
          >
            Save
          </button>
          <button
            onClick={() => setEditing(false)}
            className="text-[10px] transition-colors"
            style={{ color: 'var(--text-faint)' }}
            onMouseEnter={(e) => (e.currentTarget as HTMLElement).style.color = 'var(--text-primary)'}
            onMouseLeave={(e) => (e.currentTarget as HTMLElement).style.color = 'var(--text-faint)'}
          >
            Cancel
          </button>
        </div>
      </div>
    )
  }

  return (
    <button
      onClick={onClick}
      className="w-full text-left flex items-start gap-2.5 px-3 py-2.5 rounded-xl transition-all border"
      style={active ? {
        background: 'var(--accent-subtle)',
        borderColor: 'var(--accent-border)',
      } : {
        borderColor: 'transparent',
      }}
      onMouseEnter={(e) => {
        if (!active) (e.currentTarget as HTMLElement).style.background = 'var(--blue-subtle)'
      }}
      onMouseLeave={(e) => {
        if (!active) (e.currentTarget as HTMLElement).style.background = 'transparent'
      }}
    >
      {statusIcon}
      <div className="flex-1 min-w-0">
        <p id="job-name" className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{company}</p>
        <p className="text-[10px] truncate" style={{ color: 'var(--text-faint)' }}>{role}</p>
        <p className="text-[10px] mt-0.5 flex items-center gap-1" style={{ color: 'var(--text-xfaint)' }}>
          <Clock className="w-2.5 h-2.5" /> {entry.pastedAt}
        </p>
      </div>
      <button
        onClick={(e) => { e.stopPropagation(); setEditing(true) }}
        className="text-[10px] transition-colors shrink-0 mt-0.5"
        style={{ color: 'var(--text-xfaint)' }}
        onMouseEnter={(e) => (e.currentTarget as HTMLElement).style.color = 'var(--accent)'}
        onMouseLeave={(e) => (e.currentTarget as HTMLElement).style.color = 'var(--text-xfaint)'}
      >
        Edit
      </button>
    </button>
  )
}

// Countdown timer shown while brewing
function BrewCountdown() {
  const TOTAL = 60
  const [seconds, setSeconds] = useState(TOTAL)

  useEffect(() => {
    const id = setInterval(() => {
      setSeconds((s) => (s <= 1 ? TOTAL : s - 1))
    }, 1000)
    return () => clearInterval(id)
  }, [])

  const pct = ((TOTAL - seconds) / TOTAL) * 100

  return (
    <div
      className="flex flex-col gap-3 w-80 rounded-2xl px-4 py-3"
      style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
    >
      {/* Header row */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium" style={{ color: 'var(--text-subtle)' }}>
          Brewing your resume
        </span>
        <span
          className="text-xs tabular-nums font-mono px-1.5 py-0.5 rounded-md"
          style={{ background: 'var(--blue-muted)', color: 'var(--accent)' }}
        >
          {seconds}s
        </span>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 w-full rounded-full overflow-hidden" style={{ background: 'var(--blue-muted)' }}>
        <div
          className="h-full rounded-full transition-all duration-1000"
          style={{ width: `${pct}%`, background: 'var(--accent)' }}
        />
      </div>

      {/* Footer note */}
      <p className="text-[10px] leading-relaxed" style={{ color: 'var(--text-faint)' }}>
        Beta typically takes ~60s. We're actively working on reducing wait time.
      </p>
    </div>
  )
}

// Resume viewer panel
function ResumeViewer({ jd }: { jd: JDEntry | null }) {
  const [html, setHtml] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!jd) return
    if (jd.status === 'processing') { setHtml(null); setError(null); return }
    if (jd.status === 'failed') { setHtml(null); setError(null); return }
    let cancelled = false
    setLoading(true)
    setHtml(null)
    setError(null)

    async function fetchWithRetry(attempts: number) {
      for (let i = 0; i < attempts; i++) {
        try {
          const res = await getTailoredContent(jd!.id)
          if (!cancelled) { setHtml(res); setLoading(false) }
          return
        } catch (err) {
          if (i < attempts - 1) {
            await new Promise((r) => setTimeout(r, 2000 * (i + 1)))
          } else {
            if (!cancelled) { setError((err as Error).message ?? 'Failed to load'); setLoading(false) }
          }
        }
      }
    }

    fetchWithRetry(3)
    return () => { cancelled = true }
  }, [jd?.id, jd?.status])

  if (!jd) {
    return (
      <div
        className="flex-1 flex flex-col items-center justify-center text-center p-8 rounded-2xl border border-dashed"
        style={{ borderColor: 'var(--border)' }}
      >
        <FileText className="w-10 h-10 mb-3" style={{ color: 'var(--border-strong)' }} />
        <p className="text-sm" style={{ color: 'var(--text-faint)' }}>
          Select a job to view the tailored resume
        </p>
      </div>
    )
  }

  return (
    <div
      className="flex-1 flex flex-col rounded-2xl border overflow-hidden"
      style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
    >
      {/* Toolbar */}
      <div
        className="flex items-center justify-between px-4 py-3 border-b shrink-0"
        style={{ borderColor: 'var(--border)' }}
      >
        <div>
          <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{jd.company}</p>
          <p className="text-xs" style={{ color: 'var(--text-faint)' }}>{jd.role}</p>
        </div>
        <button
          onClick={() => {
            if (!html) return
            // Inject print CSS to suppress browser-added headers/footers (URL, page numbers, date)
            const printCss = `<style>@page{margin:0;size:auto;}body{-webkit-print-color-adjust:exact;print-color-adjust:exact;}</style>`
            const printHtml = html.replace(/<\/head>/i, `${printCss}</head>`)
            const blob = new Blob([printHtml], { type: 'text/html' })
            const url = URL.createObjectURL(blob)
            const win = window.open(url, '_blank')
            if (win) win.addEventListener('load', () => { win.print(); URL.revokeObjectURL(url) })
            recordDownload().catch(() => {})
          }}
          disabled={!html}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ background: 'var(--accent)', color: 'var(--accent-text)' }}
        >
          <Download className="w-3.5 h-3.5" />
          Download
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {loading && (
          <div className="flex items-center justify-center h-full py-20">
            <Sparkles className="w-6 h-6 animate-pulse" style={{ color: 'var(--accent)' }} />
          </div>
        )}
        {error && (
          <div className="flex items-center justify-center h-full py-20">
            <p className="text-sm text-red-500">{error}</p>
          </div>
        )}
        {jd.status === 'processing' && !loading && (
          <div className="flex flex-col items-center justify-center h-full py-20 gap-3">
            <Sparkles className="w-6 h-6 animate-pulse" style={{ color: 'var(--accent)' }} />
            <p className="text-sm" style={{ color: 'var(--text-faint)' }}>Brewing your resume…</p>
            <BrewCountdown />
          </div>
        )}
        {html && <div dangerouslySetInnerHTML={{ __html: html }} className="w-full h-full" />}
      </div>
    </div>
  )
}

// JD Input panel
function JDInput({ onSubmit, disabled }: { onSubmit: (jd: JDEntry) => void; disabled?: boolean }) {
  const [text, setText] = useState('')
  const [instructions, setInstructions] = useState('')
  const [open, setOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  async function submit() {
    if (!text.trim() || submitting) return
    const jdText = text.replace(/[\x00-\x1F\x7F]/g, ' ').replace(/\s+/g, ' ').trim()
    setSubmitting(true)
    try {
      const { draft_id, company, role } = await apiTailorResume(jdText, instructions.trim())
      onSubmit({
        id: draft_id,
        company,
        role,
        jd: jdText,
        pastedAt: 'Just now',
        status: 'processing',
        gcs_url: '',
        instructions: [],
      })
      setText('')
      setInstructions('')
      setOpen(false)
    } catch (err) {
      console.error('[JDInput] tailor failed:', err)
    } finally {
      setSubmitting(false)
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => !disabled && setOpen(true)}
        disabled={disabled}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl border border-dashed text-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed"
        style={{ borderColor: 'var(--accent-border)', color: 'var(--accent)' }}
        onMouseEnter={(e) => {
          if (disabled) return
          (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent)'
          ;(e.currentTarget as HTMLElement).style.opacity = '0.9'
        }}
        onMouseLeave={(e) => {
          if (disabled) return
          (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent-border)'
          ;(e.currentTarget as HTMLElement).style.opacity = '1'
        }}
      >
        <Plus className="w-4 h-4" />
        {disabled ? 'Brewing in progress…' : 'New job description'}
      </button>
    )
  }

  return (
    <div
      id="jd-input-box"
      className="rounded-2xl border p-5"
      style={{ background: 'var(--bg-card)', borderColor: 'var(--blue-border)' }}
    >
      <div className="flex items-center justify-between mb-4">
        <SectionLabel>New Job Description</SectionLabel>
        <button
          onClick={() => setOpen(false)}
          className="transition-colors"
          style={{ color: 'var(--text-faint)' }}
          onMouseEnter={(e) => (e.currentTarget as HTMLElement).style.color = 'var(--text-primary)'}
          onMouseLeave={(e) => (e.currentTarget as HTMLElement).style.color = 'var(--text-faint)'}
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Paste the full job description here…"
        rows={7}
        disabled={submitting}
        className="w-full px-3 py-2.5 rounded-lg border text-sm focus:outline-none resize-none mb-3 disabled:opacity-50 disabled:cursor-not-allowed"
        style={{
          background: 'var(--bg-secondary)',
          borderColor: 'var(--blue-border)',
          color: 'var(--text-primary)',
        }}
      />

      <textarea
        value={instructions}
        onChange={(e) => setInstructions(e.target.value)}
        placeholder="Custom instructions (optional)"
        rows={3}
        disabled={submitting}
        className="w-full px-3 py-2.5 rounded-lg border text-sm focus:outline-none resize-none mb-3 disabled:opacity-50 disabled:cursor-not-allowed"
        style={{
          background: 'var(--bg-secondary)',
          borderColor: 'var(--accent-border)',
          color: 'var(--text-primary)',
        }}
      />

      <button
        onClick={submit}
        disabled={!text.trim() || submitting}
        className="w-full py-2.5 rounded-xl text-sm font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        style={{ background: 'var(--accent)', color: 'var(--accent-text)' }}
      >
        <Sparkles className="w-4 h-4" />
        {submitting ? 'Brewing…' : 'Brew my resume'}
      </button>
    </div>
  )
}

// Dashboard Navbar
function DashboardNavbar({
  user,
  onSignOut,
  onProfile,
  onHome,
}: {
  user: { email: string; picture: string }
  onSignOut: () => void
  onProfile: () => void
  onHome: () => void
}) {
  const { theme, toggleTheme } = useTheme()

  return (
    <nav
      className="sticky top-0 z-50 border-b backdrop-blur-md"
      style={{ background: 'var(--navbar-bg)', borderColor: 'var(--border)' }}
    >
      <div className="max-w-350 mx-auto px-6 h-14 flex items-center justify-between">
        <button
          id="home-button"
          onClick={onHome}
          className="flex items-center gap-2 bg-transparent border-none p-0 cursor-pointer"
        >
          <img src="/brew.png" alt="Brew AI" className="w-6 h-6 object-contain" />
          <span className="font-semibold tracking-tight text-sm" style={{ color: 'var(--text-primary)' }}>
            Brew AI
          </span>
          <span
            className="ml-2 text-[10px] font-semibold px-2 py-0.5 rounded-full border"
            style={{
              color: 'var(--accent)',
              background: 'var(--accent-subtle)',
              borderColor: 'var(--accent-border)',
            }}
          >
            Dashboard
          </span>
        </button>
        <div className="flex items-center gap-3">
          {/* Theme toggle */}
          <button
            onClick={toggleTheme}
            aria-label="Toggle theme"
            className="w-8 h-8 flex items-center justify-center rounded-lg transition-colors"
            style={{ background: 'var(--blue-subtle)', color: 'var(--text-muted)' }}
          >
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>

          <button
            onClick={onProfile}
            className="flex items-center gap-2 text-sm transition-colors"
            style={{ color: 'var(--text-muted)' }}
            onMouseEnter={(e) => (e.currentTarget as HTMLElement).style.color = 'var(--text-primary)'}
            onMouseLeave={(e) => (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'}
          >
            <div
              className="w-7 h-7 rounded-full border overflow-hidden flex items-center justify-center"
              style={{ background: 'var(--blue-subtle)', borderColor: 'var(--blue-border)' }}
            >
              {user.picture ? (
                <img src={user.picture} alt={user.email} className="w-full h-full object-cover" />
              ) : (
                <User className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} />
              )}
            </div>
            <span className="hidden sm:inline">{user.email}</span>
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

// ─── Tweak Panel ──────────────────────────────────────────────────────────────

function TweakPanel({
  jd,
  onTweak,
  collapsed,
  onToggleCollapse,
}: {
  jd: JDEntry | null
  onTweak: (draftId: string, instruction: string) => void
  collapsed: boolean
  onToggleCollapse: () => void
}) {
  const [instruction, setInstruction] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  async function submit() {
    if (!instruction.trim() || submitting || !jd || jd.status === 'processing') return
    const text = instruction.trim()
    setSubmitting(true)
    try {
      await onTweak(jd.id, text)
      setInstruction('')
    } finally {
      setSubmitting(false)
    }
  }

  const isDisabled = !jd || jd.status === 'processing' || submitting

  if (collapsed) {
    return (
      <div className="flex flex-col items-center py-1 gap-2">
        <button
          onClick={onToggleCollapse}
          title="Open tweak panel"
          className="w-8 h-8 flex items-center justify-center rounded-lg transition-colors"
          style={{ background: 'var(--bg-card)', color: 'var(--text-faint)', border: '1px solid var(--border)' }}
          onMouseEnter={(e) => (e.currentTarget as HTMLElement).style.color = 'var(--accent)'}
          onMouseLeave={(e) => (e.currentTarget as HTMLElement).style.color = 'var(--text-faint)'}
        >
          <Sparkles className="w-4 h-4" />
        </button>
        <span className="text-[9px] font-medium" style={{ color: 'var(--text-xfaint)', writingMode: 'vertical-rl', textOrientation: 'mixed' }}>Tweak</span>
      </div>
    )
  }

  return (
    <div className="w-72 shrink-0 sticky top-20 self-start max-h-[calc(100vh-5rem)] flex flex-col">
      <div
        className="rounded-2xl border p-5 flex flex-col gap-4 overflow-y-auto max-h-[calc(100vh-5rem)]"
        style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between shrink-0">
          <SectionLabel>Tweak Resume</SectionLabel>
          <button
            onClick={onToggleCollapse}
            title="Close tweak panel"
            className="w-6 h-6 flex items-center justify-center rounded-md transition-colors"
            style={{ color: 'var(--text-faint)' }}
            onMouseEnter={(e) => (e.currentTarget as HTMLElement).style.color = 'var(--text-primary)'}
            onMouseLeave={(e) => (e.currentTarget as HTMLElement).style.color = 'var(--text-faint)'}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Job info */}
        {jd && (
          <div className="flex flex-col gap-1 shrink-0">
            <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{jd.company}</p>
            <p className="text-xs truncate" style={{ color: 'var(--text-faint)' }}>{jd.role}</p>
            {jd.jd && (
              <p className="text-[11px] mt-1 leading-relaxed overflow-hidden" style={{ color: 'var(--text-muted)', display: '-webkit-box', WebkitLineClamp: 5, WebkitBoxOrient: 'vertical' }}>
                {jd.jd}
              </p>
            )}
          </div>
        )}

        {/* Instructions history */}
        {jd?.instructions && jd.instructions.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-widest shrink-0" style={{ color: 'var(--text-xfaint)' }}>Past instructions</p>
            {jd.instructions.map((instr, i) => (
              <div
                key={i}
                className="px-2.5 py-1.5 rounded-lg text-xs"
                style={{ background: 'var(--blue-subtle)', color: 'var(--text-muted)' }}
              >
                {instr}
              </div>
            ))}
          </div>
        )}

        {/* Input */}
        <div className="flex flex-col gap-2 shrink-0">
          {jd?.status === 'processing' && (
            <p className="text-xs text-center" style={{ color: 'var(--accent)' }}>
              <Sparkles className="w-3 h-3 inline mr-1 animate-pulse" />
              Brewing…
            </p>
          )}
          <textarea
            ref={textareaRef}
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit() } }}
            placeholder={jd?.status === 'done' ? 'Add an instruction…' : 'Select a completed draft to tweak'}
            rows={3}
            disabled={isDisabled}
            className="w-full px-3 py-2.5 rounded-lg border text-sm focus:outline-none resize-none disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              background: 'var(--bg-secondary)',
              borderColor: 'var(--accent-border)',
              color: 'var(--text-primary)',
            }}
          />
          <button
            onClick={submit}
            disabled={isDisabled || !instruction.trim()}
            className="w-full py-2 rounded-xl text-sm font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            style={{ background: 'var(--accent)', color: 'var(--accent-text)' }}
          >
            <Send className="w-3.5 h-3.5" />
            {submitting ? 'Sending…' : 'Brew tweak'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main Dashboard ────────────────────────────────────────────────────────────

export default function Dashboard({
  user,
  onSignOut,
  onProfile,
  onHome,
}: {
  user: { email: string; picture: string }
  onSignOut?: () => void
  onProfile?: () => void
  onHome?: () => void
}) {
  const [jdHistory, setJdHistory] = useState<JDEntry[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [tweakCollapsed, setTweakCollapsed] = useState(true)
  const firebaseReady = useRef(false)

  // Derive activeJD from jdHistory — snapshot updates flow through automatically, no stale closures
  const activeJD = jdHistory.find((e) => e.id === activeId) ?? null

  function openTweak() { setTweakCollapsed(false) }
  function closeTweak() { setTweakCollapsed(true) }

  // async function handleCheckout() {
  //   const { url } = await createCheckoutSession()
  //   window.location.href = url
  // }

  function openSnapshot(draftId: string) {
    const { currentUser } = auth
    console.log(`[onSnapshot] starting listener draftId=${draftId} firebaseReady=${firebaseReady.current} firebaseUser=${currentUser?.uid ?? 'none'}`)
    if (!firebaseReady.current) {
      console.warn(`[onSnapshot] Firebase auth not ready yet — listener for ${draftId} may fail with permission-denied`)
    }
    const draftRef = doc(db, 'drafts', draftId)
    const unsubscribe = onSnapshot(
      draftRef,
      (snap) => {
        if (!snap.exists()) {
          console.log(`[onSnapshot] doc does not exist yet draftId=${draftId}`)
          return
        }
        const data = snap.data()!
        console.log(`[onSnapshot] received update draftId=${draftId} status=${data.status}`)
        if (data.status === 'completed') {
          console.log(`[onSnapshot] completed draftId=${draftId} — updating UI and unsubscribing`)
          setJdHistory((prev) => prev.map((e) => e.id === draftId ? {
            ...e,
            status: 'done',
            gcs_url: '',
            ...(data.company ? { company: data.company } : {}),
            ...(data.role ? { role: data.role } : {}),
          } : e))
          unsubscribe()
        } else if (data.status === 'failed') {
          console.log(`[onSnapshot] failed draftId=${draftId} — updating UI and unsubscribing`)
          setJdHistory((prev) => prev.map((e) => e.id === draftId ? { ...e, status: 'failed' } : e))
          unsubscribe()
        }
      },
      (err) => console.error(`[onSnapshot] permission/error draftId=${draftId}:`, err.code, err.message)
    )
  }

  function fetchHistory() {
    return apiListTailored().then(({ jobs }) => {
      const entries: JDEntry[] = jobs
        .slice()
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .map((j) => ({
          id: j.job_id,
          company: j.company ?? 'Company Name',
          role: j.role ?? 'Job Role',
          jd: j.jd ?? '',
          pastedAt: new Date(j.timestamp).toLocaleDateString(),
          status: (['done', 'processing', 'failed', 'pending'].includes(j.status) ? j.status : 'done') as JDEntry['status'],
          gcs_url: j.gcs_url,
          instructions: (j as any).instructions ?? [],
        }))
      setJdHistory(entries)
      entries.filter((e) => e.status === 'processing').forEach((e) => openSnapshot(e.id))
      setActiveId((prev) => prev ?? (entries[0]?.id ?? null))
    }).catch(() => {})
  }

  useEffect(() => {
    // Sign into Firebase with a custom token so onSnapshot has proper auth,
    // then load history (which opens snapshot listeners for processing jobs)
    console.log('[firebase-auth] fetching custom token...')
    getFirebaseToken()
      .then(({ token }) => {
        console.log('[firebase-auth] signing into Firestore with custom token...')
        return signInToFirestore(token)
      })
      .then(() => {
        firebaseReady.current = true
        console.log(`[firebase-auth] signed in successfully uid=${auth.currentUser?.uid}`)
        return fetchHistory()
      })
      .catch((err) => {
        console.error('[firebase-auth] sign-in failed — onSnapshot listeners will likely fail with permission-denied:', err)
        // Still load history so the UI shows past jobs, even if listeners won't work
        fetchHistory()
      })
  }, [])

  function addJD(entry: JDEntry) {
    setJdHistory((prev) => [entry, ...prev])
    setActiveId(entry.id)
    openSnapshot(entry.id)
  }

  const handleUpdate = useCallback((id: string, company: string, role: string) => {
    setJdHistory((prev) => prev.map((e) => e.id === id ? { ...e, company, role } : e))
  }, [])

  async function handleTweak(draftId: string, instruction: string) {
    await apiTailorResume('', instruction, draftId)
    setJdHistory((prev) => prev.map((e) => e.id === draftId ? {
      ...e,
      status: 'processing',
      instructions: [...e.instructions, instruction],
    } : e))
    openSnapshot(draftId)
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}>
      <DashboardNavbar user={user} onSignOut={onSignOut ?? (() => {})} onProfile={onProfile ?? (() => {})} onHome={onHome ?? (() => {})} />

      <div className="flex-1 max-w-350 w-full mx-auto px-4 sm:px-6 py-6 flex gap-5">

        {/* ── Left sidebar: resume + github + jd + history ─────── */}
        <aside id="left-sidebar" className="w-72 shrink-0 flex flex-col gap-4">
          <ResumePanel />
          <GitHubPanel />

          <div>
            <SectionLabel>Job Description</SectionLabel>
            <JDInput onSubmit={addJD} disabled={jdHistory.some((e) => e.status === 'processing')} />
          </div>

          <div id="history" className="flex flex-col gap-1 min-h-0">
            <SectionLabel>History</SectionLabel>
            <div className="flex flex-col gap-1 overflow-y-auto max-h-72">
              {jdHistory.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <Clock className="w-7 h-7 mb-2" style={{ color: 'var(--border-strong)' }} />
                  <p className="text-xs" style={{ color: 'var(--text-faint)' }}>No jobs yet.</p>
                </div>
              ) : (
                jdHistory.map((entry) => (
                  <JDHistoryItem
                    key={entry.id}
                    entry={entry}
                    active={activeJD?.id === entry.id}
                    onClick={() => setActiveId(entry.id)}
                    onUpdate={handleUpdate}
                  />
                ))
              )}
            </div>
          </div>
        </aside>

        {/* ── Center: PDF viewer ───────────────────────────────── */}
        <main className="flex-1 flex flex-col gap-4 min-w-0">
          <ResumeViewer jd={activeJD} />
        </main>

        {/* ── Right: Tweak panel ────────────────────────────────── */}
        {activeJD && (
          <TweakPanel
            jd={activeJD}
            onTweak={handleTweak}
            collapsed={tweakCollapsed}
            onToggleCollapse={() => tweakCollapsed ? openTweak() : closeTweak()}
          />
        )}

      </div>
    </div>
  )
}
