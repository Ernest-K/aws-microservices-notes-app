# ustawienie credentials (linux)
# export TF_VAR_aws_access_key_id=$(aws configure get aws_access_key_id)
# export TF_VAR_aws_secret_access_key=$(aws configure get aws_secret_access_key)
# export TF_VAR_aws_session_token=$(aws configure get aws_session_token)

# Klaster ECS - logiczne grupowanie usług i zadań
resource "aws_ecs_cluster" "main_cluster" {
  name = "${var.app_name}-cluster"
}

# Application Load Balancer
resource "aws_security_group" "alb_sg" {
  name        = "${var.app_name}-alb-sg"
  description = "Allow HTTP traffic to ALB"
  vpc_id      = data.aws_vpc.default.id

  ingress { # reguły ruchu przychodzącego
    protocol    = "tcp"
    from_port   = 80
    to_port     = 80
    cidr_blocks = ["0.0.0.0/0"] # Zezwól na ruch HTTP z dowolnego miejsca w internecie
  }
  egress { # reguły ruchu wychodzącego
    protocol    = "-1"
    from_port   = 0
    to_port     = 0
    cidr_blocks = ["0.0.0.0/0"] # Zezwól na cały ruch wychodzący
  }
}

resource "aws_lb" "main_alb" {
  name                       = "${var.app_name}-alb-${random_string.suffix.result}"
  internal                   = false         # Publicznie dostępny
  load_balancer_type         = "application" # ALB działa na warstwie 7 (aplikacji), co pozwala na routing oparty na ścieżkach URL, nagłówkach HTTP itp
  security_groups            = [aws_security_group.alb_sg.id]
  subnets                    = data.aws_subnets.default.ids # ALB powinien być w podsieciach publicznych
  enable_deletion_protection = false
}

resource "aws_lb_listener" "http_listener" {
  load_balancer_arn = aws_lb.main_alb.arn
  port              = 80     # Listener nasłuchuje na porcie 80,
  protocol          = "HTTP" # dla ruchu HTTP.

  default_action {
    type = "fixed-response"
    fixed_response {
      content_type = "text/plain"
      message_body = "Resource not found."
      status_code  = "404"
    }
  }
}


# Security Group dla Fargate Services
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
    cidr_blocks = ["0.0.0.0/0"] # Zezwól na cały ruch wychodzący
  }
}


# Konfiguracja każdego mikroserwisu

# Lokalna zmienna do przechowywania konfiguracji serwisów
locals {
  services_config = {
    api-gateway = {
      port         = 80 # Port, na którym kontener nasłuchuje
      image_uri    = var.api_gateway_image_uri
      tg_port      = 80       # Port dla Target Group
      alb_path     = "/api/*" # Ścieżka na ALB kierująca do tego serwisu
      alb_priority = 10       # Priorytet reguły ALB (niższy = wyższy priorytet)
      cpu          = 256      # Jednostki CPU dla Fargate (1024 = 1 vCPU)
      memory       = 512      # Pamięć w MB dla Fargate
      environment_vars = [    # Zmienne środowiskowe
        { name = "PORT", value = "80" },
        { name = "AWS_REGION", value = var.aws_region },
        { name = "AUTH_SERVICE_URL", value = "http://${aws_lb.main_alb.dns_name}/auth" },
        { name = "NOTES_SERVICE_URL", value = var.lambda_api_gateway_invoke_url },
        { name = "FILES_SERVICE_URL", value = "http://${aws_lb.main_alb.dns_name}/files" },
        { name = "NOTIFICATIONS_SERVICE_URL", value = "http://${aws_lb.main_alb.dns_name}/notifications" },
        { name = "AWS_ACCESS_KEY_ID", value = var.aws_access_key_id },
        { name = "AWS_SECRET_ACCESS_KEY", value = var.aws_secret_access_key },
        { name = "AWS_SESSION_TOKEN", value = var.aws_session_token },
      ]
    },
    auth-service = {
      port         = 80
      image_uri    = var.auth_service_image_uri
      tg_port      = 80
      alb_path     = "/auth/*"
      alb_priority = 30
      cpu          = 256
      memory       = 512
      environment_vars = [
        { name = "PORT", value = "80" },
        { name = "AWS_REGION", value = var.aws_region },
        { name = "COGNITO_CLIENT_ID", value = aws_cognito_user_pool_client.app_client.id },
        { name = "AWS_ACCESS_KEY_ID", value = var.aws_access_key_id },
        { name = "AWS_SECRET_ACCESS_KEY", value = var.aws_secret_access_key },
        { name = "AWS_SESSION_TOKEN", value = var.aws_session_token },
      ]
    },
    files-service = {
      port         = 80
      image_uri    = var.files_service_image_uri
      tg_port      = 80
      alb_path     = "/files/*"
      alb_priority = 50
      cpu          = 256
      memory       = 512
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
      port         = 80
      image_uri    = var.notifications_service_image_uri
      tg_port      = 80
      alb_path     = "/notifications/*"
      alb_priority = 60
      cpu          = 256
      memory       = 512
      environment_vars = [
        { name = "PORT", value = "80" },
        { name = "AWS_REGION", value = var.aws_region },
        { name = "AWS_SNS_TOPIC_ARN", value = aws_sns_topic.notifications_topic.arn },
        { name = "DYNAMODB_NOTIFICATIONS_TABLE_NAME", value = aws_dynamodb_table.notifications_history_table.name },
        { name = "AWS_ACCESS_KEY_ID", value = var.aws_access_key_id },
        { name = "AWS_SECRET_ACCESS_KEY", value = var.aws_secret_access_key },
        { name = "AWS_SESSION_TOKEN", value = var.aws_session_token },
        { name = "SQS_QUEUE_URL", value = var.sqs_notifications_queue_url }
      ]
    }
  }
}

