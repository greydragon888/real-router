import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "./vs-tanstack/real-router/react/dist",
    emptyOutDir: true,
    minify: false,
    lib: {
      entry: "./vs-tanstack/real-router/react/app.tsx",
      formats: ["es"],
      fileName: "app",
    },
  },
  test: {
    name: "@benchmarks/vs-tanstack (real-router-react)",
    watch: false,
    environment: "jsdom",
    setupFiles: ["./vs-tanstack/vitest.setup.ts"],
  },
});
