# -- S3 Bucket for Files Service --
resource "aws_s3_bucket" "app_files_bucket" {
  bucket = "${var.app_name}-files-${random_string.suffix.result}"
}

resource "aws_s3_bucket_public_access_block" "app_files_bucket_access_block" {
  bucket = aws_s3_bucket.app_files_bucket.id
}

resource "aws_s3_bucket_ownership_controls" "app_files_bucket_ownership" {
  bucket = aws_s3_bucket.app_files_bucket.id
  rule {
    object_ownership = "BucketOwnerPreferred"
  }
}

resource "aws_s3_bucket_acl" "app_files_bucket_acl" {
  depends_on = [
    aws_s3_bucket_ownership_controls.app_files_bucket_ownership,
    aws_s3_bucket_public_access_block.app_files_bucket_access_block,
  ]
  bucket = aws_s3_bucket.app_files_bucket.id
  acl    = "public-read-write" # Ustaw na "public-read" jeśli pliki mają być bezpośrednio dostępne publicznie z S3
                      # Aplikacja `files-service` używa `ACL: "public-read"` dla obiektów.
}


# -- RDS PostgreSQL for Notes Service --
resource "aws_security_group" "rds_sg" {
  name        = "${var.app_name}-rds-sg"
  description = "Allow PostgreSQL access from Fargate services"
  vpc_id      = data.aws_vpc.default.id

  # Reguła ingress będzie dodana później, aby zezwolić na ruch z SG serwisu notes
}

resource "aws_db_instance" "app_db" {
  identifier           = "${var.app_name}-db-${random_string.suffix.result}"
  allocated_storage    = 20
  engine               = "postgres"
  engine_version       = "17.2" # Sprawdź najnowszą wspieraną wersję db.t3.micro
  instance_class       = "db.t3.micro" # Sprawdź dostępność w AWS Academy
  db_name              = "notesdb"
  username             = var.db_username
  password             = var.db_password
  parameter_group_name = "test" # Upewnij się, że ta grupa istnieje dla Twojej wersji silnika
  skip_final_snapshot  = true
  publicly_accessible  = true # Dostęp tylko z VPC
  vpc_security_group_ids = [aws_security_group.rds_sg.id]
  # W AWS Academy możesz potrzebować `publicly_accessible = true` i odpowiednich reguł SG,
  # jeśli Fargate Tasks nie mają łatwego dostępu do prywatnych zasobów.
  # Na razie zakładamy, że dostęp prywatny jest możliwy.
  # `db_subnet_group_name` może być potrzebny, jeśli nie jest w domyślnych podsieciach.
}

# -- Cognito User Pool & Client --
resource "aws_cognito_user_pool" "app_user_pool" {
  name = "${var.app_name}-user-pool-${random_string.suffix.result}"
  auto_verified_attributes = ["email"]
}

resource "aws_cognito_user_pool_client" "app_client" {
  name         = "${var.app_name}-client"
  user_pool_id = aws_cognito_user_pool.app_user_pool.id

  generate_secret = false # Dla aplikacji frontendowych
  explicit_auth_flows = [
    "ALLOW_USER_PASSWORD_AUTH",
    "ALLOW_REFRESH_TOKEN_AUTH",
    "ALLOW_USER_SRP_AUTH",
  ]
}

# -- DynamoDB Tables --
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
  # Zgodnie z kodem notifications-service, notificationId jest unikalny i używany jako klucz.
  # recipientUserId jest używany do filtrowania, więc może być GSI lub częścią złożonego klucza.
  # Dla uproszczenia, zakładając że notificationId jest głównym kluczem wyszukiwania (choć kod używa go jako PK):
  billing_mode = "PAY_PER_REQUEST"
  hash_key = "recipientUserId" # Zgodnie z kodem notifications-service app.js ddbDocClient.send(new PutCommand(dynamoDbParams))
                              # gdzie dynamoDbParams.Item.notificationId jest ustawiany.
                              # recipientUserId byłby dobry dla GSI do zapytań per użytkownik.
  range_key    = "notificationId"
  attribute {
    name = "recipientUserId"
    type = "S"
  }
  attribute {
    name = "notificationId"
    type = "S"
  }
  # Jeśli chcesz zapytywać po recipientUserId, dodaj GSI:
  # global_secondary_index {
  #   name            = "RecipientUserIndex"
  #   hash_key        = "recipientUserId"
  #   projection_type = "ALL"
  # }
  # attribute {
  #   name = "recipientUserId" # Musi być zdefiniowany jako atrybut, jeśli jest kluczem GSI
  #   type = "S"
  # }
}

