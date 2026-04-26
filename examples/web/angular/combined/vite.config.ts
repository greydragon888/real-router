import angular from "@analogjs/vite-plugin-angular";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [angular({ tsconfig: "./tsconfig.spec.json" })],
  resolve: {
    mainFields: ["module"],
  },
});
