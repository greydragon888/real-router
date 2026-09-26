---
"@real-router/solid": patch
---

Share one copy of the router contexts between `.` and `/ssr`, and publish the source under a `solid` export condition so SSR builds can import the package (#2583)

- `useDeferred` and `<Await>` from `@real-router/solid/ssr` threw `useRoute must be used within a RouterProvider` inside a `RouterProvider`, through `import` and `require` alike: the two entries were bundled separately, and `/ssr` carried its own copy of the contexts. Both entries are now built together and share one chunk.
- An SSR build with `vite-plugin-solid({ ssr: true })` that imported the package threw `Client-only API called on the server side` at module load, because the published code is compiled for the DOM. The package now also publishes its JSX source under the `solid` export condition; `vite-plugin-solid` resolves it, bundles it into the SSR build and compiles it for the app's own target — server, hydrating client or plain DOM. No `resolve.conditions` or `ssr.noExternal` entry is needed for the adapter.
- Bundlers without a Solid compiler keep resolving `import` / `require`, whose entry files keep their paths. No API change.