# -- SNS Topic for Notifications --
resource "aws_sns_topic" "notifications_topic" {
  name = "${var.app_name}-notifications-topic-${random_string.suffix.result}"
}

# -- IAM Roles for Fargate Tasks --
# data "aws_iam_policy_document" "ecs_task_assume_role_policy" {
#   statement {
#     actions = ["sts:AssumeRole"]
#     principals {
#       type        = "Service"
#       identifiers = ["ecs-tasks.amazonaws.com"]
#     }
#   }
# }

# resource "aws_iam_role" "ecs_task_role" {
#   name               = "${var.app_name}-ecs-task-role"
#   assume_role_policy = data.aws_iam_policy_document.ecs_task_assume_role_policy.json
# }

# Polityka dla zadań ECS dająca dostęp do potrzebnych serwisów
# data "aws_iam_policy_document" "ecs_task_permissions_policy_doc" {
#   statement {
#     actions = [
#       "ecr:GetAuthorizationToken",
#       "ecr:BatchCheckLayerAvailability",
#       "ecr:GetDownloadUrlForLayer",
#       "ecr:BatchGetImage",
#       "logs:CreateLogStream",
#       "logs:PutLogEvents"
#     ]
#     resources = ["*"] # ECR i CloudWatch logs są szerokie
#   }
#   statement {
#     actions = [
#       "s3:PutObject",
#       "s3:GetObject",
#       "s3:DeleteObject",
#       "s3:PutObjectAcl" # Ze względu na `ACL: "public-read"` w files-service
#     ]
#     resources = [
#       "${aws_s3_bucket.app_files_bucket.arn}/*" # Dostęp do obiektów w buckecie
#     ]
#   }
#   statement {
#     actions = [
#       "s3:ListBucket" # Może być potrzebne dla niektórych operacji S3
#     ]
#     resources = [
#       aws_s3_bucket.app_files_bucket.arn
#     ]
#   }
#   statement {
#     actions = [
#       "dynamodb:PutItem",
#       "dynamodb:GetItem",
#       "dynamodb:DeleteItem",
#       "dynamodb:Query",
#       "dynamodb:Scan" # Scan jest używany rzadziej, Query preferowane
#     ]
#     resources = [
#       aws_dynamodb_table.files_metadata_table.arn,
#       aws_dynamodb_table.notifications_history_table.arn,
#       # Jeśli masz GSI, dodaj ich ARN-y:
#       # "${aws_dynamodb_table.notifications_history_table.arn}/index/*",
#     ]
#   }
#   statement {
#     actions = [
#       "sns:Publish"
#     ]
#     resources = [aws_sns_topic.notifications_topic.arn]
#   }
#   statement {
#     # Cognito permissions for auth-service and api-gateway
#     actions = [
#       "cognito-idp:AdminInitiateAuth",
#       "cognito-idp:AdminRespondToAuthChallenge",
#       "cognito-idp:SignUp",
#       "cognito-idp:ConfirmSignUp",
#       "cognito-idp:InitiateAuth",
#       "cognito-idp:RespondToAuthChallenge",
#       "cognito-idp:ForgotPassword",
#       "cognito-idp:ConfirmForgotPassword",
#       "cognito-idp:GetUser"
#       # Dodaj inne potrzebne akcje Cognito
#     ]
#     resources = [aws_cognito_user_pool.app_user_pool.arn]
#   }
#   # Dodatkowe uprawnienia dla RDS (jeśli używasz IAM auth, ale tu używamy hasła)
#   # W przypadku AWS Academy, przekazanie credentials przez env vars jest częste,
#   # ale rolą ECS Task Role jest lepszym podejściem w standardowym AWS.
#   # Poniżej zakładam, że aplikacje będą miały credentials przez env vars.
# }

# resource "aws_iam_policy" "ecs_task_permissions_policy" {
#   name   = "${var.app_name}-ecs-task-permissions-policy"
#   policy = data.aws_iam_policy_document.ecs_task_permissions_policy_doc.json
# }

