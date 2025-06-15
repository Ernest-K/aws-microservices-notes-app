variable "app_name" {
  description = "Base name for the application"
  type        = string
}

variable "vpc_id" {
  description = "ID of the VPC where the ALB will be deployed"
  type        = string
}

variable "subnet_ids" {
  description = "List of subnet IDs for the ALB"
  type        = list(string)
}

variable "random_suffix" {
  description = "A random string suffix for unique names"
  type        = string
}