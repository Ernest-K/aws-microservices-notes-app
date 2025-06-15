variable "table_name_prefix" {
  description = "Prefix for the DynamoDB table name"
  type        = string
}

variable "random_suffix" {
  description = "A random string suffix for unique names"
  type        = string
}

variable "billing_mode" {
  description = "Billing mode for the table (PROVISIONED or PAY_PER_REQUEST)"
  type        = string
  default     = "PAY_PER_REQUEST"
}

variable "hash_key_name" {
  description = "Name of the hash key (partition key) attribute"
  type        = string
}

variable "hash_key_type" {
  description = "Type of the hash key attribute (S, N, or B)"
  type        = string
  default     = "S"
}

variable "range_key_name" {
  description = "Name of the range key (sort key) attribute (optional)"
  type        = string
  default     = null
}

variable "range_key_type" {
  description = "Type of the range key attribute (S, N, or B)"
  type        = string
  default     = "S"
}

variable "attributes" {
  description = "List of attribute definitions for keys and indexes"
  type = list(object({
    name = string
    type = string
  }))
}

# Można dodać zmienne dla GSI, LSI, stream_specification itp.