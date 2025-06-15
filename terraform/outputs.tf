output "frontend_url" {
  description = "URL of the frontend application"
  value       = module.frontend_app.beanstalk_environment_url
}

output "api_base_url" {
  description = "Base URL for the API (via ALB)"
  value       = "http://${module.load_balancer.alb_dns_name}/api"
}

output "rds_endpoint" {
  description = "Endpoint for the RDS database"
  value       = module.rds_db.db_instance_endpoint
}