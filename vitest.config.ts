import { defineConfig, loadEnv } from "vite";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
  test: {
    environment: "node",
    env: loadEnv("test", process.cwd(), ""),
  },
});