# resource "aws_iam_role_policy_attachment" "ecs_task_role_permissions_attachment" {
#   role       = "LabRole"
#   policy_arn = aws_iam_policy.ecs_task_permissions_policy.arn
# }

# -- ECR Repositories --
# Tworzymy repozytoria dla każdego serwisu
resource "aws_ecr_repository" "frontend_repo" { name = "${var.app_name}-frontend" }
resource "aws_ecr_repository" "api_gateway_repo" { name = "${var.app_name}-api-gateway" }
resource "aws_ecr_repository" "auth_service_repo" { name = "${var.app_name}-auth-service" }
resource "aws_ecr_repository" "notes_service_repo" { name = "${var.app_name}-notes-service" }
resource "aws_ecr_repository" "files_service_repo" { name = "${var.app_name}-files-service" }
resource "aws_ecr_repository" "notifications_service_repo" { name = "${var.app_name}-notifications-service" }

# -- ECS Cluster --
resource "aws_ecs_cluster" "main_cluster" {
  name = "${var.app_name}-cluster"
}

# -- CloudWatch Log Groups --
# Tworzymy grupy logów dla każdego serwisu
resource "aws_cloudwatch_log_group" "frontend_lg" { name = "/ecs/${var.app_name}-frontend" }
resource "aws_cloudwatch_log_group" "api_gateway_lg" { name = "/ecs/${var.app_name}-api-gateway" }
resource "aws_cloudwatch_log_group" "auth_service_lg" { name = "/ecs/${var.app_name}-auth-service" }
resource "aws_cloudwatch_log_group" "notes_service_lg" { name = "/ecs/${var.app_name}-notes-service" }
resource "aws_cloudwatch_log_group" "files_service_lg" { name = "/ecs/${var.app_name}-files-service" }
resource "aws_cloudwatch_log_group" "notifications_service_lg" { name = "/ecs/${var.app_name}-notifications-service" }


# -- Application Load Balancer --
resource "aws_security_group" "alb_sg" {
  name        = "${var.app_name}-alb-sg"
  description = "Allow HTTP/HTTPS traffic to ALB"
  vpc_id      = data.aws_vpc.default.id

  ingress {
    protocol    = "tcp"
    from_port   = 80
    to_port     = 80
    cidr_blocks = ["0.0.0.0/0"]
  }
  ingress {
    protocol    = "tcp"
    from_port   = 443 # Jeśli planujesz HTTPS
    to_port     = 443
    cidr_blocks = ["0.0.0.0/0"]
  }
  egress {
    protocol    = "-1"
    from_port   = 0
    to_port     = 0
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_lb" "main_alb" {
  name               = "${var.app_name}-alb-${random_string.suffix.result}"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb_sg.id]
  subnets            = data.aws_subnets.default.ids # ALB powinien być w podsieciach publicznych
  enable_deletion_protection = false
}



# Domyślna grupa docelowa dla żądań, które nie pasują do żadnej reguły (np. zwraca 404)
# lub możemy ją skierować na frontend.
resource "aws_lb_target_group" "default_tg" {
  name        = "${var.app_name}-default-tg"
  port        = 80
  protocol    = "HTTP"
  vpc_id      = data.aws_vpc.default.id
  target_type = "ip" # Dla Fargate
  health_check {
    path                = "/" # Dostosuj, jeśli default TG ma kierować na konkretny serwis
    protocol            = "HTTP"
    matcher             = "200-499" # Oczekiwane kody odpowiedzi dla healthy
    interval            = 30
    timeout             = 5
    healthy_threshold   = 2
    unhealthy_threshold = 2
  }
}


resource "aws_lb_listener" "http_listener" {
  load_balancer_arn = aws_lb.main_alb.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    # Domyślna akcja może zwracać 404 lub przekierowywać do dokumentacji API
    type = "fixed-response"
    fixed_response {
      content_type = "text/plain"
      message_body = "Resource not found."
      status_code  = "404"
    }
  }
}


# -- Security Group for Fargate Services (wspólna dla uproszczenia) --
resource "aws_security_group" "fargate_services_sg" {
  name        = "${var.app_name}-fargate-sg"
  description = "Allow traffic from ALB and egress to internet/VPC resources"
  vpc_id      = data.aws_vpc.default.id

  ingress {
    protocol        = "tcp"
    from_port       = 80 # Wszystkie porty
    to_port         = 80 # Wszystkie porty
    security_groups = [aws_security_group.alb_sg.id] # Zezwól na ruch tylko z ALB
  }

  egress {
    protocol    = "-1" # Wszystkie protokoły
    from_port   = 0
    to_port     = 0
    cidr_blocks = ["0.0.0.0/0"] # Dostęp do internetu (ECR, S3, DynamoDB, SNS, Cognito itp.)
  }
}

