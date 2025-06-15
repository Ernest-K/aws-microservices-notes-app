# terraform/main.tf

# --- Podstawowa konfiguracja (z provider.tf) ---
# random_string.suffix, data.aws_caller_identity, data.aws_region,
# data.aws_vpc.default, data.aws_subnets.default
# Te zasoby `data` i `random_string` mogą pozostać w provider.tf lub przenieść do main.tf

# --- Klaster ECS ---
resource "aws_ecs_cluster" "main_cluster" {
  name = "${var.app_name}-cluster"
}

# --- Grupa Bezpieczeństwa dla serwisów Fargate ---
# Ta SG jest wspólna, więc może pozostać tutaj lub być częścią modułu "network"
resource "aws_security_group" "fargate_services_sg" {
  name        = "${var.app_name}-fargate-sg-${random_string.suffix.result}" # Dodano suffix
  description = "Allow traffic from ALB and egress to internet/VPC resources"
  vpc_id      = data.aws_vpc.default.id

  ingress {
    protocol        = "tcp"
    from_port       = 80
    to_port         = 80
    security_groups = [module.load_balancer.alb_sg_id] # Zależność od wyjścia modułu ALB
  }
  egress {
    protocol    = "-1"
    from_port   = 0
    to_port     = 0
    cidr_blocks = ["0.0.0.0/0"]
  }
}

# --- Moduł ALB ---
module "load_balancer" {
  source = "./modules/alb"

  app_name      = var.app_name
  vpc_id        = data.aws_vpc.default.id
  subnet_ids    = data.aws_subnets.default.ids
  random_suffix = random_string.suffix.result
}

# --- Moduł RDS PostgreSQL ---
module "rds_db" {
  source = "./modules/rds_postgres"

  app_name      = var.app_name
  random_suffix = random_string.suffix.result
  db_username   = var.db_username
  db_password   = var.db_password
  db_name       = "notesdb" # Możesz to zrobić zmienną modułu, jeśli chcesz
  # Możesz nadpisać inne domyślne wartości, np. instance_class, engine_version
  # parameter_group_name = aws_db_parameter_group.postgres15_custom.name # Jeśli masz custom PG
}

# --- Moduł tabeli DynamoDB dla metadanych plików ---
module "files_metadata_table" {
  source = "./modules/dynamodb_table"

  table_name_prefix = "${var.app_name}-files-metadata"
  random_suffix     = random_string.suffix.result
  hash_key_name     = "userId"
  range_key_name    = "fileId"
  attributes = [
    { name = "userId", type = "S" },
    { name = "fileId", type = "S" }
  ]
}

# --- Moduł tabeli DynamoDB dla historii notyfikacji ---
module "notifications_history_table" {
  source = "./modules/dynamodb_table"

  table_name_prefix = "${var.app_name}-notifications-history"
  random_suffix     = random_string.suffix.result
  hash_key_name     = "recipientUserId"
  range_key_name    = "notificationId"
  attributes = [
    { name = "recipientUserId", type = "S" },
    { name = "notificationId", type = "S" }
  ]
}

# --- Moduł Tematu SNS ---
module "notifications_sns" {
  source = "./modules/sns_topic"

  topic_name_prefix     = "${var.app_name}-notifications-topic"
  random_suffix         = random_string.suffix.result
  subscription_protocol = "email"
  subscription_endpoint = var.sns_subscription_email
}

# --- S3 Buckets (można zostawić tutaj lub stworzyć generyczny moduł S3) ---
# Na razie zostawiam w głównym pliku, tak jak cognito.tf
resource "aws_s3_bucket" "app_files_bucket" {
  bucket = "${var.app_name}-files-${random_string.suffix.result}"
}
# ... (reszta konfiguracji app_files_bucket: public_access_block, ownership_controls, acl) ...
# Upewnij się, że te bloki są poprawnie zdefiniowane, jeśli zostają.

resource "aws_s3_bucket" "eb_app_versions_frontend" {
  bucket = "${var.app_name}-eb-frontend-versions-${random_string.suffix.result}"
}


# --- Wywołania modułu ecs_fargate_service dla każdego mikroserwisu ---
# (Usunięto notes-service)

module "api_gateway_service" {
  source = "./modules/ecs_fargate_service"

  app_name                = var.app_name
  service_name            = "api-gateway"
  image_uri               = var.api_gateway_image_uri
  alb_path_pattern        = "/api/*"
  alb_listener_priority   = 10
  ecs_cluster_id          = aws_ecs_cluster.main_cluster.id
  ecs_cluster_name        = aws_ecs_cluster.main_cluster.name
  vpc_id                  = data.aws_vpc.default.id
  subnet_ids              = data.aws_subnets.default.ids
  fargate_service_sg_id   = aws_security_group.fargate_services_sg.id
  alb_http_listener_arn   = module.load_balancer.http_listener_arn
  task_role_arn           = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/LabRole" # Użyj zmiennej, jeśli to się zmienia
  execution_role_arn      = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/LabRole" # Użyj zmiennej

