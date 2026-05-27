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

variable "bucket_name" {
  type = string
}

variable "secret_ids" {
  description = "Map of secret name → Secret Manager resource ID (from secrets module)"
  type        = map(string)
}

variable "genai_service_url" {
  description = "Cloud Run URL of the generative-ai-service"
  type        = string
}

variable "github_reader_url" {
  description = "Cloud Run URL of the github-reader-service"
  type        = string
}

variable "resume_parser_url" {
  description = "Cloud Run URL of the resume-parser-service"
  type        = string
}

variable "resume_parser_tasks_queue" {
  description = "Cloud Tasks queue name for resume parse jobs"
  type        = string
}

variable "github_reader_tasks_queue" {
  description = "Cloud Tasks queue name for github-reader jobs"
  type        = string
}

variable "cloud_tasks_queue" {
  description = "Cloud Tasks queue name for genai jobs"
  type        = string
}


variable "allowed_origins" {
  description = "Comma-separated list of allowed CORS origins"
  type        = string
  default     = "https://brewai-497502.web.app,https://brewai-497502.firebaseapp.com,https://brewai.us"
}
