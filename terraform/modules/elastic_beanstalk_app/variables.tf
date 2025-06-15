variable "app_name" {
  description = "Base name for the application"
  type        = string
}

variable "random_suffix" {
  description = "A random string suffix for unique names"
  type        = string
}

variable "frontend_image_uri" {
  description = "Docker image URI for the frontend (from Docker Hub or ECR)"
  type        = string
}

variable "s3_bucket_for_eb_versions_id" {
  description = "ID of the S3 bucket to store Elastic Beanstalk application versions"
  type        = string
}

variable "eb_solution_stack_name" {
  description = "The solution stack name for the Elastic Beanstalk environment"
  type        = string
  default     = "64bit Amazon Linux 2023 v4.5.0 running Docker" # Sprawdź aktualną nazwę
}

variable "eb_iam_instance_profile_name" {
  description = "Name of the IAM instance profile for Elastic Beanstalk EC2 instances"
  type        = string
}

variable "vite_api_url_for_frontend" {
  description = "The VITE_API_URL environment variable for the frontend application"
  type        = string
}