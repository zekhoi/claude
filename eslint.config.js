import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    // Eval fixtures contain deliberate defects for skills to find.
    ignores: ["**/dist/**", "**/node_modules/**", "**/coverage/**", "evals/*/fixtures/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
);
