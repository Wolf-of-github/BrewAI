# ── Artifact Registry ──────────────────────────────────────────────────────────

resource "google_artifact_registry_repository" "repo" {
  repository_id = "auth-service"
  location      = var.region
  format        = "DOCKER"
  project       = var.project_id
}

# ── Service Account ────────────────────────────────────────────────────────────

resource "google_service_account" "sa" {
  account_id   = "auth-service-sa"
  display_name = "Auth Service SA"
  project      = var.project_id
}

# ── IAM — Secret Manager ───────────────────────────────────────────────────────
# auth-service only needs jwt_secret and google_client_id at runtime

resource "google_secret_manager_secret_iam_member" "jwt_secret" {
  secret_id = var.secret_ids["jwt_secret"]
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.sa.email}"
}

resource "google_secret_manager_secret_iam_member" "google_client_id" {
  secret_id = var.secret_ids["google_client_id"]
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.sa.email}"
}

# ── IAM — Firestore ────────────────────────────────────────────────────────────

resource "google_project_iam_member" "firestore" {
  project = var.project_id
  role    = "roles/datastore.user"
  member  = "serviceAccount:${google_service_account.sa.email}"
}


# ── Cloud Run ──────────────────────────────────────────────────────────────────

resource "google_cloud_run_v2_service" "app" {
  name     = "auth-service"
  location = var.region
  project  = var.project_id
  ingress  = "INGRESS_TRAFFIC_ALL"

  template {
    service_account = google_service_account.sa.email

    scaling {
      min_instance_count = 1
      max_instance_count = 10
    }

    containers {
      image = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.repo.repository_id}/auth-service:${var.image_tag}"

      env {
        name  = "NODE_ENV"
        value = "production"
      }
      env {
        name  = "GCP_PROJECT_ID"
        value = var.project_id
      }
      env {
        name  = "GOOGLE_CLIENT_ID"
        value = var.google_client_id
      }
      env {
        name  = "FIRESTORE_DATABASE_ID"
        value = var.firestore_database_id
      }
      env {
        name  = "ALLOWED_ORIGINS"
        value = var.allowed_origins
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
