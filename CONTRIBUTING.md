# Contributing to BrewAI

Thanks for your interest in contributing. This document covers how to get set up, the branching workflow, code standards, and how to submit changes.

---

## Before You Start

- Check the [open issues](../../issues) to see if your idea or bug is already being tracked.
- For significant changes (new features, architectural decisions), open an issue first to discuss the approach before writing code.
- Read [architecture.txt](architecture.txt) to understand the system before making changes that cross service boundaries.

---

## Development Setup

### 1. Fork and clone

```bash
git clone https://github.com/<your-username>/BrewAI-Prod.git
cd BrewAI-Prod
```

### 2. Set up secrets

You need real GCP credentials to run most services locally. See the [README](README.md) for the full list of required environment variables and how to provision them.

```bash
gcloud auth application-default login
cp infra/terraform.tfvars.example infra/terraform.tfvars
# Fill in your own values — never commit this file
```

### 3. Install dependencies per service

```bash
# Frontend
cd frontend-service && npm install

# Node services
cd auth-service && npm install
cd api-gateway-service && npm install

# Python services (repeat for each)
cd generative-ai-service
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
```

---

## Branching

| Branch | Purpose |
|---|---|
| `main` | Stable, production-ready code |
| `prod` | Active development / staging |
| `feat/<name>` | New features |
| `fix/<name>` | Bug fixes |
| `chore/<name>` | Dependency updates, refactors, non-functional changes |

Branch off `main` for all contributions. Target `main` in your pull request.

```bash
git checkout main
git pull origin main
git checkout -b feat/my-feature
```

---

## Making Changes

### Service boundaries

Each service in the repo (`frontend-service/`, `auth-service/`, `api-gateway-service/`, etc.) is independently deployable. Keep changes scoped to the service they belong to. Changes that touch inter-service contracts (request/response shapes, Firestore schema, GCS paths) need to be coordinated across all affected services in the same PR.

### Code style

**JavaScript / TypeScript (frontend, auth-service, api-gateway-service)**
- `'use strict'` in all Node.js files.
- `const` over `let`; no `var`.
- Error responses always return `{ error: "<message>" }` JSON.
- Required env vars are validated at startup — add any new ones to the `REQUIRED_ENV` array in `index.js`.
- Run the linter before committing: `npm run lint` (frontend).

**Python (generative-ai-service, resume-parser-service, github-reader-service)**
- Follow PEP 8.
- Use `logger = logging.getLogger(__name__)` — no bare `print()` in production paths.
- All secrets come from Secret Manager via `secrets.py` or env vars — never hardcode them.
- Use `ThreadPoolExecutor` for concurrent I/O (GCS, Gemini, Redis) inside a single request.

**Terraform (infra/)**
- All new GCP resources go in the appropriate module under `infra/modules/`.
- New secrets go in `infra/modules/secrets/` and are declared as `sensitive = true` variables in `infra/variables.tf`.
- Run `terraform fmt` and `terraform validate` before committing.

### Secrets and credentials

- **Never hardcode** API keys, tokens, or secrets anywhere in the codebase.
- **Never commit** `terraform.tfvars`, `.env`, or any file containing real credentials.
- All secrets must go through GCP Secret Manager. Access them via the existing `secrets.py` (Python) or `src/lib/secrets.js` (Node.js) helpers.

---

## Commit Messages

Use the conventional commits format:

```
<type>(<scope>): <short description>

[optional body]
```

Types: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `perf`

Scope is the service name: `frontend`, `auth`, `gateway`, `genai`, `parser`, `github-reader`, `infra`

Examples:
```
feat(gateway): add pagination to /resume/tailored/list
fix(genai): re-raise renderer exception so failed drafts surface correctly
chore(infra): add RESUME_PARSER_TASKS_QUEUE to api-gateway Cloud Run env
docs: update architecture.txt with Redis VPC details
```

---

## Pull Requests

1. **Target `main`** in your PR.
2. Fill in the PR description with:
   - What changed and why
   - How to test it
   - Any infrastructure changes that need `terraform apply`
   - Any env vars added or changed
3. Keep PRs focused — one logical change per PR. Split large changes into stacked PRs.
4. Ensure your branch is up to date with `main` before requesting review.

```bash
git fetch origin
git rebase origin/main
```

---

## Infrastructure Changes

If your PR changes Terraform:

- Run `terraform fmt` and `terraform validate` locally.
- Include the output of `terraform plan` in the PR description (redact any sensitive values).
- Note which services need to be redeployed after `terraform apply`.
- Never commit `terraform.tfstate`, `terraform.tfstate.backup`, or `.terraform/` — these are gitignored.

---

## Reporting Bugs

Open an issue with:
- Which service is affected
- Steps to reproduce
- Expected vs actual behaviour
- Relevant log output (redact any user data or credentials)

---

## Security Issues

**Do not open a public issue for security vulnerabilities.**

Instead, email the maintainer directly or use GitHub's private vulnerability reporting. Include a description of the issue, affected service, and reproduction steps. We will respond within 48 hours.

---

## Questions

Open a [GitHub Discussion](../../discussions) or file an issue tagged `question`.
