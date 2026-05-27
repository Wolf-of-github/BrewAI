variable "project_id" {
  description = "GCP project ID"
  type        = string
  default     = "brewai-497502"
}

variable "region" {
  description = "GCP region"
  type        = string
  default     = "us-central1"
}

variable "service_name" {
  description = "Cloud Run service name"
  type        = string
  default     = "generative-ai-service"
}

variable "image_tag" {
  description = "Docker image tag to deploy"
  type        = string
  default     = "latest"
}

variable "gcs_bucket" {
  description = "GCS bucket name for user artifacts"
  type        = string
  default     = "brewai-497502-artifacts"
}
