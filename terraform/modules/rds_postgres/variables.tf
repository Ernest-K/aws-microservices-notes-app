variable "app_name" {
  description = "Base name for the application"
  type        = string
}

variable "random_suffix" {
  description = "A random string suffix for unique names"
  type        = string
}

variable "db_name" {
  description = "The name of the database to create"
  type        = string
  default     = "notesdb"
}

variable "db_username" {
  description = "Username for the RDS database"
  type        = string
}

variable "db_password" {
  description = "Password for the RDS database"
  type        = string
  sensitive   = true
}

variable "db_instance_class" {
  description = "Instance class for the RDS database"
  type        = string
  default     = "db.t3.micro"
}

variable "db_allocated_storage" {
  description = "Allocated storage for the RDS database in GB"
  type        = number
  default     = 20
}

variable "db_engine_version" {
  description = "PostgreSQL engine version"
  type        = string
  default     = "15.3" # Sprawdź najnowszą wspieraną wersję
}

variable "parameter_group_name" { # Zmieniono z test na bardziej konfigurowalne
  description = "Name of the DB parameter group to associate"
  type        = string
  default     = "default.postgres15" # Dla PostgreSQL 15.x
}

variable "publicly_accessible" {
  description = "Whether the DB instance is publicly accessible"
  type        = bool
  default     = true # Dostosuj do swoich potrzeb bezpieczeństwa
}

# Można dodać zmienne dla VPC subnets, security groups, itp. jeśli nie jest publicznie dostępny