output "beanstalk_environment_url" {
  description = "The CNAME URL of the Elastic Beanstalk environment"
  value       = aws_elastic_beanstalk_environment.this.cname
}

output "beanstalk_application_name" {
  description = "The name of the Elastic Beanstalk application"
  value       = aws_elastic_beanstalk_application.this.name
}