resource "aws_sns_topic" "this" {
  name = "${var.topic_name_prefix}-${var.random_suffix}"
}

resource "aws_sns_topic_subscription" "this" {
  count = var.subscription_protocol != null && var.subscription_endpoint != null ? 1 : 0

  topic_arn = aws_sns_topic.this.arn
  protocol  = var.subscription_protocol
  endpoint  = var.subscription_endpoint
}