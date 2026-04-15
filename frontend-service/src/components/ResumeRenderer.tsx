import { Document, Page, Text, View, StyleSheet, pdf } from '@react-pdf/renderer'

// ─── Types ────────────────────────────────────────────────────────────────────

interface PersonalDetails {
  name?: string
  location?: string
  phone?: string
  email?: string
  linkedin?: string
  website?: string
}

interface Education {
  institution?: string
  degree?: string
  duration?: string
  gpa?: string
  coursework?: string
}

interface Experience {
  company?: string
  role?: string
  location?: string
  duration?: string
  stack?: string
  bullets?: string[]
}

interface Project {
  name?: string
  stack?: string
  duration?: string
  location?: string
  bullets?: string[]
}

interface Publication {
  title?: string
  date?: string
  venue?: string
  role?: string
  authors?: string[]
  links?: { paper?: string; code?: string }
  bullets?: string[]
}

export interface ResumeData {
  personal_details?: PersonalDetails
  professional_summary?: string
  skills?: string
  education?: Education[]
  experience?: Experience[]
  academic_projects?: Project[]
  publications?: Publication[]
  certifications?: string[]
  leadership?: string[]
  sidequests?: Record<string, string[]>
  [key: string]: unknown
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const BLUE = '#2563a8'
const BLACK = '#111111'
const GRAY = '#555555'

const s = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 10,
    color: BLACK,
    paddingTop: 28,
    paddingBottom: 28,
    paddingHorizontal: 36,
    lineHeight: 1.35,
  },
  // Header
  name: {
    fontSize: 15,
    fontFamily: 'Helvetica-Bold',
    color: BLUE,
    marginBottom: 2,
  },
  contactBar: {
    fontSize: 8.5,
    color: GRAY,
    marginBottom: 1,
  },
  contactLink: {
    fontSize: 8.5,
    color: GRAY,
    textDecoration: 'none',
  },
  divider: {
    borderBottomWidth: 0.75,
    borderBottomColor: BLACK,
    marginTop: 1,
    marginBottom: 3,
  },
  // Section
  sectionTitle: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    color: '#21465f',
    marginBottom: 1,
  },
  sectionGap: { marginBottom: 8 },
  // Row layout
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    flexWrap: 'nowrap',
  },
  bold: { fontFamily: 'Helvetica-Bold' },
  italic: { fontFamily: 'Helvetica-Oblique', color: BLUE },
  // Bullets
  bullet: {
    flexDirection: 'row',
    marginTop: 1,
  },
  bulletDot: {
    width: 10,
    fontSize: 10,
  },
  bulletText: {
    flex: 1,
    textAlign: 'justify',
  },
  // Plain text
  bodyText: {
    textAlign: 'justify',
    marginTop: 1,
  },
  entryGap: { marginTop: 5 },
})

// ─── Helpers ──────────────────────────────────────────────────────────────────

function Divider() {
  return <View style={s.divider} />
}

function SectionTitle({ children }: { children: string }) {
  return (
    <>
      <Text style={s.sectionTitle}>{children}</Text>
      <Divider />
    </>
  )
}

function Bullets({ items }: { items: string[] }) {
  return (
    <>
      {items.map((b, i) => (
        <View key={i} style={s.bullet}>
          <Text style={s.bulletDot}>•</Text>
          <Text style={s.bulletText}>{b}</Text>
        </View>
      ))}
    </>
  )
}

// ─── PDF Document ─────────────────────────────────────────────────────────────

