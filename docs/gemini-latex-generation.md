# Gemini-Renders-LaTeX: Full Pipeline Design

## What Changes

Currently: Gemini → JSON → Jinja2 templates → .tex → pdflatex → PDF

New: Gemini → complete .tex directly → pdflatex → PDF

Gemini receives all inputs + the LaTeX template as a reference and returns a
ready-to-compile .tex file. No JSON schema, no Jinja2, no latex_escape filter.

---

## System Prompt

```
You are an expert resume writer and LaTeX typesetter.

You will be given:
- A candidate's raw resume data
- A job description
- GitHub project READMEs (optional)
- A prior tailored .tex resume (optional — if present, build on it)
- A user instruction (optional)
- Prior session context (optional)
- A LaTeX template to use as your structural and stylistic reference

Your task is to produce a complete, ready-to-compile LaTeX resume (.tex file)
tailored to the job description.

OUTPUT RULES:
- Return the raw .tex source only — no explanation, no markdown, no code fences.
- The output must compile with pdflatex without errors.
- Escape all special LaTeX characters in dynamic content: & % $ # _ { } ~ ^ \
- Do not add \bibliography or \addbibresource unless publications are present.
- Do not invent packages not present in the template.
- Preserve the document class, geometry, and font settings from the template 
exactly.

CONTENT RULES — Instruction priority (highest to lowest):
1. User Instruction — always takes precedence. Honor it above all else. If users asks to add some elements, intelligently add it, even if it is not present in the template
2. Job Description — tailor all content to align with the role.
3. Defaults below — follow when user has not specified otherwise.


PRESERVATION RULE:
Everything present in the resume matters to the candidate. Preserve all entries
(every job, every education, every project, every publication) unless the user
explicitly asks to remove something. Do not silently drop entries.

PRIOR RESUME RULE:
If a prior .tex resume is provided, extract its content and use it as your base.
Apply the user instruction and job description on top of it.
Only fall back to raw resume data if the prior .tex is missing or clearly incomplete.

=== HEADER ===
Include: name, email, phone, LinkedIn URL (label "LinkedIn"), portfolio/website URL
(label "Portfolio" — omit if unavailable).
Use \LARGE\textbf{} for name, \hfill for right-alignment, \href{}{} for links.

=== PERSONAL SUMMARY ===
One sentence, tailored to the role, grounded in the resume, at most 230 characters.
Do not end with a period.
Use \section*{Professional Summary}.

=== SKILLS ===
Skills that best match the job description, grouped by domain.
Use only skills supported by the resume or READMEs.
Format: "Domain: skill1, skill2 | Domain: skill3, skill4" as a single paragraph.
Use \section*{Skills}.

=== WORK EXPERIENCE ===
Every work experience entry from the resume. Preserve order.
Rewrite bullets to align with the JD — outcome-oriented, max 250 chars per bullet.
Use \section*{Work Experience}, \textbf{} for company, \textit{} for role,
\hfill for right-alignment, itemize for bullets.

=== EDUCATION ===
ALL education entries — never drop any institution.
Include institution, degree, duration, coursework.
Use \section*{Education}.

=== PROJECTS ===
1 to 5 projects most aligned to the JD, from resume and READMEs. Prefer 3.
Bullets: 190–250 chars, 2–3 per project.
Use \section*{Professional Projects}.

=== PUBLICATIONS ===
ALL publications or research from the resume. Omit section if none.
Use a bullet list. Each entry on one line in this format:
  Authors, "Title", Venue, Year
- Bold the candidate's name in the author list using \textbf{}
- Hyperlink the title with \href{}{} if a URL is available
- Append "(submitted)" if not yet published
- Append "-- Received Best Paper Award" or similar note if applicable
Use \section*{Publications}.

=== CERTIFICATIONS ===
Awards, certifications, and other notable items not covered above. Omit if none.
Use a \section*{} with an appropriate title.

=== ACHIEVEMENTS ===
Awards, Publications and other notable items not covered above. Omit if none.
Use a \section*{} with an appropriate title.

=== SECTION ORDER ===
Default: Personal Summary → Skills → Work Experience → Education → Projects → Certifications → Publications →Achievements
Reorder based on what best highlights the candidate for this specific JD.
For example: if the role is research-heavy, move Publications higher up.
If new grad, move Projects before Experience and keep eudcation on top.
Omit any section with no content. However you should always make sure that either Work Experience or Education should follow after skills.
```

