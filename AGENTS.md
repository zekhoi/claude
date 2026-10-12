# Agent Kit development

Instructions for agents working on this repository. Content installed into user projects lives in `registry/`, not here.

- Read `docs/PLAN.md` before changing behavior; it is the source of truth for commands, safety rules, and scope.
- Use pnpm (`corepack pnpm` if pnpm is not installed). Before reporting work as done, run `pnpm -r run typecheck`, `pnpm -r run test`, `pnpm exec eslint .`, and `pnpm exec prettier --check .`.
- Registry source metadata never contains checksums; the build generates them. Run the tests after editing anything in `registry/`; they validate the real registry.
- The core produces plans, the adapter maps and validates destinations, and the writer applies plans. Keep filesystem writes out of the core.
- Never weaken path validation, checksum checks, or conflict handling to make a test pass.
- Write all distributed content and documentation in English.
- Do not publish the package or change release configuration without an explicit instruction.