resource "aws_ecs_task_definition" "app_task_definitions" {
  for_each = local.services_config

  family                   = "${var.app_name}-${each.key}-td"
  network_mode             = "awsvpc" # Każde zadanie Fargate dostaje własny interfejs sieciowy i adres IP.
  requires_compatibilities = ["FARGATE"]
  cpu                      = each.value.cpu    # CPU dla zadania
  memory                   = each.value.memory # Pamięć dla zadania
  task_role_arn            = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/LabRole"
  execution_role_arn       = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/LabRole"

  container_definitions = jsonencode([
    {
      name      = "${var.app_name}-${each.key}-container"
      image     = each.value.image_uri
      cpu       = each.value.cpu    # CPU dla kontenera
      memory    = each.value.memory # Pamięć dla kontenera
      essential = true              # Jeśli ten kontener padnie, całe zadanie jest zatrzymywane
      portMappings = [
        {
          containerPort = each.value.port # Port, na którym aplikacja w kontenerze nasłuchuje
          hostPort      = each.value.port # Port na interfejsie sieciowym zadania
        }
      ]
      environment = each.value.environment_vars
    }
  ])
}

resource "aws_lb_target_group" "app_target_groups" {
  for_each = local.services_config

  name        = "${each.key}-tg"
  port        = each.value.tg_port # Port, na którym cele (kontenery) nasłuchują
  protocol    = "HTTP"
  vpc_id      = data.aws_vpc.default.id
  target_type = "ip" # ALB kieruje ruch bezpośrednio na adresy IP zadań

  health_check {
    path                = "/health" # Endpoint w aplikacji do sprawdzania zdrowia
    protocol            = "HTTP"
    matcher             = "200-299"
    interval            = 300 # Czas między sprawdzeniami
    timeout             = 10  # Czas na odpowiedź
    healthy_threshold   = 2   # Liczba pomyślnych sprawdzeń do uznania za zdrowy
    unhealthy_threshold = 3   # Liczba niepomyślnych sprawdzeń do uznania za niezdrowy
  }
}

resource "aws_lb_listener_rule" "app_listener_rules" {
  for_each = local.services_config

  listener_arn = aws_lb_listener.http_listener.arn
  priority     = each.value.alb_priority # Priorytet reguły 

  action {                                                                 # Co robić, gdy warunek jest spełniony
    type             = "forward"                                           # Przekaż żądanie
    target_group_arn = aws_lb_target_group.app_target_groups[each.key].arn # Do odpowiedniej grupy docelowej
  }

  condition { # Warunek aktywacji reguły
    path_pattern {
      values = [each.value.alb_path] # Na podstawie ścieżki URL
    }
  }
  # Jeśli ścieżka URL pasuje do each.value.alb_path, przekaż żądanie do grupy docelowej aws_lb_target_group.app_target_groups[each.key]
}

resource "aws_ecs_service" "app_services" {
  for_each = local.services_config

  name            = "${var.app_name}-${each.key}-service"
  cluster         = aws_ecs_cluster.main_cluster.id
  task_definition = aws_ecs_task_definition.app_task_definitions[each.key].arn
  desired_count   = 2 # Utrzymuj 2 działające instancje
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = data.aws_subnets.default.ids
    security_groups  = [aws_security_group.fargate_services_sg.id]
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
  for_each = local.services_config

  max_capacity       = 4                                                                                             # Maksymalna liczba zadań
  min_capacity       = 2                                                                                             # Minimalna liczba zadań
  resource_id        = "service/${aws_ecs_cluster.main_cluster.name}/${aws_ecs_service.app_services[each.key].name}" # ID usługi ECS do skalowania
  scalable_dimension = "ecs:service:DesiredCount"                                                                    # Co skalujemy (liczbę zadań)
  service_namespace  = "ecs"                                                                                         # W jakiej usłudze (ECS)
}

resource "aws_appautoscaling_policy" "ecs_service_scaling_policy_cpu" {
  for_each = local.services_config

  name               = "${var.app_name}-${each.key}-scale-cpu"
  policy_type        = "TargetTrackingScaling" # Utrzymuj metrykę na docelowym poziomie
  resource_id        = aws_appautoscaling_target.ecs_service_scaling_target[each.key].resource_id
  scalable_dimension = aws_appautoscaling_target.ecs_service_scaling_target[each.key].scalable_dimension
  service_namespace  = aws_appautoscaling_target.ecs_service_scaling_target[each.key].service_namespace

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization" # Średnie użycie CPU (metryka)
    }
    target_value       = 75  # Docelowe średnie użycie CPU w %
    scale_in_cooldown  = 300 # Czas (s) oczekiwania po zmniejszeniu liczby zadań
    scale_out_cooldown = 60  # Czas (s) oczekiwania po zwiększeniu liczby zadań
  }
}

resource "aws_elastic_beanstalk_application" "app_frontend_eb" {
  name        = "${var.app_name}-frontend-eb"
  description = "Frontend application for ${var.app_name}"
}

resource "aws_s3_object" "frontend_dockerrun_eb" {
  bucket = aws_s3_bucket.eb_app_versions_frontend.id
  key    = "frontend-dockerrun.aws.json"
  content = jsonencode({
    AWSEBDockerrunVersion = "1",
    Image = {
      Name   = var.frontend_image_uri,
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
