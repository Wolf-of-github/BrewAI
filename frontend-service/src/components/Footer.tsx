export default function Footer() {
  return (
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
        </div>
      </div>
    </footer>
  )
}
