resource "aws_db_instance" "app_db" {
  identifier           = "${var.app_name}-db-${random_string.suffix.result}"
  allocated_storage    = 20
  engine               = "postgres"
  engine_version       = "17.2"
  instance_class       = "db.t3.micro"
  db_name              = "notesdb"
  username             = var.db_username
  password             = var.db_password
  parameter_group_name = "test"
  skip_final_snapshot  = true
  publicly_accessible  = true
}

# DynamoDB Tables
resource "aws_dynamodb_table" "files_metadata_table" {
  name         = "${var.app_name}-files-metadata-${random_string.suffix.result}"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "userId"
  range_key    = "fileId"

  attribute {
    name = "userId"
    type = "S"
  }
  attribute {
    name = "fileId"
    type = "S"
  }
}

resource "aws_dynamodb_table" "notifications_history_table" {
  name         = "${var.app_name}-notifications-history-${random_string.suffix.result}"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "recipientUserId"
  range_key    = "notificationId"

  attribute {
    name = "recipientUserId"
    type = "S"
  }
  attribute {
    name = "notificationId"
    type = "S"
  }
}
