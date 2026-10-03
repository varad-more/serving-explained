import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";

export default defineConfig(
  {
    ignores: [
      "dist",
      "src/data",
      "test-results",
      "playwright-report",
      "public",
    ],
  },
  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  reactHooks.configs.flat["recommended-latest"],
  {
    // docs/SIM.md §1: the engine is pure and deterministic.
    files: ["src/sim/**"],
    rules: {
      "no-restricted-globals": [
        "error",
        "Date",
        "performance",
        "setTimeout",
        "setInterval",
        "setImmediate",
        "clearTimeout",
        "clearInterval",
        "requestAnimationFrame",
        "queueMicrotask",
        "window",
        "document",
      ],
      "no-restricted-properties": [
        "error",
        { object: "Math", property: "random" },
      ],
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            "react",
            "react-dom",
            "react/*",
            "react-dom/*",
            "**/data/*",
          ],
        },
      ],
    },
  },
  {
    // Tests index arrays they have just checked; `!` keeps them short.
    files: ["tests/**"],
    rules: { "@typescript-eslint/no-non-null-assertion": "off" },
  },
  {
    files: ["**/*.js"],
    extends: [tseslint.configs.disableTypeChecked],
  },
);
