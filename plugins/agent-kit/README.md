# agent-kit

Engineering guidelines, skills, rules, and subagents for code review, debugging, feature work, commits, pull requests, security audits, and database design.

This plugin is generated from the [agent-kit](https://github.com/zekhoi/claude) catalog. Do not edit it directly.

## Install

```text
/plugin marketplace add zekhoi/claude
/plugin install agent-kit@agent-kit
```

## Contents

Skills: `agent-kit:engineering-guidelines`, `agent-kit:go-rules`, `agent-kit:python-rules`, `agent-kit:testing-rules`, `agent-kit:typescript-rules`, `agent-kit:attack-surface`, `agent-kit:ci-pipeline`, `agent-kit:ci-triage`, `agent-kit:code-review`, `agent-kit:commit`, `agent-kit:database-design`, `agent-kit:debugging`, `agent-kit:dependency-upgrade`, `agent-kit:design-review`, `agent-kit:detection-rules`, `agent-kit:dockerfile`, `agent-kit:documentation`, `agent-kit:drizzle-review`, `agent-kit:fastapi-api`, `agent-kit:fastify-api`, `agent-kit:feature-implementation`, `agent-kit:go-http-api`, `agent-kit:go-review`, `agent-kit:go-sql-review`, `agent-kit:hardening`, `agent-kit:incident-response`, `agent-kit:kubernetes`, `agent-kit:kysely-review`, `agent-kit:monorepo-change`, `agent-kit:monorepo-package`, `agent-kit:monorepo-release`, `agent-kit:monorepo-review`, `agent-kit:observability`, `agent-kit:orchestrate`, `agent-kit:overengineering-review`, `agent-kit:performance`, `agent-kit:prisma-review`, `agent-kit:pull-request`, `agent-kit:react-component`, `agent-kit:refactoring`, `agent-kit:release-notes`, `agent-kit:security-audit`, `agent-kit:sqlalchemy-review`, `agent-kit:terraform`, `agent-kit:test-writing`, `agent-kit:threat-model`, `agent-kit:vuln-poc`.

Subagents: `agent-kit:architect`, `agent-kit:debugger`, `agent-kit:infra`, `agent-kit:planner`, `agent-kit:reviewer`.

Plugins cannot load always-on instructions or path-scoped rules, so the core guidelines are the `engineering-guidelines` skill and each rule is a `*-rules` skill that names the files it applies to. For guidelines that load in every session, path-scoped rules, update tracking that preserves your edits, or Codex support, install with the CLI instead: `npx @zekhoi/agent-kit init`. Use one or the other in a project, not both.
