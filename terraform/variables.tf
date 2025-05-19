variable "aws_region" {
  description = "AWS region"
  default     = "us-east-1"
}

variable "app_name" {
  description = "Base name for the application and its resources"
  default     = "notes-app"
}

variable "db_username" {
  description = "Username for RDS database"
  default     = "dbadmin"
}

variable "db_password" {
  description = "Password for RDS database"
  sensitive   = true

  default = "YourStrongPassword123"
}

variable "sns_subscription_email" {
  description = "Email for sns topic subscription"
  default     = "264019@student.pwr.edu.pl"
}

variable "aws_access_key_id" {
  description = "AWS Access Key ID"
  type        = string
  default     = ""
}

variable "aws_secret_access_key" {
  description = "AWS Secret Access Key"
  type        = string
  sensitive   = true
  default     = ""
}

variable "aws_session_token" {
  description = "AWS Session Token"
  type        = string
  sensitive   = true
  default     = ""
}

variable "frontend_image_uri" {
  description = "Docker image URI for the frontend"
  default     = "264019/microservies-notes-app-frontend:latest"
}

variable "api_gateway_image_uri" {
  description = "Docker image URI for the API Gateway service"
  default     = "264019/microservies-notes-app-api-gateway-v3:latest"
}

variable "auth_service_image_uri" {
  description = "Docker image URI for the Auth service"
  default     = "264019/microservies-notes-app-auth-service-v2:latest"
}

variable "notes_service_image_uri" {
  description = "Docker image URI for the Notes service"
  default     = "264019/microservies-notes-app-notes-service-v2:latest"
}

variable "files_service_image_uri" {
  description = "Docker image URI for the Files service"
  default     = "264019/microservies-notes-app-files-service-v2:latest"
}

variable "notifications_service_image_uri" {
  description = "Docker image URI for the Notifications service"
  default     = "264019/microservies-notes-app-notifications-service-v2:latest"
}
