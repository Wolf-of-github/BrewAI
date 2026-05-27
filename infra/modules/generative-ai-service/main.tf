
# ── Artifact Registry ──────────────────────────────────────────────────────────

resource "google_artifact_registry_repository" "repo" {
  repository_id = "generative-ai-service"
  location      = var.region
  format        = "DOCKER"
  project       = var.project_id
}

# ── Service Account ────────────────────────────────────────────────────────────

resource "google_service_account" "sa" {
  account_id   = "generative-ai-service-sa"
  display_name = "Generative AI Service SA"
  project      = var.project_id
}

# Allow gateway SA to invoke this service via Cloud Tasks
resource "google_cloud_run_v2_service_iam_member" "gateway_invoker" {
  project  = var.project_id
  location = var.region
  name     = google_cloud_run_v2_service.app.name
  role     = "roles/run.invoker"
  member   = "serviceAccount:${var.api_gateway_sa_email}"
}

# ── IAM — Firestore ────────────────────────────────────────────────────────────

resource "google_project_iam_member" "firestore" {
  project = var.project_id
  role    = "roles/datastore.user"
  member  = "serviceAccount:${google_service_account.sa.email}"
}

# ── IAM — Secret Manager ──────────────────────────────────────────────────────

resource "google_secret_manager_secret_iam_member" "gemini_api_key" {
  secret_id = var.secret_ids["gemini_api_key"]
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.sa.email}"
}

resource "google_secret_manager_secret_iam_member" "github_token" {
  secret_id = var.secret_ids["github_token"]
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.sa.email}"
}

# ── IAM — GCS ─────────────────────────────────────────────────────────────────

resource "google_storage_bucket_iam_member" "gcs" {
  bucket = var.bucket_name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.sa.email}"
}

# ── VPC + Subnet (required for Redis private connectivity) ────────────────────

resource "google_compute_network" "vpc" {
  name                    = "generative-ai-service-vpc"
  auto_create_subnetworks = false
  project                 = var.project_id
}

resource "google_compute_subnetwork" "subnet" {
  name          = "generative-ai-service-subnet"
  ip_cidr_range = "10.10.0.0/24"
  region        = var.region
  network       = google_compute_network.vpc.id
  project       = var.project_id
}

# ── Redis (Memorystore) ────────────────────────────────────────────────────────

resource "google_redis_instance" "cache" {
  name               = "generative-ai-service-redis"
  tier               = "BASIC"
  memory_size_gb     = 1
  region             = var.region
  project            = var.project_id
  authorized_network = google_compute_network.vpc.id
  redis_version      = "REDIS_7_0"
}

# ── Cloud Tasks Queue ──────────────────────────────────────────────────────────

resource "google_cloud_tasks_queue" "generate" {
  name     = "generative-ai-service-generate"
  location = var.region
  project  = var.project_id

  rate_limits {
    max_dispatches_per_second = 10
    max_concurrent_dispatches = 5
  }

  retry_config {
    max_attempts       = 3
    max_retry_duration = "1800s"
    min_backoff        = "10s"
    max_backoff        = "300s"
    max_doublings      = 3
  }

  depends_on = [google_cloud_run_v2_service.app]
}

# ── Cloud Run ──────────────────────────────────────────────────────────────────

resource "google_cloud_run_v2_service" "app" {
  name     = "generative-ai-service"
  location = var.region
  project  = var.project_id
  ingress  = "INGRESS_TRAFFIC_INTERNAL_ONLY"

  template {
    service_account = google_service_account.sa.email
    timeout         = "600s"

    scaling {
      min_instance_count = 0
      max_instance_count = 5
    }

    vpc_access {
      network_interfaces {
        network    = google_compute_network.vpc.name
        subnetwork = google_compute_subnetwork.subnet.name
      }
      egress = "PRIVATE_RANGES_ONLY"
    }

    containers {
      image = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.repo.repository_id}/generative-ai-service:${var.image_tag}"

      env {
        name  = "GCP_PROJECT"
        value = var.project_id
      }
      env {
        name  = "GCS_BUCKET"
        value = var.bucket_name
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
    google_artifact_registry_repository.repo,
    google_compute_subnetwork.subnet,
    google_redis_instance.cache,
  ]
}
