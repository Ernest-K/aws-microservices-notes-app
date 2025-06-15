variable "topic_name_prefix" {
  description = "Prefix for the SNS topic name"
  type        = string
}

variable "random_suffix" {
  description = "A random string suffix for unique names"
  type        = string
}

variable "subscription_protocol" {
  description = "Protocol for the SNS subscription (e.g., email, sqs, lambda)"
  type        = string
  default     = null # Opcjonalna subskrypcja
}

variable "subscription_endpoint" {
  description = "Endpoint for the SNS subscription"
  type        = string
  default     = null # Opcjonalna subskrypcja
}