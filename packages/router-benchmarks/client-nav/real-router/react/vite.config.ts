import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "./client-nav/real-router/react/dist",
    emptyOutDir: true,
    minify: false,
    lib: {
      entry: "./client-nav/real-router/react/app.tsx",
      formats: ["es"],
      fileName: "app",
    },
  },
  test: {
    name: "@benchmarks/client-nav (real-router-react)",
    watch: false,
    environment: "jsdom",
    setupFiles: ["./client-nav/vitest.setup.ts"],
  },
});