# Reguła dostępu z Fargate do RDS
resource "aws_security_group_rule" "fargate_to_rds" {
  type                     = "ingress"
  from_port                = 5432 # Port PostgreSQL
  to_port                  = 5432
  protocol                 = "tcp"
  source_security_group_id = aws_security_group.fargate_services_sg.id
  security_group_id        = aws_security_group.rds_sg.id
}


# --- Helper: Moduł do tworzenia usług Fargate (aby uniknąć powtórzeń) ---
# Można by to opakować w moduł Terraform, ale dla jednego pliku użyjemy powtarzalnych bloków
# Poniżej definicje dla każdego serwisu.

# --- Konfiguracja i uruchomienie każdego mikroserwisu ---

# Lokalna zmienna do przechowywania konfiguracji serwisów
locals {
  services_config = {
    # Frontend NIE BĘDZIE tutaj, bo wdrażamy go przez Beanstalk
    api-gateway = {
      port             = 80
      image_uri        = var.api_gateway_image_uri
      log_group        = aws_cloudwatch_log_group.api_gateway_lg.name
      tg_port          = 80      # Port dla Target Group
      alb_path         = "/*"  # Ścieżka na ALB
      alb_priority     = 10        # Priorytet reguły ALB
      cpu              = 256       # Jednostki CPU dla Fargate
      memory           = 512       # Pamięć w MB dla Fargate
      environment_vars = [         # Zmienne środowiskowe
        { name = "PORT", value = "80" },
        { name = "AWS_REGION", value = var.aws_region },
        { name = "AUTH_SERVICE_URL", value = "http://${aws_lb.main_alb.dns_name}" },
        { name = "NOTES_SERVICE_URL", value = "http://${aws_lb.main_alb.dns_name}" },
        { name = "FILES_SERVICE_URL", value = "http://${aws_lb.main_alb.dns_name}" },
        { name = "NOTIFICATIONS_SERVICE_URL", value = "http://${aws_lb.main_alb.dns_name}" },
        { name = "AWS_ACCESS_KEY_ID", value = var.aws_access_key_id },
        { name = "AWS_SECRET_ACCESS_KEY", value = var.aws_secret_access_key },
        { name = "AWS_SESSION_TOKEN", value = var.aws_session_token },
      ]
    },
    auth-service = {
      port             = 80
      image_uri        = var.auth_service_image_uri
      log_group        = aws_cloudwatch_log_group.auth_service_lg.name
      tg_port          = 80
      alb_path         = "/auth/*"
      alb_priority     = 30
      cpu              = 256
      memory           = 512
      environment_vars = [
        { name = "PORT", value = "80" },
        { name = "AWS_REGION", value = var.aws_region },
        { name = "COGNITO_CLIENT_ID", value = aws_cognito_user_pool_client.app_client.id },
        { name = "AWS_ACCESS_KEY_ID", value = var.aws_access_key_id },
        { name = "AWS_SECRET_ACCESS_KEY", value = var.aws_secret_access_key },
        { name = "AWS_SESSION_TOKEN", value = var.aws_session_token },
      ]
    },
    notes-service = {
      port             = 80
      image_uri        = var.notes_service_image_uri
      log_group        = aws_cloudwatch_log_group.notes_service_lg.name
      tg_port          = 80
      alb_path         = "/notes/*"
      alb_priority     = 40
      cpu              = 256
      memory           = 512
      environment_vars = [
        { name = "PORT", value = "80" },
        { name = "DB_URL", value = "postgresql://${var.db_username}:${var.db_password}@${aws_db_instance.app_db.address}:${aws_db_instance.app_db.port}/${aws_db_instance.app_db.db_name}" },
        { name = "AWS_REGION", value = var.aws_region },
        { name = "NOTIFICATIONS_SERVICE_URL", value = "http://${aws_lb.main_alb.dns_name}/notifications" }
      ]
    },
    files-service = {
      port             = 80
      image_uri        = var.files_service_image_uri
      log_group        = aws_cloudwatch_log_group.files_service_lg.name
      tg_port          = 80
      alb_path         = "/files/*"
      alb_priority     = 50
      cpu              = 256
      memory           = 512
      environment_vars = [
        { name = "PORT", value = "80" },
        { name = "AWS_REGION", value = var.aws_region },
        { name = "AWS_S3_BUCKET_NAME", value = aws_s3_bucket.app_files_bucket.bucket },
        { name = "DYNAMODB_TABLE_NAME", value = aws_dynamodb_table.files_metadata_table.name },
        { name = "AWS_ACCESS_KEY_ID", value = var.aws_access_key_id },
        { name = "AWS_SECRET_ACCESS_KEY", value = var.aws_secret_access_key },
        { name = "AWS_SESSION_TOKEN", value = var.aws_session_token },
      ]
    },
    notifications-service = {
      port             = 80
      image_uri        = var.notifications_service_image_uri
      log_group        = aws_cloudwatch_log_group.notifications_service_lg.name
      tg_port          = 80
      alb_path         = "/notifications/*"
      alb_priority     = 60
      cpu              = 256
      memory           = 512
      environment_vars = [
        { name = "PORT", value = "80" },
        { name = "AWS_REGION", value = var.aws_region },
        { name = "AWS_SNS_TOPIC_ARN", value = aws_sns_topic.notifications_topic.arn },
        { name = "DYNAMODB_NOTIFICATIONS_TABLE_NAME", value = aws_dynamodb_table.notifications_history_table.name },
        { name = "AWS_ACCESS_KEY_ID", value = var.aws_access_key_id },
        { name = "AWS_SECRET_ACCESS_KEY", value = var.aws_secret_access_key },
        { name = "AWS_SESSION_TOKEN", value = var.aws_session_token },
      ]
    }
    # Upewnij się, że nie ma tu już 'frontend'
  }
}