  environment_vars = [
    { name = "PORT", value = "80" },
    { name = "AWS_REGION", value = var.aws_region },
    { name = "AUTH_SERVICE_URL", value = "http://${module.load_balancer.alb_dns_name}/auth" },
    { name = "NOTES_SERVICE_URL", value = var.lambda_api_gateway_invoke_url },
    { name = "FILES_SERVICE_URL", value = "http://${module.load_balancer.alb_dns_name}/files" },
    { name = "NOTIFICATIONS_SERVICE_URL", value = "http://${module.load_balancer.alb_dns_name}/notifications" },
    { name = "AWS_ACCESS_KEY_ID", value = var.aws_access_key_id },
    { name = "AWS_SECRET_ACCESS_KEY", value = var.aws_secret_access_key },
    { name = "AWS_SESSION_TOKEN", value = var.aws_session_token },
  ]
}

module "auth_service" {
  source = "./modules/ecs_fargate_service"

  app_name                = var.app_name
  service_name            = "auth-service"
  image_uri               = var.auth_service_image_uri
  alb_path_pattern        = "/auth/*"
  alb_listener_priority   = 30
  ecs_cluster_id          = aws_ecs_cluster.main_cluster.id
  ecs_cluster_name        = aws_ecs_cluster.main_cluster.name
  vpc_id                  = data.aws_vpc.default.id
  subnet_ids              = data.aws_subnets.default.ids
  fargate_service_sg_id   = aws_security_group.fargate_services_sg.id
  alb_http_listener_arn   = module.load_balancer.http_listener_arn
  task_role_arn           = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/LabRole"
  execution_role_arn      = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/LabRole"

  environment_vars = [
    { name = "PORT", value = "80" },
    { name = "AWS_REGION", value = var.aws_region },
    { name = "COGNITO_CLIENT_ID", value = aws_cognito_user_pool_client.app_client.id }, # Zakładając, że cognito.tf jest w głównym
    { name = "AWS_ACCESS_KEY_ID", value = var.aws_access_key_id },
    { name = "AWS_SECRET_ACCESS_KEY", value = var.aws_secret_access_key },
    { name = "AWS_SESSION_TOKEN", value = var.aws_session_token },
  ]
}

module "files_service" {
  source = "./modules/ecs_fargate_service"

  app_name                = var.app_name
  service_name            = "files-service"
  image_uri               = var.files_service_image_uri
  alb_path_pattern        = "/files/*"
  alb_listener_priority   = 50
  ecs_cluster_id          = aws_ecs_cluster.main_cluster.id
  ecs_cluster_name        = aws_ecs_cluster.main_cluster.name
  vpc_id                  = data.aws_vpc.default.id
  subnet_ids              = data.aws_subnets.default.ids
  fargate_service_sg_id   = aws_security_group.fargate_services_sg.id
  alb_http_listener_arn   = module.load_balancer.http_listener_arn
  task_role_arn           = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/LabRole"
  execution_role_arn      = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/LabRole"

  environment_vars = [
    { name = "PORT", value = "80" },
    { name = "AWS_REGION", value = var.aws_region },
    { name = "AWS_S3_BUCKET_NAME", value = aws_s3_bucket.app_files_bucket.bucket }, # Zakładając, że S3 jest w głównym
    { name = "DYNAMODB_TABLE_NAME", value = module.files_metadata_table.table_name },
    { name = "AWS_ACCESS_KEY_ID", value = var.aws_access_key_id },
    { name = "AWS_SECRET_ACCESS_KEY", value = var.aws_secret_access_key },
    { name = "AWS_SESSION_TOKEN", value = var.aws_session_token },
  ]
}

module "notifications_service" {
  source = "./modules/ecs_fargate_service"

  app_name                = var.app_name
  service_name            = "notifications-service"
  image_uri               = var.notifications_service_image_uri
  alb_path_pattern        = "/notifications/*"
  alb_listener_priority   = 60
  ecs_cluster_id          = aws_ecs_cluster.main_cluster.id
  ecs_cluster_name        = aws_ecs_cluster.main_cluster.name
  vpc_id                  = data.aws_vpc.default.id
  subnet_ids              = data.aws_subnets.default.ids
  fargate_service_sg_id   = aws_security_group.fargate_services_sg.id
  alb_http_listener_arn   = module.load_balancer.http_listener_arn
  task_role_arn           = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/LabRole"
  execution_role_arn      = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/LabRole"

  environment_vars = [
    { name = "PORT", value = "80" },
    { name = "AWS_REGION", value = var.aws_region },
    { name = "AWS_SNS_TOPIC_ARN", value = module.notifications_sns.topic_arn },
    { name = "DYNAMODB_NOTIFICATIONS_TABLE_NAME", value = module.notifications_history_table.table_name },
    { name = "SQS_QUEUE_URL", value = var.sqs_notifications_queue_url },
    { name = "AWS_ACCESS_KEY_ID", value = var.aws_access_key_id },
    { name = "AWS_SECRET_ACCESS_KEY", value = var.aws_secret_access_key },
    { name = "AWS_SESSION_TOKEN", value = var.aws_session_token },
  ]
}

# --- Moduł Elastic Beanstalk dla Frontendu ---
module "frontend_app" {
  source = "./modules/elastic_beanstalk_app"

  app_name                       = var.app_name
  random_suffix                  = random_string.suffix.result
  frontend_image_uri             = var.frontend_image_uri
  s3_bucket_for_eb_versions_id   = aws_s3_bucket.eb_app_versions_frontend.id # Zakładając, że S3 jest w głównym
  eb_iam_instance_profile_name   = "LabInstanceProfile" # Użyj zmiennej, jeśli to się zmienia
  vite_api_url_for_frontend      = "http://${module.load_balancer.alb_dns_name}/api"
  # eb_solution_stack_name można nadpisać, jeśli potrzeba
}