function ResumePDF({ data }: { data: ResumeData }) {
  const p = data.personal_details ?? {}

  const contactParts: string[] = [
    p.location,
    p.phone,
    p.email,
    p.linkedin,
    p.website,
  ].filter(Boolean) as string[]

  return (
    <Document>
      <Page size="LETTER" style={s.page}>

        {/* ── Header ── */}
        {p.name && <Text style={s.name}>{p.name}</Text>}
        <Divider />
        <Text style={s.contactBar}>{contactParts.join('  |  ')}</Text>

        <View style={{ marginBottom: 8 }} />

        {/* ── Professional Summary ── */}
        {data.professional_summary && (
          <View style={s.sectionGap}>
            <SectionTitle>PROFESSIONAL SUMMARY</SectionTitle>
            <Text style={s.bodyText}>{data.professional_summary}</Text>
          </View>
        )}

        {/* ── Skills ── */}
        {data.skills && (
          <View style={s.sectionGap}>
            <SectionTitle>SKILLS</SectionTitle>
            <Text style={s.bodyText}>{data.skills}</Text>
          </View>
        )}

        {/* ── Education ── */}
        {data.education && data.education.length > 0 && (
          <View style={s.sectionGap}>
            <SectionTitle>EDUCATION</SectionTitle>
            {data.education.map((edu, i) => (
              <View key={i} style={i > 0 ? s.entryGap : undefined}>
                <View style={s.row}>
                  <Text style={s.bold}>{edu.institution}</Text>
                  <Text style={s.bold}>{edu.duration}</Text>
                </View>
                <View style={s.row}>
                  <Text style={s.italic}>{edu.degree}</Text>
                  {edu.gpa && <Text style={s.italic}>GPA: {edu.gpa}</Text>}
                </View>
                {edu.coursework && (
                  <Text style={s.bodyText}>Coursework: {edu.coursework}</Text>
                )}
              </View>
            ))}
          </View>
        )}

        {/* ── Experience ── */}
        {data.experience && data.experience.length > 0 && (
          <View style={s.sectionGap}>
            <SectionTitle>EXPERIENCE</SectionTitle>
            {data.experience.map((exp, i) => (
              <View key={i} style={i > 0 ? s.entryGap : undefined}>
                <View style={s.row}>
                  <Text style={s.bold}>{exp.company}</Text>
                  <Text style={s.bold}>{exp.duration}</Text>
                </View>
                <View style={s.row}>
                  <Text style={s.italic}>{exp.role}</Text>
                  <Text>{exp.location}</Text>
                </View>
                {exp.bullets && <Bullets items={exp.bullets} />}
              </View>
            ))}
          </View>
        )}

        {/* ── Projects ── */}
        {data.academic_projects && data.academic_projects.length > 0 && (
          <View style={s.sectionGap}>
            <SectionTitle>PROJECTS</SectionTitle>
            {data.academic_projects.map((proj, i) => (
              <View key={i} style={i > 0 ? s.entryGap : undefined}>
                <View style={s.row}>
                  <Text style={s.bold}>{proj.name}</Text>
                  {proj.duration && <Text style={s.bold}>{proj.duration}</Text>}
                </View>
                {proj.stack && (
                  <View style={s.row}>
                    <Text style={s.italic}>{proj.stack}</Text>
                    {proj.location && <Text>{proj.location}</Text>}
                  </View>
                )}
                {proj.bullets && <Bullets items={proj.bullets} />}
              </View>
            ))}
          </View>
        )}

        {/* ── Certifications ── */}
        {data.certifications && data.certifications.length > 0 && (
          <View style={s.sectionGap}>
            <SectionTitle>CERTIFICATIONS</SectionTitle>
            <Bullets items={data.certifications} />
          </View>
        )}

        {/* ── Leadership ── */}
        {data.leadership && data.leadership.length > 0 && (
          <View style={s.sectionGap}>
            <SectionTitle>LEADERSHIP</SectionTitle>
            <Bullets items={data.leadership} />
          </View>
        )}

        {/* ── Dynamic extra sections (sidequests) ── */}
        {data.sidequests && Object.entries(data.sidequests).map(([key, items]) => (
          <View key={key} style={s.sectionGap}>
            <SectionTitle>{key.toUpperCase()}</SectionTitle>
            <Bullets items={items} />
          </View>
        ))}

        {/* ── Any other extra_sections keys added by gen-ai ── */}
        {Object.entries(data)
          .filter(([k]) => !['personal_details','professional_summary','skills','education',
            'experience','academic_projects','publications','certifications','leadership','sidequests',
            'final_resume'].includes(k))
          .filter(([, v]) => Array.isArray(v) && v.length > 0)
          .map(([key, items]) => (
            <View key={key} style={s.sectionGap}>
              <SectionTitle>{key.replace(/_/g, ' ').toUpperCase()}</SectionTitle>
              <Bullets items={items as string[]} />
            </View>
          ))}

      </Page>
    </Document>
  )
}

// ─── Preview (shown in the dashboard) ────────────────────────────────────────
// Renders the resume as styled HTML for the on-screen preview.
// The actual PDF is generated separately via generatePDF().

