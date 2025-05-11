# -- Cognito User Pool & Client --
resource "aws_cognito_user_pool" "app_user_pool" {
  name = "${var.app_name}-user-pool-${random_string.suffix.result}"
  auto_verified_attributes = ["email"]
}

resource "aws_cognito_user_pool_client" "app_client" {
  name         = "${var.app_name}-client"
  user_pool_id = aws_cognito_user_pool.app_user_pool.id

  generate_secret = false
  explicit_auth_flows = [
    "ALLOW_USER_PASSWORD_AUTH",
    "ALLOW_REFRESH_TOKEN_AUTH",
    "ALLOW_USER_SRP_AUTH",
  ]
}