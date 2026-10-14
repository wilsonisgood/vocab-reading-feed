import js from "@eslint/js";
import tseslint from "typescript-eslint";

// 分層規則（AGENT.md §5b-2）：
//   core      不得 import obsidian / services / ui / platform
//   services  只能 import core（透過 ports 存取外部），不得 import ui / platform
//   platform  可以 import obsidian，實作 ports
//   ui        呼叫 services；本規則不強制
const layerRestrictions = [
  {
    files: ["src/core/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [{ name: "obsidian", message: "core/** 不得 import obsidian" }],
          patterns: [
            { group: ["**/services/**"], message: "core/** 不得 import services" },
            { group: ["**/ui/**"], message: "core/** 不得 import ui" },
            { group: ["**/platform/**"], message: "core/** 不得 import platform" },
          ],
        },
      ],
    },
  },
  {
    files: ["src/services/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [{ name: "obsidian", message: "services/** 不得直接 import obsidian，請透過 ports 介面" }],
          patterns: [
            { group: ["**/ui/**"], message: "services/** 不得 import ui" },
            { group: ["**/platform/**"], message: "services/** 不得 import platform，請透過 ports 介面" },
          ],
        },
      ],
    },
  },
];

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: ["main.js", "node_modules/**", "dist/**", ".claude/**", "pipeline/**"],
  },
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
    },
  },
  ...layerRestrictions,
);
