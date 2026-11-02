import rsc from "@vitejs/plugin-rsc";
import { defineConfig } from "vite";

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
  build: {
    rolldownOptions: {
      // The client and ssr builds keep `"use client"` as an inert directive and
      // rolldown warns about it; the rsc build turns it into client references.
      // `@vitejs/plugin-react` drops the same warning, and this config does not
      // load that plugin.
      onLog(level, log, defaultHandler) {
        if (
          log.code === "MODULE_LEVEL_DIRECTIVE" &&
          log.message.includes('"use client"')
        ) {
          return;
        }

        defaultHandler(level, log);
      },
    },
  },
});
