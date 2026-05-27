# BrewAI

AI-powered resume tailoring. Paste a job description, get a professionally typeset, LaTeX-compiled PDF resume tailored to that role — in under a minute.

Users upload their resume (PDF or DOCX), optionally connect their GitHub profile, and let Gemini 2.5 Flash handle project selection, content tailoring, and LaTeX generation. Subsequent tweaks are handled surgically — only the relevant sections are rewritten.

**Live:** [brewai.us](https://brewai.us)

---

## Architecture

Six microservices on Google Cloud Run, all containerized, with async inter-service communication via Cloud Tasks.

```
Browser (React SPA — Firebase Hosting)
  │
  ├── auth-service          Node.js / Express   Google OAuth → JWT + Firebase token
  └── api-gateway-service   Node.js / Express   Authenticated REST API
        │
        ├── Cloud Tasks → resume-parser-service    Python / Flask   PDF/DOCX → resume.json
        ├── Cloud Tasks → github-reader-service    Python / Flask   GitHub repos → projects.json
        └── Cloud Tasks → generative-ai-service   Python / Flask   Gemini + LaTeX + tectonic → PDF
```

Storage: GCS (raw uploads, rendered .tex + .pdf) · Firestore (users, drafts, jobs) · Redis Memorystore (conversation context)

See [architecture.txt](architecture.txt) for the full report, data flows, and infrastructure details.

---

## Repository Structure

```
.
├── frontend-service/         React 19 + TypeScript + Vite + TailwindCSS 4
├── auth-service/             Node.js + Express — JWT auth, Firebase custom tokens
├── api-gateway-service/      Node.js + Express — public REST API surface
├── generative-ai-service/    Python + Flask — Gemini pipeline, LaTeX → PDF
├── github-reader-service/    Python + Flask — GitHub repo scanning + summarisation
├── resume-parser-service/    Python + Flask — PDF/DOCX extraction
├── infra/                    Terraform — all GCP resources
└── docs/                     Additional design docs
```

Each service is an independent subdirectory with its own `Dockerfile`, dependency file, and (for `generative-ai-service`) its own Terraform module.

---

## Prerequisites

| Tool | Version | Purpose |
|---|---|---|
| Node.js | ≥ 20 | auth-service, api-gateway-service, frontend-service |
| Python | ≥ 3.11 | generative-ai-service, resume-parser-service, github-reader-service |
| Docker | any recent | building and pushing service images |
| Terraform | ≥ 1.5 | provisioning GCP infrastructure |
| gcloud CLI | any recent | deploying to Cloud Run, auth |
| Firebase CLI | any recent | deploying the frontend |

---

## GCP & Firebase Setup

You need a GCP project and a Firebase project pointing at it.

1. **Create a GCP project.** Note the project ID.
2. **Enable Firebase** on the project at [console.firebase.google.com](https://console.firebase.google.com).
3. **Enable Google sign-in** in Firebase → Authentication → Sign-in method.
4. **Create a Firestore database** in native mode (default database).
5. **Create a GCS bucket** for resume storage and another for compiled PDF artifacts.
6. **Create a GCS bucket** for Terraform state (`<project-id>-tf-state`).
7. **Create a Google OAuth 2.0 client ID** (Web application type) in GCP → APIs & Services → Credentials.
8. **Create a GitHub OAuth App** at GitHub → Settings → Developer settings → OAuth Apps.
9. Obtain a **Gemini API key** from [aistudio.google.com](https://aistudio.google.com).
10. Obtain a **Resend API key** from [resend.com](https://resend.com) for contact form emails.
11. Obtain a **Stripe account** and note your secret key, webhook secret, and price ID.

---

## Secrets

All secrets are managed via GCP Secret Manager. Terraform provisions the secrets; you supply the values.

Copy the example file and fill in your values:

```bash
cp infra/terraform.tfvars.example infra/terraform.tfvars
```

`infra/terraform.tfvars` is gitignored — **never commit it**.

| Variable | Description |
|---|---|
| `jwt_secret` | Random hex string used to sign JWTs (e.g. `openssl rand -hex 32`) |
| `google_client_id` | Google OAuth 2.0 Web client ID |
| `github_token` | GitHub PAT with `read:user` + `repo` scopes |
| `gemini_api_key` | Google Gemini API key |
| `github_client_id` | GitHub OAuth App client ID |
| `github_client_secret` | GitHub OAuth App client secret |
| `resend_api_key` | Resend API key |

Stripe keys (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID`) are set directly as Cloud Run environment variables via the `api-gateway-service` Terraform module.

---

## Infrastructure Provisioning

```bash
cd infra
terraform init
terraform apply
```

This provisions Cloud Run services, Cloud Tasks queues, GCS buckets, Firestore, Redis Memorystore, Secret Manager secrets, service accounts, and IAM bindings.

---

## Deploying Services

Each service has a deploy script in `infra/`:

```bash
# Deploy all services
bash infra/deploy-all.sh

# Or deploy individually
bash infra/deploy-auth.sh
bash infra/deploy-api-gateway.sh
bash infra/deploy-generative-ai.sh
bash infra/deploy-github-reader.sh
bash infra/deploy-resume-parser.sh
```

Each script builds the Docker image, pushes to Artifact Registry, and runs `gcloud run deploy`.

---

## Frontend

```bash
cd frontend-service
npm install
npm run dev          # local dev server
npm run build        # production build
firebase deploy      # deploy to Firebase Hosting
```

The frontend reads `VITE_AUTH_SERVICE_URL` and `VITE_API_GATEWAY_URL` from environment variables at build time. Create a `.env.local` for local development:

```
VITE_AUTH_SERVICE_URL=http://localhost:3001
VITE_API_GATEWAY_URL=http://localhost:3000
```

---

## Local Development

Each backend service can be run locally. You will need application default credentials set up:

```bash
gcloud auth application-default login
```

**auth-service**
```bash
cd auth-service
npm install
GOOGLE_CLIENT_ID=... GCP_PROJECT_ID=... node src/index.js
```

**api-gateway-service**
```bash
cd api-gateway-service
npm install
GCP_PROJECT_ID=... GCS_BUCKET_NAME=... GENAI_SERVICE_URL=... \
GITHUB_READER_URL=... RESUME_PARSER_URL=... node src/index.js
```

**generative-ai-service**
```bash
cd generative-ai-service
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
GCP_PROJECT=... GCS_BUCKET=... REDIS_HOST=localhost python main.py
```

**resume-parser-service / github-reader-service** follow the same pattern.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, TypeScript, Vite 8, TailwindCSS 4, Firebase SDK |
| Auth | Node.js, Express, Firebase Admin SDK, jsonwebtoken |
| API Gateway | Node.js, Express, @google-cloud/{firestore,storage,tasks,secret-manager} |
| AI Pipeline | Python, Flask, LangChain, langchain-google-genai (Gemini 2.5 Flash) |
| PDF Compilation | tectonic (LaTeX engine, runs inside the generative-ai-service container) |
| Resume Parsing | pdfplumber, python-docx, Gemini |
| Caching | Redis 7 via Google Memorystore |
| Database | Google Cloud Firestore (native mode) |
| Object Storage | Google Cloud Storage |
| Task Queue | Google Cloud Tasks |
| Secrets | Google Secret Manager |
| Infra-as-Code | Terraform ≥ 1.5, hashicorp/google provider ~5.0 |
| Hosting | Firebase Hosting |
| Container Registry | Google Artifact Registry |

---

## License

MIT — see [LICENSE](LICENSE).
