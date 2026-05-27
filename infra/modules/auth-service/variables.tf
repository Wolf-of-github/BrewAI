variable "project_id" {
  type = string
}

variable "region" {
  type = string
}

variable "image_tag" {
  type    = string
  default = "latest"
}

variable "google_client_id" {
  description = "Google OAuth client ID (injected as env var — not sensitive at runtime)"
  type        = string
}

variable "firebase_project_id" {
  description = "Firebase project ID — used as token audience for ID token verification"
  type        = string
}

variable "firestore_database_id" {
  description = "Firestore database ID used by the auth service"
  type        = string
  default     = "(default)"
}

variable "allowed_origins" {
  description = "Comma-separated list of allowed CORS origins"
  type        = string
  default     = "https://brewai-497502.web.app,https://brewai-497502.firebaseapp.com,https://brewai.us"
}

variable "secret_ids" {
  description = "Map of secret name → Secret Manager resource ID (from secrets module)"
  type        = map(string)
}