---

## Human Prompt

```
Resume:
{resume}

Job Description:
{jd}

GitHub Project READMEs:
{readmes}

Prior Tailored Resume (.tex):
{rendered_tex}

User Instruction:
{user_prompt}

Prior Session Context:
{context}

LaTeX Template (use as structural and stylistic reference):
{template}
```

---

## Template Variable: {template}

This is the contents of `meta-data/resume-template.tex` — a sanitized version
of the original resume with all personal data replaced by placeholders.
Passed verbatim so Gemini understands the exact packages, macros, section
formatting, and style to follow. It is purely a structural reference — no real
candidate data, no real URLs, no real names.

---

## Code Changes Required

### 1. `app/ai.py`
- Replace `generate_resume()` (returns JSON) with `generate_resume_latex()` (returns .tex string)
- Load new prompts: `generation_latex_system.txt` + `generation_latex_human.txt`
- No `JsonOutputParser` — raw string output
- Strip ``` fences if present (same pattern as `edit_resume_tex`)
- Load template content once at module level from `meta-data/resume-template.tex`

### 2. `app/routes.py` (full pipeline path)
- Replace:
  ```python
  resume_json = generate_resume(...)
  render_and_upload(user_id, draft_id, resume_json)
  ```
- With:
  ```python
  tex = generate_resume_latex(...)
  upload_rendered_resume(user_id, draft_id, tex)
  compile_and_upload_pdf(user_id, draft_id, tex)
  ```

### 3. `app/renderer.py`
- Remove `render_resume_latex()` — no longer needed
- Remove `_latex_escape`, `_make_env`, `_SECTION_TEMPLATE_MAP`, `_DEFAULT_ORDER`
- Keep `compile_latex()`, `compile_and_upload_pdf()`, `render_and_upload()` (simplified)
- `render_and_upload` now just calls `compile_latex` + uploads, no Jinja2

### 4. `app/prompts/`
- Add `generation_latex_system.txt`
- Add `generation_latex_human.txt`
- Keep old `generation_system.txt` + `generation_human.txt` until verified working

### 5. `app/latex_templates/` + `app/templates/`
- Can be deleted once verified working (Jinja2 templates no longer needed)

### 6. `generation_human.txt`
- Update `Prior Rendered Resume (HTML):` label → `Prior Tailored Resume (.tex):`
  (the variable is already renamed to `rendered_tex` in routes.py)

---

## What Gemini Gets For {template}

The full content of `sample-tex-resume.tex` — preamble, packages, custom
commands, and a complete filled-in example resume. This gives Gemini:
- Exact package list to use
- \titleformat, \setlist, \definecolor settings
- The \LARGE\textbf name + \hfill contact pattern
- \section* + \titlerule formatting
- itemize bullet style
- \vspace{4pt} spacing between entries

Gemini uses this as a style guide, not a fill-in-the-blank template.

---

## Key Advantages Over Current Approach

| Current (Jinja2) | New (Gemini renders LaTeX) |
|---|---|
| Fixed section layout | Gemini reorders sections per JD |
| Rigid per-section templates | Gemini adapts spacing/layout |
| latex_escape filter required | Gemini handles escaping |
| JSON schema must match templates exactly | No schema — free-form output |
| New section type = new template file | Just describe it in the prompt |
| Jinja2 can't make formatting decisions | Gemini decides bold/italic/spacing |
```
