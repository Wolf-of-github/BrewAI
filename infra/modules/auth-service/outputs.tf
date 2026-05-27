output "url" {
  description = "Public Cloud Run URL of the auth service"
  value       = google_cloud_run_v2_service.app.uri
}

output "sa_email" {
  description = "Service account email"
  value       = google_service_account.sa.email
}

output "artifact_registry_repo" {
  description = "Artifact Registry repo URL for pushing images"
  value       = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.repo.repository_id}"
}
