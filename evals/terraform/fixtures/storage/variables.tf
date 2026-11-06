variable "region" {
  type        = string
  description = "AWS region"
  default     = "us-east-1"
}

variable "env" {
  type        = string
  description = "Deployment environment"

  validation {
    condition     = contains(["dev", "staging", "prod"], var.env)
    error_message = "env must be dev, staging, or prod."
  }
}
