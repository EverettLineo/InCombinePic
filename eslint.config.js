import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

/**
 * 架构边界在此固化为构建期错误（docs/ARCHITECTURE.md §1）。
 * 目的：让"违反分层"在 lint 阶段就失败，而不是靠人记住。
 */

const MSG_KONVA = "Konva 只允许在 src/features/scene 中使用（架构文档 §1 规则 2）";
const MSG_IPC = "IPC 只允许通过 src/platform 调用（架构文档 §1 规则 3）";
const MSG_DOMAIN =
  "domain 层必须保持纯净：禁止依赖 React / Konva / IPC / features（架构文档 §1 规则 1）";

export default tseslint.config(
  {
    ignores: ["dist/**", "node_modules/**", "src-tauri/**", "docs/**", "*.config.js"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.browser },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/consistent-type-imports": "warn",
    },
  },

  // 边界 2：scene 之外一律禁止 Konva
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/features/scene/**"],
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          paths: [{ name: "konva", message: MSG_KONVA }],
          patterns: [{ group: ["konva/*", "konva/lib/*"], message: MSG_KONVA }],
        },
      ],
    },
  },

  // 边界 3：platform 之外一律禁止直接调用 IPC
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/platform/**"],
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          patterns: [{ group: ["@tauri-apps/*"], message: MSG_IPC }],
        },
      ],
    },
  },

  // 边界 1：domain 纯净（放在最后，覆盖上面的通用规则）
  {
    files: ["src/domain/**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          paths: [
            { name: "konva", message: MSG_DOMAIN },
            { name: "react", message: MSG_DOMAIN },
            { name: "react-dom", message: MSG_DOMAIN },
            { name: "@tauri-apps/api", message: MSG_DOMAIN },
          ],
          patterns: [
            { group: ["konva/*", "konva/lib/*"], message: MSG_DOMAIN },
            { group: ["react/*", "react-dom/*"], message: MSG_DOMAIN },
            { group: ["@tauri-apps/*"], message: MSG_DOMAIN },
            { group: ["**/features/*", "**/features/**"], message: MSG_DOMAIN },
          ],
        },
      ],
    },
  },
);
