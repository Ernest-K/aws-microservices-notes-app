resource "aws_db_instance" "this" {
  identifier           = "${var.app_name}-db-${var.random_suffix}"
  allocated_storage    = var.db_allocated_storage
  engine               = "postgres"
  engine_version       = var.db_engine_version
  instance_class       = var.db_instance_class
  db_name              = var.db_name
  username             = var.db_username
  password             = var.db_password
  parameter_group_name = var.parameter_group_name # Użyj zmiennej
  skip_final_snapshot  = true
  publicly_accessible  = var.publicly_accessible
  # Dla produkcji:
  # multi_az                 = true
  # backup_retention_period  = 7
  # delete_automated_backups = false
  # apply_immediately        = true # lub false, zależnie od strategii
}