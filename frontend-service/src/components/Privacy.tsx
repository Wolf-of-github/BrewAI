import Navbar from './Navbar'
import Footer from './Footer'

export default function Privacy() {
  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--bg-base)', color: 'var(--text-muted)' }}>
      <Navbar />
      <main className="flex-1 max-w-3xl mx-auto px-6 py-16">
        <h1 className="text-3xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Privacy Policy</h1>
        <p className="text-sm mb-12">Effective date: March 25, 2025</p>

        <Section title="1. What We Collect">
          <p>When you use Brew AI, we collect:</p>
          <ul>
            <li><strong>Account information</strong> — your name and email address via Google Sign-In.</li>
            <li><strong>Resume content</strong> — the PDF or document you upload as your base resume.</li>
            <li><strong>Job descriptions</strong> — the text you paste when requesting a tailored resume.</li>
            <li><strong>Usage data</strong> — basic logs (timestamps, request metadata) to operate and improve the service.</li>
          </ul>
          <p>We do not collect payment information, and we do not track you across other websites.</p>
        </Section>

        <Section title="2. How We Use Your Data">
          <p>Your data is used solely to provide the Brew AI service:</p>
          <ul>
            <li>Authenticating your account and securing access.</li>
            <li>Generating tailored resumes from your uploaded resume and pasted job descriptions.</li>
            <li>Storing generated resumes so you can retrieve them later.</li>
            <li>Diagnosing errors and improving reliability.</li>
          </ul>
        </Section>

        <Section title="3. Third-Party Services">
          <p>Brew AI is built on infrastructure provided by:</p>
          <ul>
            <li><strong>Google Cloud Platform</strong> — compute, storage, and database hosting.</li>
          </ul>
          <p>Each provider has its own privacy policy. Your data is processed on GCP infrastructure within the United States.</p>
        </Section>

        <Section title="4. Data Retention">
          <p>Your uploaded resumes and generated tailored resumes are retained as long as your account is active. You may request deletion of your data at any time by contacting us at <a href="mailto:contact@brewai.com" style={{ color: 'var(--accent)' }} className="hover:underline">hello@brewai.app</a>.</p>
        </Section>

        <Section title="5. Security">
          <p>Files are stored in private Google Cloud Storage buckets accessible only to your authenticated account. We apply industry-standard security practices, but no system is perfectly secure — use Brew AI at your own risk for highly sensitive documents.</p>
        </Section>

        <Section title="6. Changes to This Policy">
          <p>We may update this policy as the product evolves. Material changes will be communicated via email or an in-app notice. Continued use after changes constitutes acceptance.</p>
        </Section>

        <Section title="7. Contact">
          <p>Questions or requests? Email us at <a href="mailto:hello@brewai.app" style={{ color: 'var(--accent)' }} className="hover:underline">contact@brewai.com</a>.</p>
        </Section>
      </main>
      <Footer />
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-10">
      <h2 className="text-lg font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>{title}</h2>
      <div className="prose-list space-y-3 text-sm leading-relaxed" style={{ '--tw-prose-strong': 'var(--text-primary)' } as React.CSSProperties}>
        {children}
      </div>
    </section>
  )
}
