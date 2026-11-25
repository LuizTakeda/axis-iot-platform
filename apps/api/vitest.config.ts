import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
      "@plugins": path.resolve(import.meta.dirname, "./src/plugins"),
      "@routes": path.resolve(import.meta.dirname, "./src/routes"),
      "@generated": path.resolve(import.meta.dirname, "./generated"),
    },
  },
  test: {
    environment: "node",
  },
});
