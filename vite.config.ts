import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
// @ts-expect-error type error without @types/node package
import process from "node:process";
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(() => ({
  plugins: [react()],

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },

  build: {
    // 第三方依赖单独成块：Konva 与 React 体积大、版本变动少，独立分包后可以长期缓存，
    // 也避免应用代码与依赖混在同一个 500 kB 以上的 chunk 里。
    // Rolldown 按 priority 从高到低匹配，未被任何分组捕获的模块仍走自动分包。
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: "konva", test: /node_modules[\\/]konva[\\/]/, priority: 30 },
            {
              name: "react",
              test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/,
              priority: 20,
            },
            { name: "vendor", test: /node_modules[\\/]/, priority: 10 },
          ],
        },
      },
    },
  },
}));
