# Provider
terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.0"
    }
  }
}

# Konfiguracja providera
provider "aws" {
  region     = var.aws_region
  access_key = var.aws_access_key_id != "" ? var.aws_access_key_id : null
  secret_key = var.aws_secret_access_key != "" ? var.aws_secret_access_key : null
  token      = var.aws_session_token != "" ? var.aws_session_token : null
}

resource "random_string" "suffix" {
  length  = 6
  special = false
  upper   = false
}

# Pobranie informacji o istniejących zasobach
data "aws_caller_identity" "current" {} # tożsamość 
data "aws_region" "current" {}          # region

# Pobranie domyślenego VPC (Virtual Private Cloud)
data "aws_vpc" "default" {
  default = true
}

# Pobranie listy podsieci należących do VPC
data "aws_subnets" "default" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default.id]
  }
}
