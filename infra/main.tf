terraform {
  required_version = ">= 1.5"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }

  # State stored in GCS — bucket must exist before first `terraform init`
  backend "gcs" {
    bucket = "brewai-497502-tf-state"
    prefix = "infra"
  }
}

provider "google" {
  project = local.project_id
  region  = local.region
}

# ── Global constants ───────────────────────────────────────────────────────────

locals {
  project_id          = "brewai-497502"
  region              = "us-central1"
  firebase_project_id = "brewai-497502"

  apis = [
    "run.googleapis.com",
    "artifactregistry.googleapis.com",
    "cloudtasks.googleapis.com",
    "secretmanager.googleapis.com",
    "firestore.googleapis.com",
    "storage.googleapis.com",
    "iam.googleapis.com",
    "compute.googleapis.com",
    "redis.googleapis.com",
  ]
}

resource "google_project_service" "apis" {
  for_each                   = toset(local.apis)
  service                    = each.value
  disable_on_destroy         = false
  disable_dependent_services = false
}


resource "google_project_iam_audit_config" "storage" {
  project = local.project_id
  service = "storage.googleapis.com"

  audit_log_config {
    log_type = "DATA_READ"
  }
  audit_log_config {
    log_type = "DATA_WRITE"
  }
}

# ── Secrets ────────────────────────────────────────────────────────────────────

module "secrets" {
  source     = "./modules/secrets"
  project_id = local.project_id

  jwt_secret           = var.jwt_secret
  google_client_id     = var.google_client_id
  github_token         = var.github_token
  gemini_api_key       = var.gemini_api_key
  github_client_id     = var.github_client_id
  github_client_secret = var.github_client_secret
  resend_api_key       = var.resend_api_key

  depends_on = [google_project_service.apis]
}

# ── Storage ───────────────────────────────────────────────────────────────────

module "storage" {
  source     = "./modules/storage"
  project_id = local.project_id
  region     = local.region

  depends_on = [google_project_service.apis]
}

# ── Firestore ─────────────────────────────────────────────────────────────────

module "firestore" {
  source     = "./modules/firestore"
  project_id = local.project_id
  region     = local.region

  depends_on = [google_project_service.apis]
}

# ── Resume Parser Service ─────────────────────────────────────────────────────

module "resume_parser_service" {
  source     = "./modules/resume-parser-service"
  project_id = local.project_id
  region     = local.region

  bucket_name          = module.storage.bucket_name
  secret_ids           = module.secrets.ids
  api_gateway_sa_email = "api-gateway-service-sa@${local.project_id}.iam.gserviceaccount.com"

  depends_on = [module.secrets, module.storage, google_project_service.apis]
}

# ── GitHub Reader Service ─────────────────────────────────────────────────────

module "github_reader_service" {
  source     = "./modules/github-reader-service"
  project_id = local.project_id
  region     = local.region

  bucket_name          = module.storage.bucket_name
  secret_ids           = module.secrets.ids
  api_gateway_sa_email = "api-gateway-service-sa@${local.project_id}.iam.gserviceaccount.com"

  depends_on = [module.secrets, module.storage, google_project_service.apis]
}

# ── Generative AI Service ─────────────────────────────────────────────────────

module "generative_ai_service" {
  source     = "./modules/generative-ai-service"
  project_id = local.project_id
  region     = local.region

  bucket_name          = module.storage.bucket_name
  secret_ids           = module.secrets.ids
  api_gateway_sa_email = "api-gateway-service-sa@${local.project_id}.iam.gserviceaccount.com"

  depends_on = [module.secrets, module.storage, google_project_service.apis]
}

# ── API Gateway Service ────────────────────────────────────────────────────────

module "api_gateway_service" {
  source     = "./modules/api-gateway-service"
  project_id = local.project_id
  region     = local.region

  bucket_name                = module.storage.bucket_name
  secret_ids                 = module.secrets.ids
  genai_service_url          = module.generative_ai_service.url
  github_reader_url          = module.github_reader_service.url
  resume_parser_url          = module.resume_parser_service.url
  resume_parser_tasks_queue  = module.resume_parser_service.cloud_tasks_queue
  github_reader_tasks_queue  = module.github_reader_service.cloud_tasks_queue
  cloud_tasks_queue          = module.generative_ai_service.cloud_tasks_queue
  allowed_origins            = "https://brewai-497502.web.app,https://brewai-497502.firebaseapp.com,https://brewai.us"

  depends_on = [
    module.secrets,
    module.storage,
    module.generative_ai_service,
    module.github_reader_service,
    module.resume_parser_service,
    google_project_service.apis,
  ]
}

# ── Auth Service ───────────────────────────────────────────────────────────────

module "auth_service" {
  source     = "./modules/auth-service"
  project_id = local.project_id
  region     = local.region

  google_client_id      = var.google_client_id
  firebase_project_id   = local.firebase_project_id
  firestore_database_id = "(default)"
  secret_ids            = module.secrets.ids
  allowed_origins       = "https://brewai-497502.web.app,https://brewai-497502.firebaseapp.com,https://brewai.us"

  depends_on = [module.secrets, google_project_service.apis]
}
