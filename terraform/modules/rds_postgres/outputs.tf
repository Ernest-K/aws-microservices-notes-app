output "db_instance_endpoint" {
  description = "The connection endpoint for the database instance"
  value       = aws_db_instance.this.endpoint
}

output "db_instance_address" {
  description = "The address of the database instance"
  value       = aws_db_instance.this.address
}

output "db_instance_port" {
  description = "The port of the database instance"
  value       = aws_db_instance.this.port
}

output "db_instance_name" {
  description = "The name of the database in the instance"
  value       = aws_db_instance.this.db_name # Zwraca db_name podane przy tworzeniu
}