resource "aws_ecs_task_definition" "app_task_definitions" {
  for_each = local.services_config # Ta mapa teraz nie zawiera 'frontend'
  # ... reszta konfiguracji task definition bez zmian
  family                   = "${var.app_name}-${each.key}-td"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = each.value.cpu       # Powinno teraz działać
  memory                   = each.value.memory    # Powinno teraz działać
  task_role_arn            = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/LabRole"
  execution_role_arn       = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/LabRole"

  container_definitions = jsonencode([
    {
      name      = "${var.app_name}-${each.key}-container"
      image     = each.value.image_uri
      cpu       = each.value.cpu
      memory    = each.value.memory
      essential = true
      portMappings = [
        {
          containerPort = each.value.port
          hostPort      = each.value.port
        }
      ]
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = each.value.log_group
          "awslogs-region"        = var.aws_region
          "awslogs-stream-prefix" = "ecs"
        }
      }
      environment = each.value.environment_vars
    }
  ])
}

resource "aws_lb_target_group" "app_target_groups" {
  for_each = local.services_config # Ta mapa teraz nie zawiera 'frontend'

  name        = "${each.key}-tg"
  port        = each.value.tg_port
  # ... reszta konfiguracji target group bez zmian
  protocol    = "HTTP"
  vpc_id      = data.aws_vpc.default.id
  target_type = "ip"

  health_check {
    path                = "/health" # Zakładając, że wszystkie backendy mają /health
    protocol            = "HTTP"
    matcher             = "200-299"
    interval            = 30
    timeout             = 10
    healthy_threshold   = 2
    unhealthy_threshold = 3
  }
}

resource "aws_lb_listener_rule" "app_listener_rules" {
  for_each = local.services_config # Ta mapa teraz nie zawiera 'frontend'

  listener_arn = aws_lb_listener.http_listener.arn
  priority     = each.value.alb_priority

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.app_target_groups[each.key].arn
  }

  condition {
    path_pattern {
      values = [each.value.alb_path]
    }
  }
}

resource "aws_ecs_service" "app_services" {
  for_each = local.services_config # Ta mapa teraz nie zawiera 'frontend'
  # ... reszta konfiguracji ecs service bez zmian
  name            = "${var.app_name}-${each.key}-service"
  cluster         = aws_ecs_cluster.main_cluster.id
  task_definition = aws_ecs_task_definition.app_task_definitions[each.key].arn
  desired_count   = 2
  launch_type     = "FARGATE"

  network_configuration {
    subnets         = data.aws_subnets.default.ids
    security_groups = [aws_security_group.fargate_services_sg.id]
    assign_public_ip = true
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.app_target_groups[each.key].arn
    container_name   = "${var.app_name}-${each.key}-container"
    container_port   = each.value.port
  }

  depends_on = [aws_lb_listener_rule.app_listener_rules]
}


