# ── GCS Bucket ────────────────────────────────────────────────────────────────
# Single bucket for all services: raw resumes, parsed JSON,
# rendered HTML resumes, github project summaries.

resource "google_storage_bucket" "main" {
  name                        = "brewai-497502-artifacts"
  location                    = "US"
  project                     = var.project_id
  uniform_bucket_level_access = true
  force_destroy               = false

  versioning {
    enabled = true
  }
}
