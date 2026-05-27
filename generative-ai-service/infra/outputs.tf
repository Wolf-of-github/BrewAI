output "cloud_run_url" {
  description = "Internal URL of the Cloud Run service"
  value       = google_cloud_run_v2_service.app.uri
}

output "artifact_registry_repo" {
  description = "Artifact Registry repository URL"
  value       = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.repo.repository_id}"
}

output "cloud_tasks_queue" {
  description = "Cloud Tasks queue name"
  value       = google_cloud_tasks_queue.generate.name
}

output "redis_host" {
  description = "Redis host (private IP)"
  value       = google_redis_instance.cache.host
}
