import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "./vs-tanstack/navigation-churn/tanstack/react/dist",
    emptyOutDir: true,
    minify: false,
    lib: {
      entry: "./vs-tanstack/navigation-churn/tanstack/react/app.tsx",
      formats: ["es"],
      fileName: "app",
    },
  },
  test: {
    name: "@benchmarks/vs-tanstack (navigation-churn tanstack-react)",
    watch: false,
    environment: "jsdom",
    setupFiles: ["./vs-tanstack/shared/vitest.setup.ts"],
  },
});
