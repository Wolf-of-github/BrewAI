output "url" {
  description = "Internal Cloud Run URL of the github reader service"
  value       = google_cloud_run_v2_service.app.uri
}

output "artifact_registry_repo" {
  description = "Artifact Registry repo URL for pushing images"
  value       = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.repo.repository_id}"
}

output "cloud_tasks_queue" {
  description = "Cloud Tasks queue name for github-reader jobs"
  value       = google_cloud_tasks_queue.process.name
}
