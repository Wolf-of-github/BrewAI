output "auth_service_url" {
  description = "Public URL of the auth service"
  value       = module.auth_service.url
}

output "auth_service_repo" {
  description = "Artifact Registry repo for auth-service images"
  value       = module.auth_service.artifact_registry_repo
}

output "resume_parser_url" {
  description = "Internal URL of the resume parser service"
  value       = module.resume_parser_service.url
}

output "resume_parser_repo" {
  description = "Artifact Registry repo for resume-parser-service images"
  value       = module.resume_parser_service.artifact_registry_repo
}

output "github_reader_url" {
  description = "Internal URL of the github reader service"
  value       = module.github_reader_service.url
}

output "github_reader_repo" {
  description = "Artifact Registry repo for github-reader-service images"
  value       = module.github_reader_service.artifact_registry_repo
}

output "generative_ai_url" {
  description = "Internal URL of the generative AI service"
  value       = module.generative_ai_service.url
}

output "generative_ai_repo" {
  description = "Artifact Registry repo for generative-ai-service images"
  value       = module.generative_ai_service.artifact_registry_repo
}

output "cloud_tasks_queue" {
  description = "Cloud Tasks queue name for generative AI jobs"
  value       = module.generative_ai_service.cloud_tasks_queue
}

output "api_gateway_url" {
  description = "Public URL of the api-gateway-service"
  value       = module.api_gateway_service.url
}

output "api_gateway_repo" {
  description = "Artifact Registry repo for api-gateway-service images"
  value       = module.api_gateway_service.artifact_registry_repo
}
