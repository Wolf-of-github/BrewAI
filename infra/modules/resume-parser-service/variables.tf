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
  description = "GCS bucket name for resumes and parsed output"
  type        = string
}

variable "secret_ids" {
  description = "Map of secret name → Secret Manager resource ID (from secrets module)"
  type        = map(string)
}

variable "api_gateway_sa_email" {
  description = "Service account email of the api-gateway, granted run.invoker on this service"
  type        = string
}