# Autoskalowanie dla każdego serwisu
resource "aws_appautoscaling_target" "ecs_service_scaling_target" {
  for_each = local.services_config # Ta mapa teraz nie zawiera 'frontend'
  # ... reszta konfiguracji autoscaling target bez zmian
  max_capacity       = 4
  min_capacity       = 2
  resource_id        = "service/${aws_ecs_cluster.main_cluster.name}/${aws_ecs_service.app_services[each.key].name}"
  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace  = "ecs"
}

resource "aws_appautoscaling_policy" "ecs_service_scaling_policy_cpu" {
  for_each = local.services_config # Ta mapa teraz nie zawiera 'frontend'
  # ... reszta konfiguracji autoscaling policy bez zmian
  name               = "${var.app_name}-${each.key}-scale-cpu"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.ecs_service_scaling_target[each.key].resource_id
  scalable_dimension = aws_appautoscaling_target.ecs_service_scaling_target[each.key].scalable_dimension
  service_namespace  = aws_appautoscaling_target.ecs_service_scaling_target[each.key].service_namespace

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
    target_value       = 75
    scale_in_cooldown  = 300
    scale_out_cooldown = 60
  }
}

resource "aws_elastic_beanstalk_application" "app_frontend_eb" { # Zmieniona nazwa, aby uniknąć konfliktu
  name        = "${var.app_name}-frontend-eb"
  description = "Frontend application for ${var.app_name}"
}

resource "aws_s3_bucket" "eb_app_versions_frontend" {
  bucket = "${var.app_name}-eb-frontend-versions-${random_string.suffix.result}"
}

resource "aws_s3_object" "frontend_dockerrun_eb" { # Zmieniona nazwa
  bucket = aws_s3_bucket.eb_app_versions_frontend.id
  key    = "frontend-dockerrun.aws.json"
  content = jsonencode({
    AWSEBDockerrunVersion = "1",
    Image = {
      Name   = var.frontend_image_uri, # Używamy obrazu z Docker Hub
      Update = "true"
    },
    Ports = [
      {
        ContainerPort = "80", # Port na którym nasłuchuje kontener Vite
        HostPort      = "80"  # Port na instancji EC2
      }
    ]
  })
}

resource "aws_elastic_beanstalk_application_version" "frontend_version_eb" { # Zmieniona nazwa
  name        = "${var.app_name}-frontend-version-eb-${random_string.suffix.result}"
  application = aws_elastic_beanstalk_application.app_frontend_eb.name
  description = "Frontend version from Docker Hub"
  bucket      = aws_s3_bucket.eb_app_versions_frontend.id
  key         = aws_s3_object.frontend_dockerrun_eb.key # Poprawiono na .key
}

resource "aws_elastic_beanstalk_environment" "frontend_env_eb" { # Zmieniona nazwa
  name                = "${var.app_name}-frontend-env-eb"
  application         = aws_elastic_beanstalk_application.app_frontend_eb.name
  solution_stack_name = "64bit Amazon Linux 2023 v4.5.0 running Docker" # Sprawdź najnowszą wspieraną wersję Docker na AL2
                                                                      # Lub "64bit Amazon Linux 2023 v4.x.x running Docker" jeśli dostępna i preferowana
  version_label       = aws_elastic_beanstalk_application_version.frontend_version_eb.name

  # Ustawienia środowiska dla frontendu
  setting {
    namespace = "aws:elasticbeanstalk:application:environment"
    name      = "VITE_API_URL"
    # API Gateway będzie dostępne przez ALB na ścieżce /api
    value     = "http://${aws_lb.main_alb.dns_name}"
  }
  setting {
    namespace = "aws:autoscaling:launchconfiguration"
    name      = "IamInstanceProfile"
    # W AWS Academy użyj "LabInstanceProfile"
    # W standardowym AWS, powinieneś stworzyć profil instancji z odpowiednimi uprawnieniami
    # np. dostęp do pobierania z Docker Hub, CloudWatch logs
    value     = "LabInstanceProfile"
  }
}