export default function ResumeRenderer({ data }: { data: ResumeData }) {
  const p = data.personal_details ?? {}

  const contactParts: string[] = [
    p.location,
    p.phone,
    p.email,
    p.linkedin,
    p.website,
  ].filter(Boolean) as string[]

  return (
    <>
      <style>{`
        #draft {
          width: 8.5in;
          min-height: 11in;
          font-family: Helvetica, Arial, sans-serif;
          font-size: 10pt;
          background: white;
          color: #111;
          padding: 0.39in 0.5in;
          box-sizing: border-box;
          line-height: 1.35;
        }
        #draft .name { font-size: 15pt; font-weight: bold; color: #2563a8; margin-bottom: 2px; }
        #draft .divider { border: none; border-top: 0.75px solid #111; margin: 2px 0 3px 0; }
        #draft .contact { font-size: 8.5pt; color: #555; margin-bottom: 8pt; }
        #draft .section-title { font-size: 10pt; font-weight: bold; color: #21465f; margin-bottom: 1px; }
        #draft .section-gap { margin-bottom: 8pt; }
        #draft .row { display: flex; justify-content: space-between; }
        #draft .bold { font-weight: bold; }
        #draft .italic { font-style: italic; color: #2563a8; }
        #draft .body-text { text-align: justify; margin-top: 1px; }
        #draft .entry-gap { margin-top: 5pt; }
        #draft ul { margin: 2px 0 0 0; padding-left: 1.1em; }
        #draft li { text-align: justify; }
      `}</style>

      <div id="draft-wrapper" className="bg-gray-200 flex justify-center py-6 min-h-full">
        <div id="draft" className="shadow-2xl">

          {p.name && <div className="name">{p.name}</div>}
          <hr className="divider" />
          <div className="contact">{contactParts.join('  |  ')}</div>

          {data.professional_summary && (
            <div className="section-gap">
              <div className="section-title">PROFESSIONAL SUMMARY</div>
              <hr className="divider" />
              <div className="body-text">{data.professional_summary}</div>
            </div>
          )}

          {data.skills && (
            <div className="section-gap">
              <div className="section-title">SKILLS</div>
              <hr className="divider" />
              <div className="body-text">{data.skills}</div>
            </div>
          )}

          {data.education && data.education.length > 0 && (
            <div className="section-gap">
              <div className="section-title">EDUCATION</div>
              <hr className="divider" />
              {data.education.map((edu, i) => (
                <div key={i} className={i > 0 ? 'entry-gap' : ''}>
                  <div className="row"><span className="bold">{edu.institution}</span><span className="bold">{edu.duration}</span></div>
                  <div className="row"><span className="italic">{edu.degree}</span>{edu.gpa && <span className="italic">GPA: {edu.gpa}</span>}</div>
                  {edu.coursework && <div className="body-text">Coursework: {edu.coursework}</div>}
                </div>
              ))}
            </div>
          )}

          {data.experience && data.experience.length > 0 && (
            <div className="section-gap">
              <div className="section-title">EXPERIENCE</div>
              <hr className="divider" />
              {data.experience.map((exp, i) => (
                <div key={i} className={i > 0 ? 'entry-gap' : ''}>
                  <div className="row"><span className="bold">{exp.company}</span><span className="bold">{exp.duration}</span></div>
                  <div className="row"><span className="italic">{exp.role}</span><span>{exp.location}</span></div>
                  {exp.bullets && <ul>{exp.bullets.map((b, j) => <li key={j}>{b}</li>)}</ul>}
                </div>
              ))}
            </div>
          )}

          {data.academic_projects && data.academic_projects.length > 0 && (
            <div className="section-gap">
              <div className="section-title">PROJECTS</div>
              <hr className="divider" />
              {data.academic_projects.map((proj, i) => (
                <div key={i} className={i > 0 ? 'entry-gap' : ''}>
                  <div className="row"><span className="bold">{proj.name}</span>{proj.duration && <span className="bold">{proj.duration}</span>}</div>
                  {proj.stack && <div className="row"><span className="italic">{proj.stack}</span>{proj.location && <span>{proj.location}</span>}</div>}
                  {proj.bullets && <ul>{proj.bullets.map((b, j) => <li key={j}>{b}</li>)}</ul>}
                </div>
              ))}
            </div>
          )}

          {data.certifications && data.certifications.length > 0 && (
            <div className="section-gap">
              <div className="section-title">CERTIFICATIONS</div>
              <hr className="divider" />
              <ul>{data.certifications.map((c, i) => <li key={i}>{c}</li>)}</ul>
            </div>
          )}

          {data.leadership && data.leadership.length > 0 && (
            <div className="section-gap">
              <div className="section-title">LEADERSHIP</div>
              <hr className="divider" />
              <ul>{data.leadership.map((l, i) => <li key={i}>{l}</li>)}</ul>
            </div>
          )}

          {data.sidequests && Object.entries(data.sidequests).map(([key, items]) => (
            <div key={key} className="section-gap">
              <div className="section-title">{key.toUpperCase()}</div>
              <hr className="divider" />
              <ul>{items.map((item, i) => <li key={i}>{item}</li>)}</ul>
            </div>
          ))}

        </div>
      </div>
    </>
  )
}

// ─── PDF export ───────────────────────────────────────────────────────────────

export async function generatePDF(data: ResumeData, filename: string) {
  const blob = await pdf(<ResumePDF data={data} />).toBlob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
