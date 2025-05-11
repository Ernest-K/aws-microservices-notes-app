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
  # W AWS Academy często hasła muszą spełniać określone kryteria, np. brak znaków specjalnych
  # Dla celów testowych, możesz ustawić proste hasło, ale pamiętaj o bezpieczeństwie.
  # Upewnij się, że to hasło jest zgodne z polityką AWS Academy, jeśli taka istnieje.
  default = "YourStrongPassword123" # ZMIEŃ TO!
}

variable "aws_access_key_id" {
  description = "AWS Access Key ID"
  type        = string
  default     = "" # Powinno być ustawione przez zmienną środowiskową TF_VAR_aws_access_key_id
}

variable "aws_secret_access_key" {
  description = "AWS Secret Access Key"
  type        = string
  sensitive   = true
  default     = "" # Powinno być ustawione przez zmienną środowiskową TF_VAR_aws_secret_access_key
}

variable "aws_session_token" {
  description = "AWS Session Token"
  type        = string
  sensitive   = true
  default     = "" # Powinno być ustawione przez zmienną środowiskową TF_VAR_aws_session_token
}

# --- Docker Image URIs (Będziesz musiał je zaktualizować po zbudowaniu i wypchnięciu obrazów do ECR) ---
# Przykład: "ACCOUNT_ID.dkr.ecr.REGION.amazonaws.com/notes-app-frontend:latest"

variable "frontend_image_uri" {
  description = "Docker image URI for the frontend"
  default     = "264019/microservies-notes-app-frontend:latest" # Zaktualizuj po pushu do ECR
}

variable "api_gateway_image_uri" {
  description = "Docker image URI for the API Gateway service"
  default     = "264019/microservies-notes-app-api-gateway-v3:latest" # Zaktualizuj po pushu do ECR
}

variable "auth_service_image_uri" {
  description = "Docker image URI for the Auth service"
  default     = "264019/microservies-notes-app-auth-service-v2:latest" # Zaktualizuj po pushu do ECR
}

variable "notes_service_image_uri" {
  description = "Docker image URI for the Notes service"
  default     = "264019/microservies-notes-app-notes-service-v2:latest" # Zaktualizuj po pushu do ECR
}

variable "files_service_image_uri" {
  description = "Docker image URI for the Files service"
  default     = "264019/microservies-notes-app-files-service-v2:latest" # Zaktualizuj po pushu do ECR
}

variable "notifications_service_image_uri" {
  description = "Docker image URI for the Notifications service"
  default     = "264019/microservies-notes-app-notifications-service-v2:latest" # Zaktualizuj po pushu do ECR
}