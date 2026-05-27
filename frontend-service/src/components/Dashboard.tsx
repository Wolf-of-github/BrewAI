import { useState, useRef, useEffect, useCallback } from 'react'
import { apiFetch, uploadResume as apiUploadResume, deleteResume as apiDeleteResume, getGithubStatus as apiGetGithubStatus, tailorResume as apiTailorResume, listTailored as apiListTailored, getTailoredContent, getTailoredTex, getGithubOAuthUrl, handleGithubCallback, disconnectGithub as apiDisconnectGithub, updateTailoredJob, recordDownload, getFirebaseToken, sendContactEmail } from '../lib/api'
import { db, auth, signInToFirestore } from '../lib/firebase'
import { doc, onSnapshot } from 'firebase/firestore'
import {
  GithubIcon as Github,
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
  LayoutList,
  Eye,
  Wand2,
} from 'lucide-react'
import { useTheme } from '../context/ThemeContext'

// ─── Toast System ─────────────────────────────────────────────────────────────

interface Toast {
  id: number
  message: string
  type: 'error' | 'info'
}

let _toastId = 0
let _addToast: ((message: string, type?: Toast['type']) => void) | null = null

export function showToast(message: string, type: Toast['type'] = 'error') {
  _addToast?.(message, type)
}

function ToastContainer() {
  const [toasts, setToasts] = useState<Toast[]>([])

  useEffect(() => {
    _addToast = (message, type = 'error') => {
      const id = ++_toastId
      setToasts((prev) => [...prev, { id, message, type }])
      setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 5000)
    }
    return () => { _addToast = null }
  }, [])

  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-20 sm:bottom-5 right-3 sm:right-5 z-9999 flex flex-col gap-2 max-w-[calc(100vw-1.5rem)] sm:max-w-sm">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="flex items-start gap-3 px-4 py-3 rounded-xl shadow-lg text-sm"
          style={{
            background: t.type === 'error' ? '#2d1414' : 'var(--bg-card)',
            border: `1px solid ${t.type === 'error' ? '#7f1d1d' : 'var(--border)'}`,
            color: t.type === 'error' ? '#fca5a5' : 'var(--text-primary)',
          }}
        >
          {t.type === 'error'
            ? <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-400" />
            : <Sparkles className="w-4 h-4 shrink-0 mt-0.5" style={{ color: 'var(--accent)' }} />
          }
          <span className="flex-1">{t.message}</span>
          <button
            onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}
            className="shrink-0 opacity-60 hover:opacity-100 transition-opacity"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
    </div>
  )
}

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
function ResumePanel({ firestoreReady }: { firestoreReady: boolean }) {
  const [resume, setResume] = useState<ResumeFile | null>(null)
  const [loading, setLoading] = useState(true)
  // 'idle' | 'uploading' | 'parsing'
  const [uploadState, setUploadState] = useState<'idle' | 'uploading' | 'parsing'>('idle')
  const fileRef = useRef<HTMLInputElement>(null)
  const unsubRef = useRef<(() => void) | null>(null)

  // Subscribe to parsedResumes/{userId} snapshot to know when parsing completes.
  // Skip the first fire — the doc may have a stale status from a previous upload.
  function subscribeToParseStatus(userId: string, uploadedName: string, uploadedAt: string) {
    unsubRef.current?.()
    setUploadState('parsing')

    let firstFire = true
    const unsub = onSnapshot(
      doc(db, 'parsedResumes', userId),
      (snap) => {
        if (firstFire) { firstFire = false; return }
        if (!snap.exists()) return
        const data = snap.data()
        const status = data?.status as string | undefined

        if (status === 'success') {
          unsub()
          unsubRef.current = null
          setResume({
            id: data.fileId ?? userId,
            name: uploadedName,
            size: '',
            uploadedAt,
            active: true,
          })
          setUploadState('idle')
        } else if (status === 'rejected') {
          unsub()
          unsubRef.current = null
          setResume(null)
          setUploadState('idle')
          showToast('Resume rejected. Please upload a valid PDF or DOCX with readable text.')
        }
      },
      (err) => {
        console.error('[ResumePanel] snapshot error:', err)
        unsubRef.current = null
        setUploadState('idle')
        showToast('Failed to track resume status. Please refresh.')
      }
    )
    unsubRef.current = unsub
  }

  // Initial load — fetch existing resume from API
  useEffect(() => {
    apiFetch<{ resumes: Array<{ fileId: string; originalName: string; uploadedAt: string | null }> }>('/resume/list')
      .then(({ resumes: data }) => {
        if (data.length > 0) {
          const r = data[0]
          setResume({
            id: r.fileId,
            name: r.originalName,
            size: '',
            uploadedAt: r.uploadedAt ? new Date(r.uploadedAt).toLocaleDateString() : 'Unknown',
            active: true,
          })
        }
      })
      .catch(() => showToast('Failed to load resume. Please refresh.'))
      .finally(() => setLoading(false))

    return () => { unsubRef.current?.() }
  }, [])

  async function handleFiles(files: FileList | null) {
    if (!files || uploadState !== 'idle') return
    const file = files[0]

    // Clear existing resume immediately
    setResume(null)
    setUploadState('uploading')

    try {
      await apiUploadResume(file)
      if (!firestoreReady) throw new Error('Firestore not ready')
      const userId = auth.currentUser?.uid
      if (!userId) throw new Error('Not authenticated')
      const uploadedAt = new Date().toLocaleDateString()
      subscribeToParseStatus(userId, file.name, uploadedAt)
    } catch (err) {
      console.error('[ResumePanel] upload failed:', err)
      const msg = (err as Error).message
      setUploadState('idle')
      showToast(
        msg.includes('413') ? 'File too large. Please upload a resume under 10MB.' :
        msg.includes('415') ? 'Unsupported file type. Please upload a PDF or DOCX.' :
        'Resume upload failed. Please try again.'
      )
    } finally {
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function remove() {
    try {
      await apiDeleteResume()
      setResume(null)
      unsubRef.current?.()
      unsubRef.current = null
    } catch (err) {
      console.error('[ResumePanel] delete failed:', err)
      showToast('Failed to delete resume. Please try again.')
    }
  }

  const isBusy = uploadState !== 'idle'
  const statusLabel = uploadState === 'uploading' ? 'Uploading…' : uploadState === 'parsing' ? 'Parsing…' : 'Upload resume'

  return (
    <div
      id="resume-panel"
      className="rounded-2xl border p-5"
      style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
    >
      <SectionLabel>Resume (1 max)</SectionLabel>

      <div className="flex flex-col gap-2 mb-4">
        {loading ? (
          <div className="h-10 rounded-xl animate-pulse" style={{ background: 'var(--blue-subtle)' }} />
        ) : isBusy ? (
          // Spinner while uploading or parsing
          <div
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl border"
            style={{ borderColor: 'var(--accent-border)', background: 'var(--accent-subtle)' }}
          >
            <svg className="w-4 h-4 shrink-0 animate-spin" style={{ color: 'var(--accent)' }} viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
            </svg>
            <p className="text-sm" style={{ color: 'var(--accent)' }}>{statusLabel}</p>
          </div>
        ) : resume ? (
          <div
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl border"
            style={{ borderColor: 'var(--accent-border)', background: 'var(--accent-subtle)', boxShadow: '0 1px 4px var(--shadow-accent)' }}
          >
            <FileText className="w-4 h-4 shrink-0" style={{ color: 'var(--accent)' }} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{resume.name}</p>
              <p className="text-[11px]" style={{ color: 'var(--text-faint)' }}>{resume.uploadedAt}</p>
            </div>
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ color: 'var(--accent)', background: 'var(--accent-subtle)' }}>
              Active
            </span>
            <button
              onClick={() => remove()}
              className="transition-colors"
              style={{ color: 'var(--text-xfaint)' }}
              onMouseEnter={(e) => (e.currentTarget as HTMLElement).style.color = '#f87171'}
              onMouseLeave={(e) => (e.currentTarget as HTMLElement).style.color = 'var(--text-xfaint)'}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : null}
      </div>

      {!resume && !isBusy && (
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
            disabled={isBusy}
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
            Upload resume
          </button>
        </>
      )}

      {resume && !isBusy && (
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
  const [processing, setProcessing] = useState(false)
  const [reposFound, setReposFound] = useState<number | null>(null)
  const [disconnecting, setDisconnecting] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  function stopPolling() {
    if (pollRef.current !== null) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }

  function startPolling() {
    stopPolling()
    let count = 0
    const MAX_POLLS = 120 // 10 minutes at 5s intervals
    pollRef.current = setInterval(async () => {
      count++
      try {
        const { github_id, status, repos_found } = await apiGetGithubStatus()
        if (status === 'completed') {
          stopPolling()
          if (github_id) setSaved(github_id)
          setReposFound(repos_found ?? 0)
          setProcessing(false)
          return
        }
      } catch {
        // ignore transient errors, keep polling
      }
      if (count >= MAX_POLLS) {
        stopPolling()
        setProcessing(false)
        showToast('GitHub indexing timed out. Please try reconnecting.')
      }
    }, 5000)
  }

  useEffect(() => {
    apiGetGithubStatus()
      .then(({ github_id, status, repos_found }) => {
        if (github_id) setSaved(github_id)
        if (status === 'completed') {
          setReposFound(repos_found ?? 0)
        } else if (status === 'processing') {
          setProcessing(true)
          startPolling()
        }
      })
      .catch(() => showToast('Failed to load GitHub status. Please refresh.'))

    const params = new URLSearchParams(window.location.search)
    const code = params.get('code')
    if (code) {
      window.history.replaceState({}, '', window.location.pathname)
      setProcessing(true)
      handleGithubCallback(code)
        .then(({ github_id }) => {
          setSaved(github_id)
          startPolling()
        })
        .catch((err) => {
          console.error('[GitHubPanel] OAuth callback failed:', err)
          setProcessing(false)
          showToast('Failed to connect GitHub. Please try again.')
        })
    }

    return () => { stopPolling() }
  }, [])

  async function connectWithGithub() {
    try {
      const { url } = await getGithubOAuthUrl()
      window.location.href = url
    } catch (err) {
      console.error('[GitHubPanel] failed to get OAuth URL:', err)
      showToast('Could not start GitHub connection. Please try again.')
    }
  }

  const statusLabel = processing ? 'Reading repos…' : reposFound !== null ? `${reposFound} repo${reposFound !== 1 ? 's' : ''} indexed` : 'Connected'

  return (
    <div
      id="github-panel"
      className="rounded-2xl border p-5"
      style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
    >
      <SectionLabel>GitHub</SectionLabel>

      {saved ? (
        <div
          className="flex items-center gap-3 px-3 py-2.5 rounded-xl border"
          style={{ borderColor: 'var(--blue-border)', background: 'var(--blue-subtle)' }}
        >
          {processing ? (
            <svg className="w-4 h-4 shrink-0 animate-spin" style={{ color: 'var(--text-muted)' }} viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
            </svg>
          ) : (
            <Github className="w-4 h-4 shrink-0" style={{ color: 'var(--text-muted)' }} />
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>@{saved}</p>
            <p className="text-[11px]" style={{ color: 'var(--text-faint)' }}>{statusLabel}</p>
            {processing && <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-xfaint)' }}>Processing may take a few minutes…</p>}
          </div>
          {!processing && <CheckCircle className="w-4 h-4 shrink-0 text-emerald-500" />}
          <button
            disabled={disconnecting || processing}
            onClick={async () => {
              setDisconnecting(true)
              try {
                await apiDisconnectGithub()
                stopPolling()
                setSaved(null)
                setReposFound(null)
                setProcessing(false)
              } catch (err) {
                console.error('[GitHubPanel] disconnect failed:', err)
                showToast('Failed to disconnect GitHub. Please try again.')
              } finally {
                setDisconnecting(false)
              }
            }}
            className="text-[10px] transition-colors disabled:opacity-40"
            style={{ color: 'var(--text-faint)' }}
            onMouseEnter={(e) => (e.currentTarget as HTMLElement).style.color = 'var(--accent)'}
            onMouseLeave={(e) => (e.currentTarget as HTMLElement).style.color = 'var(--text-faint)'}
          >
            {disconnecting ? 'Disconnecting…' : 'Disconnect'}
          </button>
        </div>
      ) : processing ? (
        <div
          className="flex items-center gap-3 px-3 py-2.5 rounded-xl border"
          style={{ borderColor: 'var(--blue-border)', background: 'var(--blue-subtle)' }}
        >
          <svg className="w-4 h-4 shrink-0 animate-spin" style={{ color: 'var(--text-muted)' }} viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
          </svg>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Connecting…</p>
        </div>
      ) : (
        <button
          onClick={connectWithGithub}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border text-sm transition-all"
          style={{ borderColor: 'var(--blue-border)', background: 'var(--blue-subtle)', color: 'var(--text-muted)' }}
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
      updateTailoredJob(entry.id, { company: c, role: r }).catch(() => {
        showToast('Failed to save changes. Please try again.')
      })
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
        BrewAI typically takes ~60s. We're actively working on reducing wait time.
      </p>
    </div>
  )
}

// Resume viewer panel
function ResumeViewer({ jd, userEmail }: { jd: JDEntry | null; userEmail: string }) {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!jd) return
    if (jd.status === 'processing') { setPdfUrl(null); setError(null); return }
    if (jd.status === 'failed') {
      // Don't clear pdfUrl — keep showing last good resume so user isn't left with a blank screen.
      // The toast is already shown by the snapshot handler.
      setError(null)
      return
    }
    let cancelled = false
    setLoading(true)
    setPdfUrl(null)
    setError(null)

    async function fetchWithRetry(attempts: number) {
      for (let i = 0; i < attempts; i++) {
        try {
          const res = await getTailoredContent(jd!.id)
          if (!cancelled) { setPdfUrl(res); setLoading(false) }
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
        <div className="flex items-center gap-2">
          <button
            onClick={async () => {
              if (!jd) return
              const localEmail = userEmail.split('@')[0]
              const rand = Math.floor(1000 + Math.random() * 9000)
              const filename = [...[jd.company, jd.role, localEmail].map((s) => s.replace(/\s+/g, '-')), rand].join('—') + '.tex'
              try {
                const texUrl = await getTailoredTex(jd.id)
                const a = document.createElement('a')
                a.href = texUrl
                a.download = filename
                a.click()
              } catch { /* ignore */ }
            }}
            disabled={!pdfUrl}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: 'var(--bg-secondary)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
          >
            <Download className="w-3.5 h-3.5" />
            .tex
          </button>
          <button
            onClick={() => {
              if (!pdfUrl) return
              const localEmail = userEmail.split('@')[0]
              const rand = Math.floor(1000 + Math.random() * 9000)
              const filename = [...[jd.company, jd.role, localEmail].map((s) => s.replace(/\s+/g, '-')), rand].join('—') + '.pdf'
              const a = document.createElement('a')
              a.href = pdfUrl
              a.download = filename
              a.click()
              recordDownload().catch(() => {})
            }}
            disabled={!pdfUrl}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: 'var(--accent)', color: 'var(--accent-text)' }}
          >
            <Download className="w-3.5 h-3.5" />
            Download
          </button>
        </div>
      </div>

      {/* Content */}
      <div id='content-board' className="flex-1 overflow-y-auto">
        {loading && (
          <div className="flex items-center justify-center h-full py-20">
            <Sparkles className="w-6 h-6 animate-pulse" style={{ color: 'var(--accent)' }} />
          </div>
        )}
        {error && (
          <div className="flex items-center justify-center h-full py-20">
            <p className="text-sm text-gray-600">{error}</p>
          </div>
        )}
        {jd.status === 'processing' && !loading && (
          <div className="flex flex-col items-center justify-center h-full py-20 gap-3">
            <Sparkles className="w-6 h-6 animate-pulse" style={{ color: 'var(--accent)' }} />
            <p className="text-sm" style={{ color: 'var(--text-faint)' }}>Brewing your resume…</p>
            <BrewCountdown />
          </div>
        )}
        {pdfUrl && <iframe src={pdfUrl} className="w-full border-0" style={{ height: '150vw', minHeight: '900px' }} title="Resume Preview" />}
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
  // const [onePage, setOnePage] = useState(false)

  async function submit() {
    if (!text.trim() || submitting) return
    const jdText = text.replace(/[\x00-\x1F\x7F]/g, ' ').replace(/\s+/g, ' ').trim()
    setSubmitting(true)
    try {
      const { draft_id, company, role } = await apiTailorResume(jdText, instructions.trim(), undefined)
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
      const msg = (err as Error).message
      showToast(
        msg.includes('500') || msg.includes('502') || msg.includes('503')
          ? 'Failed to start brew. Please try again.'
          : msg  // server messages are user-friendly for 400, 429, etc.
      )
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

      {/* One-page toggle hidden for now
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Fit to one page</span>
        <button
          type="button"
          onClick={() => setOnePage((v) => !v)}
          className="relative w-9 h-5 rounded-full transition-colors"
          style={{ background: onePage ? 'var(--accent)' : 'var(--border)' }}
          aria-label="Toggle one page"
        >
          <span
            className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform"
            style={{ transform: onePage ? 'translateX(16px)' : 'translateX(0)' }}
          />
        </button>
      </div>
      */}

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
      <div className="max-w-350 mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
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
            className="hidden sm:inline ml-2 text-[10px] font-semibold px-2 py-0.5 rounded-full border"
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

// ─── Suggestions Panel ────────────────────────────────────────────────────────

function SuggestionsPanel({ userId, collapsed, onExpand }: { userId: string; collapsed: boolean; onExpand: () => void }) {
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [sent, setSent] = useState(false)
  const [confirming, setConfirming] = useState(false)

  function submit() {
    if (!message.trim() || submitting) return
    setConfirming(true)
  }

  async function confirmSend() {
    setConfirming(false)
    setSubmitting(true)
    try {
      await sendContactEmail(`${userId}@suggestion.com`, `${message.trim()}\n\n— ${userId}`, 'Dashboard suggestion')
      setSent(true)
      setMessage('')
      setTimeout(() => setSent(false), 3000)
    } catch { /* ignore */ } finally {
      setSubmitting(false)
    }
  }

  if (collapsed) {
    return (
      <div className="flex flex-col items-center py-1 gap-2 cursor-pointer" onClick={onExpand}>
        <div className="w-8 h-8 flex items-center justify-center rounded-lg transition-colors" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-faint)' }}
          onMouseEnter={(e) => (e.currentTarget as HTMLElement).style.color = 'var(--accent)'}
          onMouseLeave={(e) => (e.currentTarget as HTMLElement).style.color = 'var(--text-faint)'}
        >
          <Send className="w-4 h-4" />
        </div>
        <span className="text-[9px] font-medium" style={{ color: 'var(--text-xfaint)', writingMode: 'vertical-rl', textOrientation: 'mixed' }}>Suggest</span>
      </div>
    )
  }

  return (
    <div
      className="rounded-2xl border p-5 flex flex-col gap-3"
      style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
    >
      <SectionLabel>Suggest Improvements</SectionLabel>
      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit() } }}
        placeholder="Share feedback/suggestions"
        rows={3}
        disabled={submitting}
        className="w-full px-3 py-2.5 rounded-lg border text-sm focus:outline-none resize-none disabled:opacity-40"
        style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
      />
      {confirming ? (
        <div className="flex gap-2">
          <button
            onClick={() => setConfirming(false)}
            className="flex-1 py-2 rounded-xl text-sm font-semibold transition-colors"
            style={{ background: 'var(--bg-secondary)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}
          >
            Cancel
          </button>
          <button
            onClick={confirmSend}
            className="flex-1 py-2 rounded-xl text-sm font-semibold transition-colors flex items-center justify-center gap-2"
            style={{ background: 'var(--accent)', color: 'var(--accent-text)' }}
          >
            <Send className="w-3.5 h-3.5" />
            Confirm
          </button>
        </div>
      ) : (
        <button
          onClick={submit}
          disabled={submitting || !message.trim()}
          className="w-full py-2 rounded-xl text-sm font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          style={{ background: 'var(--bg-secondary)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
        >
          <Send className="w-3.5 h-3.5" />
          {sent ? 'Sent!' : submitting ? 'Sending…' : 'Send'}
        </button>
      )}
    </div>
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
    <div className="flex flex-col w-full">
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
            placeholder={jd?.status === 'done' ? 'Prompt to tweak resume, kindly be specific with your requests 😊 (Max 5 tweaks)' : 'Select a completed draft to tweak'}
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

// ─── Mobile Tweak Content (inline, no fixed width) ────────────────────────────

function MobileTweakContent({ jd, onTweak }: { jd: JDEntry; onTweak: (draftId: string, instruction: string) => void }) {
  const [instruction, setInstruction] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function submit() {
    if (!instruction.trim() || submitting || jd.status === 'processing') return
    const text = instruction.trim()
    setSubmitting(true)
    try {
      await onTweak(jd.id, text)
      setInstruction('')
    } finally {
      setSubmitting(false)
    }
  }

  const isDisabled = jd.status === 'processing' || submitting

  return (
    <div
      className="rounded-2xl border p-5 flex flex-col gap-4"
      style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
    >
      <div className="flex flex-col gap-1">
        <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{jd.company}</p>
        <p className="text-xs truncate" style={{ color: 'var(--text-faint)' }}>{jd.role}</p>
      </div>

      {jd.instructions && jd.instructions.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--text-xfaint)' }}>Past instructions</p>
          {jd.instructions.map((instr, i) => (
            <div key={i} className="px-2.5 py-1.5 rounded-lg text-xs" style={{ background: 'var(--blue-subtle)', color: 'var(--text-muted)' }}>
              {instr}
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-2">
        {jd.status === 'processing' && (
          <p className="text-xs text-center" style={{ color: 'var(--accent)' }}>
            <Sparkles className="w-3 h-3 inline mr-1 animate-pulse" />
            Brewing…
          </p>
        )}
        <textarea
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit() } }}
          placeholder={jd.status === 'done' ? 'Prompt to tweak resume (Max 5 tweaks)' : 'Select a completed draft to tweak'}
          rows={4}
          disabled={isDisabled}
          className="w-full px-3 py-2.5 rounded-lg border text-sm focus:outline-none resize-none disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ background: 'var(--bg-secondary)', borderColor: 'var(--accent-border)', color: 'var(--text-primary)' }}
        />
        <button
          onClick={submit}
          disabled={isDisabled || !instruction.trim()}
          className="w-full py-2.5 rounded-xl text-sm font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          style={{ background: 'var(--accent)', color: 'var(--accent-text)' }}
        >
          <Send className="w-3.5 h-3.5" />
          {submitting ? 'Sending…' : 'Brew tweak'}
        </button>
      </div>
    </div>
  )
}

// ─── Main Dashboard ────────────────────────────────────────────────────────────

type MobileTab = 'setup' | 'preview' | 'tweak'

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
  const [firestoreReady, setFirestoreReady] = useState(false)
  const [mobileTab, setMobileTab] = useState<MobileTab>('setup')

  // Sign into Firestore once on mount — must complete before any snapshot is opened
  useEffect(() => {
    getFirebaseToken()
      .then(({ token }) => signInToFirestore(token))
      .then(() => setFirestoreReady(true))
      .catch(() => setFirestoreReady(true)) // allow degraded mode
  }, [])

  // Derive activeJD from jdHistory — snapshot updates flow through automatically, no stale closures
  const activeJD = jdHistory.find((e) => e.id === activeId) ?? null

  function openTweak() { setTweakCollapsed(false) }
  function closeTweak() { setTweakCollapsed(true) }

  // async function handleCheckout() {
  //   const { url } = await createCheckoutSession()
  //   window.location.href = url
  // }

  // waitForChange=true: skip the first snapshot fire (draft was already completed
  // before this call — we need to wait for the next real state transition).
  function openSnapshot(draftId: string, waitForChange = false) {
    const draftRef = doc(db, 'drafts', draftId)
    let firstFire = true
    const unsubscribe = onSnapshot(
      draftRef,
      (snap) => {
        if (!snap.exists()) return
        const data = snap.data()!

        // Skip the very first fire when we know the doc is already completed
        // and we're waiting for the genai job to produce a new transition.
        if (firstFire && waitForChange) {
          firstFire = false
          return
        }
        firstFire = false

        if (data.status === 'completed') {
          const safetyRejected = data.error === 'Input failed safety check'
          if (safetyRejected) {
            setJdHistory((prev) => prev.map((e) => e.id === draftId
              ? { ...e, status: 'done', instructions: e.instructions.slice(0, -1) }
              : e
            ))
            showToast('Your tweak was flagged as unsafe. Please rephrase and try again.')
          } else {
            setJdHistory((prev) => prev.map((e) => e.id === draftId ? {
              ...e,
              status: 'done',
              gcs_url: '',
              ...(data.company ? { company: data.company } : {}),
              ...(data.role ? { role: data.role } : {}),
            } : e))
          }
          unsubscribe()
        } else if (data.status === 'failed') {
          const errMsg = data.error as string | undefined
          setJdHistory((prev) => prev.map((e) => e.id === draftId ? { ...e, status: 'failed' } : e))
          showToast(errMsg ?? 'Resume generation failed. Please try re-submitting the job description.')
          unsubscribe()
        }
        // 'processing' / 'running' — keep listening
      },
      (err) => {
        console.error('[openSnapshot] Firestore subscription error:', err)
        setJdHistory((prev) => prev.map((e) => e.id === draftId ? { ...e, status: 'failed' } : e))
        showToast('Lost connection to status updates. Please refresh the page.')
      }
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
    }).catch(() => {
      showToast('Failed to load your brew history. Please refresh the page.')
    })
  }

  useEffect(() => {
    if (firestoreReady) fetchHistory()
  }, [firestoreReady])

  function addJD(entry: JDEntry) {
    setJdHistory((prev) => [entry, ...prev])
    setActiveId(entry.id)
    openSnapshot(entry.id)
    openTweak()
    setMobileTab('preview')
  }

  const handleUpdate = useCallback((id: string, company: string, role: string) => {
    setJdHistory((prev) => prev.map((e) => e.id === id ? { ...e, company, role } : e))
  }, [])

  async function handleTweak(draftId: string, instruction: string) {
    try {
      await apiTailorResume('', instruction, draftId)
      // Set processing first, then open snapshot — so snapshot completion
      // always overwrites processing, never the other way around.
      setJdHistory((prev) => prev.map((e) => e.id === draftId ? {
        ...e,
        status: 'processing',
        instructions: [...e.instructions, instruction],
      } : e))
      // Use setTimeout(0) to ensure the processing state is committed before
      // the snapshot potentially fires synchronously with a completed status.
      setTimeout(() => openSnapshot(draftId, true), 0)
    } catch (err) {
      console.error('[handleTweak] failed:', err)
      const msg = (err as Error).message
      showToast(
        msg.toLowerCase().includes('limit') || msg.includes('429')
          ? msg  // server message is already user-friendly
          : 'Tweak failed. Please try again.'
      )
    }
  }

  const sidebarContent = (
    <>
      <ResumePanel firestoreReady={firestoreReady} />
      <GitHubPanel />

      <div>
        <SectionLabel>Job Description</SectionLabel>
        <JDInput onSubmit={addJD} />
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
                onClick={() => { setActiveId(entry.id); openTweak(); setMobileTab('preview') }}
                onUpdate={handleUpdate}
              />
            ))
          )}
        </div>
      </div>
    </>
  )

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}>
      <ToastContainer />
      <DashboardNavbar user={user} onSignOut={onSignOut ?? (() => {})} onProfile={onProfile ?? (() => {})} onHome={onHome ?? (() => {})} />

      {/* ── Desktop layout (sm+) ──────────────────────────────── */}
      <div className="hidden sm:flex flex-1 max-w-350 w-full mx-auto px-4 sm:px-6 py-6 gap-5">

        {/* Left sidebar */}
        {!tweakCollapsed ? (
          <aside
            id="left-sidebar-collapsed"
            onClick={closeTweak}
            title="Open sidebar"
            className="w-10 shrink-0 flex flex-col items-center gap-5 pt-3 rounded-2xl border cursor-pointer transition-colors"
            style={{ background: 'var(--bg-card)', borderColor: 'var(--border)', color: 'var(--text-faint)' }}
            onMouseEnter={(e) => (e.currentTarget as HTMLElement).style.color = 'var(--accent)'}
            onMouseLeave={(e) => (e.currentTarget as HTMLElement).style.color = 'var(--text-faint)'}
          >
            <FileText className="w-4 h-4 shrink-0" />
            <Github className="w-4 h-4 shrink-0" />
            <Plus className="w-4 h-4 shrink-0" />
            <Clock className="w-4 h-4 shrink-0" />
          </aside>
        ) : (
          <aside id="left-sidebar" className="w-72 shrink-0 flex flex-col gap-4">
            {sidebarContent}
          </aside>
        )}

        {/* Center: PDF viewer */}
        <main id="resume-panel" className="flex-1 flex flex-col gap-4 min-w-0">
          <ResumeViewer jd={activeJD} userEmail={user?.email ?? ''} />
        </main>

        {/* Right: Tweak panel + Suggestions */}
        <div className={`hidden sm:flex flex-col shrink-0 sticky top-20 self-start gap-3 ${tweakCollapsed ? '' : 'w-72'}`}>
          {activeJD && (
            <TweakPanel
              jd={activeJD}
              onTweak={handleTweak}
              collapsed={tweakCollapsed}
              onToggleCollapse={() => tweakCollapsed ? openTweak() : closeTweak()}
            />
          )}
          <SuggestionsPanel userId={user.email.split('@')[0]} collapsed={tweakCollapsed} onExpand={() => openTweak()} />
        </div>
      </div>

      {/* ── Mobile layout (<sm) ───────────────────────────────── */}
      <div className="flex sm:hidden flex-1 flex-col min-h-0">

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto px-3 py-4">
          {mobileTab === 'setup' && (
            <div className="flex flex-col gap-4">
              {sidebarContent}
            </div>
          )}
          {mobileTab === 'preview' && (
            <div className="flex flex-col gap-4 h-full min-h-[60vh]">
              <ResumeViewer jd={activeJD} userEmail={user?.email ?? ''} />
            </div>
          )}
          {mobileTab === 'tweak' && (
            <div className="flex flex-col gap-4">
              {activeJD ? (
                <MobileTweakContent
                  jd={activeJD}
                  onTweak={handleTweak}
                />
              ) : (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <Sparkles className="w-8 h-8 mb-3" style={{ color: 'var(--border-strong)' }} />
                  <p className="text-sm" style={{ color: 'var(--text-faint)' }}>Select a job first to tweak your resume.</p>
                </div>
              )}
              <SuggestionsPanel userId={user.email.split('@')[0]} collapsed={false} onExpand={() => {}} />
            </div>
          )}
        </div>

        {/* Mobile bottom tab bar */}
        <nav
          className="shrink-0 border-t flex items-stretch"
          style={{ background: 'var(--navbar-bg)', borderColor: 'var(--border)' }}
        >
          {([
            { id: 'setup', label: 'Setup', icon: <LayoutList className="w-5 h-5" /> },
            { id: 'preview', label: 'Preview', icon: <Eye className="w-5 h-5" /> },
            { id: 'tweak', label: 'Tweak', icon: <Wand2 className="w-5 h-5" /> },
          ] as { id: MobileTab; label: string; icon: React.ReactNode }[]).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setMobileTab(tab.id)}
              className="flex-1 flex flex-col items-center justify-center gap-1 py-2.5 text-[11px] font-medium transition-colors"
              style={{
                color: mobileTab === tab.id ? 'var(--accent)' : 'var(--text-faint)',
                background: 'transparent',
                border: 'none',
              }}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </nav>
      </div>
    </div>
  )
}
