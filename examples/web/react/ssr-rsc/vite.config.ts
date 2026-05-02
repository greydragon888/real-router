import { defineConfig } from "vite";
import rsc from "@vitejs/plugin-rsc";

export default defineConfig({
  plugins: [
    rsc({
      // (C7) Express owns request routing — disable plugin's default middleware.
      serverHandler: false,
      // (C1) entries.rsc must be a module with default export { fetch } or a bare async function.
      entries: {
        client: "./src/entry.browser.tsx",
        ssr: "./src/entry.ssr.tsx",
        rsc: "./src/entry.rsc.tsx",
      },
    }),
  ],
});
