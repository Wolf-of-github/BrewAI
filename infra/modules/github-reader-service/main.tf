# ── Artifact Registry ──────────────────────────────────────────────────────────

resource "google_artifact_registry_repository" "repo" {
  repository_id = "github-reader-service"
  location      = var.region
  format        = "DOCKER"
  project       = var.project_id
}

# ── Service Account ────────────────────────────────────────────────────────────

resource "google_service_account" "sa" {
  account_id   = "github-reader-sa"
  display_name = "GitHub Reader Service SA"
  project      = var.project_id
}

# ── IAM — Firestore ────────────────────────────────────────────────────────────

resource "google_project_iam_member" "firestore" {
  project = var.project_id
  role    = "roles/datastore.user"
  member  = "serviceAccount:${google_service_account.sa.email}"
}

# ── IAM — GCS ─────────────────────────────────────────────────────────────────

resource "google_storage_bucket_iam_member" "gcs" {
  bucket = var.bucket_name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.sa.email}"
}

# ── IAM — Secret Manager ───────────────────────────────────────────────────────

resource "google_secret_manager_secret_iam_member" "github_token" {
  secret_id = var.secret_ids["github_token"]
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.sa.email}"
}

resource "google_secret_manager_secret_iam_member" "gemini_api_key" {
  secret_id = var.secret_ids["gemini_api_key"]
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.sa.email}"
}

# ── Cloud Run ──────────────────────────────────────────────────────────────────

resource "google_cloud_run_v2_service" "app" {
  name     = "github-reader-service"
  location = var.region
  project  = var.project_id
  ingress  = "INGRESS_TRAFFIC_INTERNAL_ONLY"

  template {
    service_account = google_service_account.sa.email
    timeout         = "300s"

    scaling {
      min_instance_count = 0
      max_instance_count = 5
    }

    containers {
      image = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.repo.repository_id}/github-reader-service:${var.image_tag}"

      env {
        name  = "GCS_BUCKET_NAME"
        value = var.bucket_name
      }
      env {
        name = "GITHUB_TOKEN"
        value_source {
          secret_key_ref {
            secret  = var.secret_ids["github_token"]
            version = "latest"
          }
        }
      }
      env {
        name = "gemini_api_key"
        value_source {
          secret_key_ref {
            secret  = var.secret_ids["gemini_api_key"]
            version = "latest"
          }
        }
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
    google_service_account.sa,
  ]
}

# ── IAM — Allow api-gateway SA (Cloud Tasks OIDC identity) to invoke ──────────

resource "google_cloud_run_v2_service_iam_member" "gateway_invoker" {
  project  = var.project_id
  location = var.region
  name     = google_cloud_run_v2_service.app.name
  role     = "roles/run.invoker"
  member   = "serviceAccount:${var.api_gateway_sa_email}"
}

# ── Cloud Tasks Queue ──────────────────────────────────────────────────────────

resource "google_cloud_tasks_queue" "process" {
  name     = "github-reader-service-process"
  location = var.region
  project  = var.project_id

  rate_limits {
    max_dispatches_per_second = 10
    max_concurrent_dispatches = 5
  }

  retry_config {
    max_attempts       = 3
    max_retry_duration = "600s"
    min_backoff        = "10s"
    max_backoff        = "120s"
    max_doublings      = 3
  }

  depends_on = [google_cloud_run_v2_service.app]
}
