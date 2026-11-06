terraform {
  required_providers {
    aws = {
      source = "hashicorp/aws"
    }
  }
}

variable "admin_users" {
  type    = list(string)
  default = ["ana", "ben", "chloe"]
}

resource "aws_security_group" "bastion" {
  name   = "bastion"
  vpc_id = "vpc-0123456789abcdef0"

  ingress {
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_iam_user" "admin" {
  count = length(var.admin_users)
  name  = var.admin_users[count.index]
}

resource "aws_iam_user_policy" "admin" {
  count = length(var.admin_users)
  user  = aws_iam_user.admin[count.index].name
  policy = jsonencode({
    Version   = "2012-10-17"
    Statement = [{ Effect = "Allow", Action = "*", Resource = "*" }]
  })
}

resource "aws_db_instance" "main" {
  identifier          = "main"
  engine              = "postgres"
  instance_class      = "db.t4g.medium"
  allocated_storage   = 50
  username            = "app"
  password            = "SuperSecret123!"
  publicly_accessible = true
  skip_final_snapshot = true
}
