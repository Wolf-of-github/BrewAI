output "bucket_name" {
  description = "GCS bucket name — used for both GCS_BUCKET_NAME and ARTIFACTS_BUCKET_NAME env vars"
  value       = google_storage_bucket.main.name
}
