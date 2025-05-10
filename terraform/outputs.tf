output "frontend_url" {
  description = "URL of the frontend application"
  value       = "http://${aws_lb.main_alb.dns_name}" # Frontend jest na domyślnej ścieżce "/"
}

output "api_gateway_url" {
  description = "URL of the API Gateway"
  value       = "http://${aws_lb.main_alb.dns_name}/api"
}

output "rds_database_endpoint" {
  description = "Endpoint of the RDS database instance"
  value       = aws_db_instance.app_db.endpoint
}

output "s3_files_bucket_name" {
  description = "Name of the S3 bucket for file storage"
  value       = aws_s3_bucket.app_files_bucket.bucket
}

output "cognito_user_pool_id" {
  description = "ID of the Cognito User Pool"
  value       = aws_cognito_user_pool.app_user_pool.id
}

output "cognito_user_pool_client_id" {
  description = "Client ID of the Cognito User Pool Client"
  value       = aws_cognito_user_pool_client.app_client.id
}

output "notifications_sns_topic_arn" {
  description = "ARN of the SNS topic for notifications"
  value       = aws_sns_topic.notifications_topic.arn
}

output "frontend_eb_url" {
  description = "URL of the frontend application (Elastic Beanstalk)"
  value       = "http://${aws_elastic_beanstalk_environment.frontend_env_eb.cname}"
}

output "api_gateway_fargate_url" { # Zmieniona nazwa dla jasności
  description = "URL of the API Gateway (Fargate via ALB)"
  value       = "http://${aws_lb.main_alb.dns_name}/api"
}