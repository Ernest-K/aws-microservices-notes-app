# -- S3 Bucket for Files Service --
resource "aws_s3_bucket" "app_files_bucket" {
  bucket = "${var.app_name}-files-${random_string.suffix.result}"
}

resource "aws_s3_bucket_public_access_block" "app_files_bucket_access_block" {
  bucket = aws_s3_bucket.app_files_bucket.id
}

resource "aws_s3_bucket_ownership_controls" "app_files_bucket_ownership" {
  bucket = aws_s3_bucket.app_files_bucket.id
  rule {
    object_ownership = "BucketOwnerPreferred"
  }
}

resource "aws_s3_bucket_acl" "app_files_bucket_acl" {
  bucket = aws_s3_bucket.app_files_bucket.id
  acl    = "public-read-write"

  depends_on = [
    aws_s3_bucket_ownership_controls.app_files_bucket_ownership,
    aws_s3_bucket_public_access_block.app_files_bucket_access_block,
  ]
}

resource "aws_s3_bucket" "eb_app_versions_frontend" {
  bucket = "${var.app_name}-eb-frontend-versions-${random_string.suffix.result}"
}