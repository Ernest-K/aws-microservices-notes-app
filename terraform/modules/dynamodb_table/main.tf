resource "aws_dynamodb_table" "this" {
  name         = "${var.table_name_prefix}-${var.random_suffix}"
  billing_mode = var.billing_mode
  hash_key     = var.hash_key_name
  range_key    = var.range_key_name # Będzie null, jeśli nie podano

  dynamic "attribute" {
    for_each = var.attributes
    content {
      name = attribute.value.name
      type = attribute.value.type
    }
  }

  # Można dodać bloki dynamiczne dla global_secondary_index, local_secondary_index
}