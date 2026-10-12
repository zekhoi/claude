---
paths:
  - "**/*.py"
  - "**/*.pyi"
---

# Python conventions

- Match the project's Python version, formatter, linter, and type checker settings. Do not reformat unrelated code.
- Add type hints to new and changed public functions; keep them consistent with the project's checker (mypy, pyright, or none).
- Use the project's dependency and environment tool (for example uv, Poetry, pip-tools, or pip). Do not add dependencies without saying so.
- Catch specific exceptions. Never use a bare `except:` or silently swallow errors.
- Use context managers for files, locks, connections, and transactions.
- Avoid mutable default arguments.
- Prefer `pathlib` and the standard library over ad hoc string handling where the project already does.
- Do not use `eval`, `exec`, `pickle` on untrusted data, or `shell=True` with untrusted input.
- Run the project's tests and type checker after changes.
