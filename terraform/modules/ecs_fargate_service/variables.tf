variable "app_name" {
  description = "Base name for the application"
  type        = string
}

variable "service_name" {
  description = "Name of the specific microservice (e.g., api-gateway, auth-service)"
  type        = string
}

variable "image_uri" {
  description = "Docker image URI for the service"
  type        = string
}

variable "container_port" {
  description = "Port the container listens on"
  type        = number
  default     = 80
}

variable "tg_port" {
  description = "Port for the Target Group"
  type        = number
  default     = 80
}

variable "alb_path_pattern" {
  description = "Path pattern for the ALB listener rule"
  type        = string
}

variable "alb_listener_priority" {
  description = "Priority for the ALB listener rule"
  type        = number
}

variable "cpu" {
  description = "CPU units for the Fargate task"
  type        = number
  default     = 256
}

variable "memory" {
  description = "Memory in MB for the Fargate task"
  type        = number
  default     = 512
}

variable "environment_vars" {
  description = "List of environment variables for the container"
  type        = list(object({ name = string, value = string }))
  default     = []
}

variable "ecs_cluster_id" {
  description = "ID of the ECS cluster"
  type        = string
}

variable "ecs_cluster_name" {
  description = "Name of the ECS cluster" # Potrzebne dla resource_id autoskalowania
  type        = string
}

variable "vpc_id" {
  description = "ID of the VPC"
  type        = string
}

variable "subnet_ids" {
  description = "List of subnet IDs for Fargate tasks"
  type        = list(string)
}

variable "fargate_service_sg_id" {
  description = "ID of the security group for Fargate services"
  type        = string
}

variable "alb_http_listener_arn" {
  description = "ARN of the ALB HTTP listener"
  type        = string
}

variable "task_role_arn" {
  description = "ARN of the IAM role for the ECS task"
  type        = string
}

variable "execution_role_arn" {
  description = "ARN of the IAM role for ECS task execution"
  type        = string
}

variable "desired_count" {
  description = "Desired number of tasks for the service"
  type        = number
  default     = 2
}

variable "autoscaling_min_capacity" {
  description = "Minimum number of tasks for autoscaling"
  type        = number
  default     = 2
}

variable "autoscaling_max_capacity" {
  description = "Maximum number of tasks for autoscaling"
  type        = number
  default     = 4
}

variable "health_check_path" {
  description = "Path for the health check"
  type        = string
  default     = "/health"
}