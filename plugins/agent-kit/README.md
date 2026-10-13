# agent-kit

Engineering guidelines, skills, rules, and subagents for code review, debugging, feature work, commits, pull requests, security audits, and database design.

This plugin is generated from the [agent-kit](https://github.com/zekhoi/claude) catalog. Do not edit it directly.

## Install

```text
/plugin marketplace add zekhoi/claude
/plugin install agent-kit@agent-kit
```

## Contents

Skills: `agent-kit:engineering-guidelines`, `agent-kit:python-rules`, `agent-kit:testing-rules`, `agent-kit:typescript-rules`, `agent-kit:code-review`, `agent-kit:commit`, `agent-kit:database-design`, `agent-kit:debugging`, `agent-kit:documentation`, `agent-kit:feature-implementation`, `agent-kit:pull-request`, `agent-kit:refactoring`, `agent-kit:security-audit`, `agent-kit:test-writing`.

Subagents: `agent-kit:debugger`, `agent-kit:reviewer`.

Plugins cannot load always-on instructions or path-scoped rules, so the core guidelines are the `engineering-guidelines` skill and each rule is a `*-rules` skill that names the files it applies to. For guidelines that load in every session, path-scoped rules, update tracking that preserves your edits, or Codex support, install with the CLI instead: `npx @zekhoi/agent-kit init`. Use one or the other in a project, not both.
