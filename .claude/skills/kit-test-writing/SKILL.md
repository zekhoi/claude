---
name: kit-test-writing
description: Write tests for existing code using the project's test framework and conventions, covering behavior, edge cases, and failure paths. Use when the user asks to add tests, improve test coverage, or write tests for a specific module or function. Do not use for fixing failing tests (use kit-debugging) or for implementing new behavior; this skill does not change the code under test.
---

# Writing tests

Test the code as it is. Do not change the code under test unless the user asks.

## 1. Learn the project's testing setup

- Find the test framework, runner command, file locations, naming patterns, helpers, and fixtures already in use. Read a few existing tests and match their style.
- If the project has no tests, use the framework its tooling implies (for example the `test` script in `package.json`, or `pytest` configuration). If nothing is set up, propose a minimal setup and ask before adding dependencies.

## 2. Decide what to test

- Read the code and its callers to learn the intended behavior: inputs, outputs, errors, and side effects.
- Cover typical cases, boundaries (empty, zero, one, maximum, unusual characters), invalid input and error paths, and important interactions.
- Test observable behavior through the public interface. Avoid asserting on private details or mocking what can be used directly.

## 3. Write and run the tests

- Give each test a descriptive name and one reason to fail. Keep tests deterministic and independent.
- Run the new tests and the existing suite.
- If a test reveals that the code does not do what its documentation, types, or callers expect, do not weaken the test to make it pass and do not silently fix the code. Report the discrepancy with the failing case, and either leave the test out or mark it with the project's skip or expected-failure convention, as the user prefers.

## 4. Report

List the tests added and what each covers, the commands run and their results, and any suspected bugs found.

## Examples

- Use: "Add tests for src/slugify.js." "Our date utilities have no tests; cover them."
- Skip: "The checkout test is failing." (use kit-debugging) "Add a slug uniqueness check." (feature work)
