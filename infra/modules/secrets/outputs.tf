# Expose secret resource IDs so other modules can grant secretAccessor IAM.
# Usage: module.secrets.ids["jwt_secret"]

output "ids" {
  description = "Map of secret name → Secret Manager secret resource ID"
  value       = { for k, v in google_secret_manager_secret.secrets : k => v.id }
}
