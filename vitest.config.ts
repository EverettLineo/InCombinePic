import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // 领域层是纯 TS，无需 DOM；需要 DOM 的测试单独用 jsdom 环境
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
