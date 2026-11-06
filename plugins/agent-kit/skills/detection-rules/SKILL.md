---
name: detection-rules
description: Write and test detection rules, such as Semgrep or CodeQL queries for vulnerable code patterns and Sigma rules for suspicious log activity, each with true-positive and false-positive samples that prove what the rule catches. Use when the user asks to write a Semgrep, CodeQL, or Sigma rule, a custom static analysis check, or a detection for a vulnerability class or attack pattern. Do not use for finding vulnerabilities by reading code (use agent-kit:security-audit), for configuring a SIEM or deploying rules to production, or for general linting rules without a security purpose.
---

# Detection rules

## 1. Define what to detect

- State the pattern precisely: the vulnerable code shape (for example user input reaching `sql.raw` or `child_process.exec`) or the log behavior (for example many failed logins followed by a success from one IP). Note the languages, frameworks, or log sources it applies to.
- Find the project's existing rules and configuration (`.semgrep/`, `.github/codeql/`, a `sigma/` folder) and follow their layout and naming.

## 2. Write the rule

- **Semgrep:** prefer `mode: taint` with sources and sinks when the risk is data flow; use `pattern-not` and `pattern-inside` to exclude safe forms such as parameterized queries. Include `message`, `severity`, `languages`, and metadata such as CWE.
- **CodeQL:** write a path-problem query using the standard library's sources, sinks, and sanitizers for the language rather than string matching.
- **Sigma:** a `logsource` that matches the user's data, a `detection` with selections and a `condition`, and documented `falsepositives` and `level`.
- Keep rules narrow enough that their findings are worth acting on.

## 3. Test

- Add true-positive samples the rule must flag and false-positive samples it must not (the safe variants), using the tool's test convention (`# ruleid:` and `# ok:` annotations for `semgrep --test`, CodeQL test directories with `.expected` files, sample log events for Sigma).
- Run the tool's tests when it is available locally; run the rule against the project and review the real findings.

## 4. Report

Give the rule, the samples, test results, findings in the project with a judgment of each, known false-positive or false-negative limits, and how to run it in CI.

## Examples

- Use: "Write a Semgrep rule that catches sql.raw with request input." "A Sigma rule for password spraying in our auth logs."
- Skip: "Review this file for SQL injection." (agent-kit:security-audit) "Deploy these rules to our SIEM."
