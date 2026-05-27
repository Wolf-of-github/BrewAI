variable "project_id" {
  description = "GCP project ID"
  type        = string
}

variable "jwt_secret" {
  description = "JWT signing secret"
  type        = string
  sensitive   = true
}

variable "google_client_id" {
  description = "Google OAuth client ID"
  type        = string
  sensitive   = true
}

variable "github_token" {
  description = "GitHub personal access token"
  type        = string
  sensitive   = true
}

variable "gemini_api_key" {
  description = "Gemini API key"
  type        = string
  sensitive   = true
}

variable "github_client_id" {
  description = "GitHub OAuth app client ID"
  type        = string
  sensitive   = true
}

variable "github_client_secret" {
  description = "GitHub OAuth app client secret"
  type        = string
  sensitive   = true
}

variable "resend_api_key" {
  description = "Resend API key for contact form emails"
  type        = string
  sensitive   = true
}
