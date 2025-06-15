resource "aws_ecs_task_definition" "this" {
  family                   = "${var.app_name}-${var.service_name}-td"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = var.cpu
  memory                   = var.memory
  task_role_arn            = var.task_role_arn
  execution_role_arn       = var.execution_role_arn

  container_definitions = jsonencode([
    {
      name      = "${var.app_name}-${var.service_name}-container"
      image     = var.image_uri
      cpu       = var.cpu
      memory    = var.memory
      essential = true
      portMappings = [
        {
          containerPort = var.container_port
          hostPort      = var.container_port # W awsvpc hostPort = containerPort
        }
      ]
      environment = var.environment_vars
      # Można dodać logConfiguration, jeśli chcesz przekierować logi do CloudWatch Logs
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = "/ecs/${var.app_name}-${var.service_name}"
          "awslogs-region"        = data.aws_region.current.name # Pobierz aktualny region
          "awslogs-stream-prefix" = "ecs"
        }
      }
    }
  ])
}

# Potrzebujemy data source, aby uzyskać aktualny region dla logów
data "aws_region" "current" {}

resource "aws_cloudwatch_log_group" "this" {
  name              = "/ecs/${var.app_name}-${var.service_name}"
  retention_in_days = 7 # Opcjonalnie, ustaw retencję logów
}

resource "aws_lb_target_group" "this" {
  name        = "${var.app_name}-${var.service_name}-tg" # Skrócono nazwę dla limitów AWS
  port        = var.tg_port
  protocol    = "HTTP"
  vpc_id      = var.vpc_id
  target_type = "ip"

  health_check {
    path                = var.health_check_path
    protocol            = "HTTP"
    matcher             = "200-299"
    interval            = 300
    timeout             = 10
    healthy_threshold   = 2
    unhealthy_threshold = 3
  }
}

resource "aws_lb_listener_rule" "this" {
  listener_arn = var.alb_http_listener_arn
  priority     = var.alb_listener_priority

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.this.arn
  }

  condition {
    path_pattern {
      values = [var.alb_path_pattern]
    }
  }
}

resource "aws_ecs_service" "this" {
  name            = "${var.app_name}-${var.service_name}-service"
  cluster         = var.ecs_cluster_id
  task_definition = aws_ecs_task_definition.this.arn
  desired_count   = var.desired_count
  launch_type     = "FARGATE"

  network_configuration {
    subnets         = var.subnet_ids
    security_groups = [var.fargate_service_sg_id]
    assign_public_ip = true
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.this.arn
    container_name   = "${var.app_name}-${var.service_name}-container"
    container_port   = var.container_port
  }

  depends_on = [aws_lb_listener_rule.this]
}

# Autoskalowanie
resource "aws_appautoscaling_target" "ecs_service_scaling_target" {
  max_capacity       = var.autoscaling_max_capacity
  min_capacity       = var.autoscaling_min_capacity
  resource_id        = "service/${var.ecs_cluster_name}/${aws_ecs_service.this.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace  = "ecs"
}

resource "aws_appautoscaling_policy" "ecs_service_scaling_policy_cpu" {
  name               = "${var.app_name}-${var.service_name}-scale-cpu"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.ecs_service_scaling_target.resource_id
  scalable_dimension = aws_appautoscaling_target.ecs_service_scaling_target.scalable_dimension
  service_namespace  = aws_appautoscaling_target.ecs_service_scaling_target.service_namespace

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
    target_value       = 75
    scale_in_cooldown  = 300
    scale_out_cooldown = 60
  }
}