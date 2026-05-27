# ── Secret Manager resources ───────────────────────────────────────────────────
#
# Each secret has two resources:
#   - google_secret_manager_secret       : creates the secret container
#   - google_secret_manager_secret_version: stores the actual value
#
# Accessed by services via Secret Manager API (lazy-loaded, in-memory cached).
# Never injected as env vars.

locals {
  secrets = {
    jwt_secret           = var.jwt_secret
    google_client_id     = var.google_client_id
    github_token         = var.github_token
    gemini_api_key       = var.gemini_api_key
    github_client_id     = var.github_client_id
    github_client_secret = var.github_client_secret
    resend_api_key       = var.resend_api_key
  }
}

resource "google_secret_manager_secret" "secrets" {
  for_each  = local.secrets
  secret_id = each.key
  project   = var.project_id

  replication {
    auto {}
  }
}

resource "google_secret_manager_secret_version" "versions" {
  for_each    = local.secrets
  secret      = google_secret_manager_secret.secrets[each.key].id
  secret_data = each.value
}
