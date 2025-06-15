resource "aws_elastic_beanstalk_application" "this" {
  name        = "${var.app_name}-frontend-eb"
  description = "Frontend application for ${var.app_name}"
}

resource "aws_s3_object" "frontend_dockerrun" {
  bucket = var.s3_bucket_for_eb_versions_id
  key    = "frontend-dockerrun-${var.random_suffix}.aws.json" # Unikalny klucz dla Dockerrun
  content = jsonencode({
    AWSEBDockerrunVersion = "1",
    Image = {
      Name   = var.frontend_image_uri
      Update = "true"
    },
    Ports = [
      {
        ContainerPort = "80"
        HostPort      = "80"
      }
    ]
  })
  etag = md5(jsonencode({ # Zapewnia aktualizację, jeśli content się zmieni
    AWSEBDockerrunVersion = "1",
    Image = {
      Name   = var.frontend_image_uri
      Update = "true"
    },
    Ports = [
      {
        ContainerPort = "80"
        HostPort      = "80"
      }
    ]
  }))
}

resource "aws_elastic_beanstalk_application_version" "this" {
  name        = "${var.app_name}-frontend-v-${var.random_suffix}"
  application = aws_elastic_beanstalk_application.this.name
  description = "Frontend version from Docker image"
  bucket      = var.s3_bucket_for_eb_versions_id
  key         = aws_s3_object.frontend_dockerrun.key
}

resource "aws_elastic_beanstalk_environment" "this" {
  name                = "${var.app_name}-frontend-env-${var.random_suffix}"
  application         = aws_elastic_beanstalk_application.this.name
  solution_stack_name = var.eb_solution_stack_name
  version_label       = aws_elastic_beanstalk_application_version.this.name

  setting {
    namespace = "aws:elasticbeanstalk:application:environment"
    name      = "VITE_API_URL"
    value     = var.vite_api_url_for_frontend
  }
  setting {
    namespace = "aws:autoscaling:launchconfiguration"
    name      = "IamInstanceProfile"
    # Ważne: Upewnij się, że przekazujesz NAZWĘ profilu instancji, a nie ARN
    value     = var.eb_iam_instance_profile_name
  }
  # Możesz dodać więcej ustawień, np. typ instancji, min/max instancji itp.
}