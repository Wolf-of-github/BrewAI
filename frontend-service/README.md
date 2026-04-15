# BrewAI — Frontend Service

React 19 + TypeScript SPA, built with Vite and Tailwind 4.2. Deployed to Firebase Hosting at `brewai-490803.web.app`.

## Stack

| Layer | Choice |
|---|---|
| Framework | React 19 + TypeScript |
| Build | Vite + Rolldown |
| Styles | Tailwind CSS 4.2 (CSS-variable theme system) |
| Routing | React Router 7 |
| Auth | Firebase Google OAuth → custom JWT (`brew_token` cookie) |
| Hosting | Firebase Hosting |
| Icons | Lucide React |
| PDF | Custom `generatePDF` client-side utility |

## Routes

| Path | Component |
|---|---|
| `/` | `Home` — landing page |
| `/dashboard` | `Dashboard` — main app (upload, tailor, view resumes) |
| `/profile` | `Profile` — account info, usage stats, billing |
| `/terms` | `Terms` — Terms of Service |
| `/privacy` | `Privacy` — Privacy Policy |

## Theme System

Dual dark/light theme via CSS variables (`var(--bg-base)`, `var(--text-primary)`, `var(--accent)`, etc.) toggled by `data-theme` attribute on `<html>`. Persisted in `localStorage`. Managed by `ThemeContext`. All components use CSS variables — no hardcoded hex colors.

## API Client

All backend calls go through `src/lib/api.ts` → `apiFetch()`, which reads the `brew_token` cookie and sets `Authorization: Bearer <token>` on every request.

Key functions:

- `uploadResume(file)` — POST multipart to `/resume/upload`
- `tailorResume(jdText, userInstructions)` — POST to `/resume/tailor`
- `listTailored()` — GET tailored resume list
- `getTailoredContent(jobId)` — GET structured resume JSON
- `recordDownload()` — POST to `/billing/record-download` (called on PDF download)
- `getBillingStatus()` — GET plan, daily counts, next billing date
- `simulateUpgrade()` / `simulateDowngrade()` — simulate plan changes without Stripe
- `createCheckoutSession()` / `createPortalSession()` — real Stripe flows (needs env vars)
- `getGithubOAuthUrl()` / `handleGithubCallback(code)` — GitHub OAuth

## Billing UI

- **Dashboard navbar** — shows plan badge (Pro gold / Free grey); Free badge opens `UpgradeModal`
- **UpgradeModal** — features list, $20/mo pricing, redirects to Stripe Checkout
- **Profile page** — Usage stats (resumes tailored, downloads, today's tailors), Plan & Billing card (current plan, next billing date, upgrade/downgrade buttons with confirmation modals)

## Dev

```bash
npm install
npm run dev        # http://localhost:5173
npm run build
npm run preview
```

## Deploy

```bash
npm run build
firebase deploy --only hosting
```
