# -- ECS Cluster --
resource "aws_ecs_cluster" "main_cluster" {
  name = "${var.app_name}-cluster"
}

# -- Application Load Balancer --
resource "aws_security_group" "alb_sg" {
  name        = "${var.app_name}-alb-sg"
  description = "Allow HTTP traffic to ALB"
  vpc_id      = data.aws_vpc.default.id

  ingress {
    protocol    = "tcp"
    from_port   = 80
    to_port     = 80
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
    from_port       = 80 
    to_port         = 80 
    security_groups = [aws_security_group.alb_sg.id] # Zezwól na ruch tylko z ALB
  }

  egress {
    protocol    = "-1" # Wszystkie protokoły
    from_port   = 0
    to_port     = 0
    cidr_blocks = ["0.0.0.0/0"] # Dostęp do internetu (ECR, S3, DynamoDB, SNS, Cognito itp.)
  }
}



# --- Helper: Moduł do tworzenia usług Fargate (aby uniknąć powtórzeń) ---
# Można by to opakować w moduł Terraform, ale dla jednego pliku użyjemy powtarzalnych bloków
# Poniżej definicje dla każdego serwisu.

# --- Konfiguracja i uruchomienie każdego mikroserwisu ---

# Lokalna zmienna do przechowywania konfiguracji serwisów
locals {
  services_config = {
    api-gateway = {
      port             = 80
      image_uri        = var.api_gateway_image_uri
      tg_port          = 80      # Port dla Target Group
      alb_path         = "/api/*"  # Ścieżka na ALB
      alb_priority     = 10        # Priorytet reguły ALB
      cpu              = 256       # Jednostki CPU dla Fargate
      memory           = 512       # Pamięć w MB dla Fargate
      environment_vars = [         # Zmienne środowiskowe
        { name = "PORT", value = "80" },
        { name = "AWS_REGION", value = var.aws_region },
        { name = "AUTH_SERVICE_URL", value = "http://${aws_lb.main_alb.dns_name}/auth" },
        { name = "NOTES_SERVICE_URL", value = "http://${aws_lb.main_alb.dns_name}/notes" },
        { name = "FILES_SERVICE_URL", value = "http://${aws_lb.main_alb.dns_name}/files" },
        { name = "NOTIFICATIONS_SERVICE_URL", value = "http://${aws_lb.main_alb.dns_name}/notifications" },
        { name = "AWS_ACCESS_KEY_ID", value = var.aws_access_key_id },
        { name = "AWS_SECRET_ACCESS_KEY", value = var.aws_secret_access_key },
        { name = "AWS_SESSION_TOKEN", value = var.aws_session_token },
      ]
    },
    auth-service = {
      port             = 80
      image_uri        = var.auth_service_image_uri
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
    interval            = 300
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

resource "aws_elastic_beanstalk_application_version" "frontend_version_eb" {
  name        = "${var.app_name}-frontend-version-eb-${random_string.suffix.result}"
  application = aws_elastic_beanstalk_application.app_frontend_eb.name
  description = "Frontend version from Docker Hub"
  bucket      = aws_s3_bucket.eb_app_versions_frontend.id
  key         = aws_s3_object.frontend_dockerrun_eb.key 
}

resource "aws_elastic_beanstalk_environment" "frontend_env_eb" {
  name                = "${var.app_name}-frontend-env-eb"
  application         = aws_elastic_beanstalk_application.app_frontend_eb.name
  solution_stack_name = "64bit Amazon Linux 2023 v4.5.0 running Docker"
  version_label       = aws_elastic_beanstalk_application_version.frontend_version_eb.name

  setting {
    namespace = "aws:elasticbeanstalk:application:environment"
    name      = "VITE_API_URL"
    value     = "http://${aws_lb.main_alb.dns_name}/api"
  }
  setting {
    namespace = "aws:autoscaling:launchconfiguration"
    name      = "IamInstanceProfile"
    value     = "LabInstanceProfile"
  }
}