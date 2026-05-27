# ── Firestore Database ────────────────────────────────────────────────────────

resource "google_firestore_database" "db" {
  name        = "(default)"
  location_id = var.region
  project     = var.project_id
  type        = "FIRESTORE_NATIVE"
}

# ── TTL Policies ──────────────────────────────────────────────────────────────

# Auto-expire refresh tokens after 7 days
resource "google_firestore_field" "refresh_tokens_ttl" {
  database   = google_firestore_database.db.name
  collection = "refreshTokens"
  field      = "expiresAt"
  project    = var.project_id

  ttl_config {}
}

# Auto-expire gen-ai job docs after 1 day
resource "google_firestore_field" "genai_jobs_ttl" {
  database   = google_firestore_database.db.name
  collection = "generative-ai-service-data"
  field      = "expires_at"
  project    = var.project_id

  ttl_config {}
}
