---
name: kit-terraform
description: Write, change, or review Terraform or OpenTofu configuration following the repository's module layout and conventions, with pinned providers, safe defaults for security and state, and verification by fmt, validate, and plan only. Use when the user asks to add, change, fix, or review Terraform or OpenTofu resources, modules, variables, or providers. Do not use for Kubernetes manifests (use kit-kubernetes), for Pulumi, CloudFormation, or CDK unless asked, or to apply changes to real infrastructure; this skill never runs apply or destroy.
---

# Terraform

Never run `terraform apply`, `destroy`, `import`, `state` subcommands that modify state, or `taint`. Applying is a deployment and needs the user's explicit instruction; leave it to them.

## 1. Learn the layout

- Find root modules and environments (directories, workspaces, or Terragrunt), shared modules, the backend and state configuration, provider and Terraform version constraints, variable conventions, and tagging or naming standards. Follow them.
- Read the resources around the change and any module the change should reuse instead of duplicating.

## 2. Write or review

- Pin `required_version` and providers with `~>` constraints, and commit `.terraform.lock.hcl`.
- Use variables with types, descriptions, and `validation` blocks for inputs; mark secrets `sensitive = true` and never hard-code credentials or secret values.
- Security defaults: storage not public (block public access on buckets), encryption at rest, least-privilege IAM (no `*` actions or resources without a stated reason), security groups without `0.0.0.0/0` on admin ports, logging enabled where the platform supports it.
- Protect stateful resources with `prevent_destroy` or deletion protection where losing them would be costly. Watch for changes that force replacement (renames, changed immutable arguments) and use `moved` blocks when refactoring addresses.
- Use `for_each` over `count` for collections keyed by name, so removing one item does not shift the others.

## 3. Verify

Run `terraform fmt -check` (or `fmt`), `terraform validate`, and the project's linters (`tflint`, `checkov`, `tfsec`) if configured. Run `terraform plan` only when credentials and a non-production backend or environment are available and the user agrees; read the plan for replacements and deletions.

## 4. Report

Summarize resources added, changed, and destroyed or replaced, security-relevant choices, verification results, and the exact plan and apply steps for the user.

## Examples

- Use: "Add an S3 bucket for uploads with encryption." "Review modules/network for security problems." "Why does this plan want to replace the database?"
- Skip: "Write a Helm chart." (kit-kubernetes) "Run terraform apply in prod."
