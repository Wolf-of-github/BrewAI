terraform {
  required_version = ">= 1.5"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }
  # Local state — migrate to GCS backend when ready
}

provider "google" {
  project = var.project_id
  region  = var.region
}

# ─── Enable APIs ────────────────────────────────────────────────────────────────

locals {
  apis = [
    "run.googleapis.com",
    "cloudtasks.googleapis.com",
    "redis.googleapis.com",
    "artifactregistry.googleapis.com",
    "compute.googleapis.com",
    "iam.googleapis.com",
    "firestore.googleapis.com",
  ]
}

resource "google_project_service" "apis" {
  for_each                   = toset(local.apis)
  service                    = each.value
  disable_on_destroy         = false
  disable_dependent_services = false
}

# ─── Service Account ────────────────────────────────────────────────────────────

resource "google_service_account" "app" {
  account_id   = "${var.service_name}-sa"
  display_name = "Generative AI Service SA"
  depends_on   = [google_project_service.apis]
}

# Allow Cloud Tasks to invoke the Cloud Run service as this SA
resource "google_project_iam_member" "run_invoker" {
  project = var.project_id
  role    = "roles/run.invoker"
  member  = "serviceAccount:${google_service_account.app.email}"
}

# ─── Artifact Registry ──────────────────────────────────────────────────────────

resource "google_artifact_registry_repository" "repo" {
  repository_id = var.service_name
  location      = var.region
  format        = "DOCKER"
  description   = "Docker images for ${var.service_name}"
  depends_on    = [google_project_service.apis]
}

# Allow the SA to push/pull images
resource "google_artifact_registry_repository_iam_member" "sa_writer" {
  repository = google_artifact_registry_repository.repo.name
  location   = var.region
  role       = "roles/artifactregistry.writer"
  member     = "serviceAccount:${google_service_account.app.email}"
}

# ─── VPC & Subnet (for Direct VPC Egress) ───────────────────────────────────────

resource "google_compute_network" "vpc" {
  name                    = "${var.service_name}-vpc"
  auto_create_subnetworks = false
  depends_on              = [google_project_service.apis]
}

resource "google_compute_subnetwork" "subnet" {
  name          = "${var.service_name}-subnet"
  ip_cidr_range = "10.10.0.0/24"
  region        = var.region
  network       = google_compute_network.vpc.id
}

# ─── Redis (Memorystore) ─────────────────────────────────────────────────────────

resource "google_redis_instance" "cache" {
  name               = "${var.service_name}-redis"
  tier               = "BASIC"
  memory_size_gb     = 1
  region             = var.region
  authorized_network = google_compute_network.vpc.id
  redis_version      = "REDIS_7_0"
  display_name       = "Generative AI Service Cache"
  depends_on         = [google_project_service.apis]
}

# ─── Cloud Run ───────────────────────────────────────────────────────────────────

resource "google_cloud_run_v2_service" "app" {
  name     = var.service_name
  location = var.region
  ingress  = "INGRESS_TRAFFIC_INTERNAL_ONLY"

  template {
    service_account = google_service_account.app.email
    timeout         = "600s"  # 10 minutes per attempt, 3 retries = 30 min total

    vpc_access {
      network_interfaces {
        network    = google_compute_network.vpc.name
        subnetwork = google_compute_subnetwork.subnet.name
      }
      egress = "PRIVATE_RANGES_ONLY"
    }

    containers {
      image = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.repo.repository_id}/${var.service_name}:${var.image_tag}"

      env {
        name  = "GCP_PROJECT"
        value = var.project_id
      }
      env {
        name  = "GCS_BUCKET"
        value = var.gcs_bucket
      }
      env {
        name  = "REDIS_HOST"
        value = google_redis_instance.cache.host
      }
      env {
        name  = "REDIS_PORT"
        value = "6379"
      }

      ports {
        container_port = 8080
      }

      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
      }
    }
  }

  depends_on = [
    google_project_service.apis,
    google_artifact_registry_repository.repo,
    google_compute_subnetwork.subnet,
    google_redis_instance.cache,
  ]
}

# ─── Cloud Tasks Queue ───────────────────────────────────────────────────────────

resource "google_cloud_tasks_queue" "generate" {
  name     = "${var.service_name}-generate"
  location = var.region

  rate_limits {
    max_dispatches_per_second = 10
    max_concurrent_dispatches = 5
  }

  retry_config {
    max_attempts       = 3
    max_retry_duration = "1800s"  # 30 min total retry window
    min_backoff        = "10s"
    max_backoff        = "300s"
    max_doublings      = 3
  }

  depends_on = [
    google_project_service.apis,
    google_cloud_run_v2_service.app,
  ]
}

# ─── Firestore ───────────────────────────────────────────────────────────────────

resource "google_firestore_database" "db" {
  name        = "(default)"
  location_id = var.region
  type        = "FIRESTORE_NATIVE"
  depends_on  = [google_project_service.apis]
}

# TTL policy on the jobs collection — auto-delete docs after 1 day
resource "google_firestore_field" "jobs_ttl" {
  database   = google_firestore_database.db.name
  collection = "generative-ai-service-data"
  field      = "expires_at"

  ttl_config {}
}

resource "google_project_iam_member" "firestore_writer" {
  project = var.project_id
  role    = "roles/datastore.user"
  member  = "serviceAccount:${google_service_account.app.email}"
}

# ─── GCS ─────────────────────────────────────────────────────────────────────────

resource "google_storage_bucket_iam_member" "gcs_access" {
  bucket = var.gcs_bucket
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.app.email}"
}
