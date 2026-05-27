# ── Artifact Registry ──────────────────────────────────────────────────────────

resource "google_artifact_registry_repository" "repo" {
  repository_id = "api-gateway-service"
  location      = var.region
  format        = "DOCKER"
  project       = var.project_id
}

# ── Service Account ────────────────────────────────────────────────────────────

resource "google_service_account" "sa" {
  account_id   = "api-gateway-service-sa"
  display_name = "API Gateway Service SA"
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

# ── IAM — Secret Manager ──────────────────────────────────────────────────────

resource "google_secret_manager_secret_iam_member" "jwt_secret" {
  secret_id = var.secret_ids["jwt_secret"]
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.sa.email}"
}

resource "google_secret_manager_secret_iam_member" "github_client_id" {
  secret_id = var.secret_ids["github_client_id"]
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.sa.email}"
}

resource "google_secret_manager_secret_iam_member" "github_client_secret" {
  secret_id = var.secret_ids["github_client_secret"]
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.sa.email}"
}

resource "google_secret_manager_secret_iam_member" "resend_api_key" {
  secret_id = var.secret_ids["resend_api_key"]
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.sa.email}"
}

# ── IAM — Cloud Tasks (enqueue to any queue in project) ────────────────────────

resource "google_project_iam_member" "tasks_enqueuer" {
  project = var.project_id
  role    = "roles/cloudtasks.enqueuer"
  member  = "serviceAccount:${google_service_account.sa.email}"
}

# ── IAM — Allow SA to generate OIDC tokens for Cloud Tasks HTTP targets ─────────

resource "google_service_account_iam_member" "self_token_creator" {
  service_account_id = google_service_account.sa.name
  role               = "roles/iam.serviceAccountTokenCreator"
  member             = "serviceAccount:${google_service_account.sa.email}"
}

resource "google_service_account_iam_member" "self_account_user" {
  service_account_id = google_service_account.sa.name
  role               = "roles/iam.serviceAccountUser"
  member             = "serviceAccount:${google_service_account.sa.email}"
}

# ── Cloud Run ──────────────────────────────────────────────────────────────────

resource "google_cloud_run_v2_service" "app" {
  name     = "api-gateway-service"
  location = var.region
  project  = var.project_id
  ingress  = "INGRESS_TRAFFIC_ALL"

  template {
    service_account = google_service_account.sa.email

    scaling {
      min_instance_count = 0
      max_instance_count = 10
    }

    containers {
      image = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.repo.repository_id}/api-gateway-service:${var.image_tag}"

      env {
        name  = "NODE_ENV"
        value = "production"
      }
      env {
        name  = "GCP_PROJECT_ID"
        value = var.project_id
      }
      env {
        name  = "GCS_BUCKET_NAME"
        value = var.bucket_name
      }
      env {
        name  = "ARTIFACTS_BUCKET_NAME"
        value = var.bucket_name
      }
      env {
        name  = "GENAI_SERVICE_URL"
        value = var.genai_service_url
      }
      env {
        name  = "GITHUB_READER_URL"
        value = var.github_reader_url
      }
      env {
        name  = "RESUME_PARSER_URL"
        value = var.resume_parser_url
      }
      env {
        name  = "RESUME_PARSER_TASKS_QUEUE"
        value = var.resume_parser_tasks_queue
      }
      env {
        name  = "GITHUB_READER_TASKS_QUEUE"
        value = var.github_reader_tasks_queue
      }
      env {
        name  = "CLOUD_TASKS_QUEUE"
        value = var.cloud_tasks_queue
      }
      env {
        name  = "CLOUD_TASKS_LOCATION"
        value = var.region
      }
      env {
        name  = "ALLOWED_ORIGINS"
        value = var.allowed_origins
      }
      env {
        name = "GITHUB_CLIENT_ID"
        value_source {
          secret_key_ref {
            secret  = var.secret_ids["github_client_id"]
            version = "latest"
          }
        }
      }
      env {
        name = "GITHUB_CLIENT_SECRET"
        value_source {
          secret_key_ref {
            secret  = var.secret_ids["github_client_secret"]
            version = "latest"
          }
        }
      }
      env {
        name = "RESEND_API_KEY"
        value_source {
          secret_key_ref {
            secret  = var.secret_ids["resend_api_key"]
            version = "latest"
          }
        }
      }

      ports {
        container_port = 3000
      }

      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
      }
    }
  }

  lifecycle {
    ignore_changes = [
      template[0].containers[0].image,
      client,
      client_version,
    ]
  }

  depends_on = [
    google_artifact_registry_repository.repo,
    google_service_account.sa,
  ]
}

# ── Allow unauthenticated (public) invocations ─────────────────────────────────

resource "google_cloud_run_v2_service_iam_member" "public" {
  project  = var.project_id
  location = var.region
  name     = google_cloud_run_v2_service.app.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}
