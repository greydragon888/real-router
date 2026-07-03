---
"@real-router/ssr-data-plugin": patch
---

Keep the server-only defer wire-format out of the client `.` bundle (#761)

`shared/ssr/deferRegistry.ts` is split into `deferRegistryClient.ts` (client hydration — `ensureRegistryPromise` + the registry global) and `deferWireFormat.ts` (server-only `escapeForScript` / `formatSettleScript` / `getDeferBootstrapScript`, plus their module-level `RegExp` / `Object.fromEntries` initialisers the bundler cannot prove pure). `createSsrLoaderPlugin` now imports only the client module, so the chunk behind `dist/esm/index.mjs` sheds the ~600–800 B of server-only wire-format that used to ride along. Public API and runtime behavior are unchanged — the wire-format still ships from `@real-router/ssr-data-plugin/server`.
