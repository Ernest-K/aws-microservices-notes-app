# -- SNS Topic for Notifications --
resource "aws_sns_topic" "notifications_topic" {
  name = "${var.app_name}-notifications-topic-${random_string.suffix.result}"
}

resource "aws_sns_topic_subscription" "email_subscription" {
  topic_arn = aws_sns_topic.notifications_topic.arn
  protocol  = "email"
  endpoint  = var.sns_subscription_email
}