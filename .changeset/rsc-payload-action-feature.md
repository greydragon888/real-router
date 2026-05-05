---
"@real-router/rsc-server-plugin": minor
---

Add `RscPayload<TReturn, TFormState>` type + `rscActionPluginFactory` for Server Action integration (#593)

The plugin gains two complementary pieces:

- **`RscPayload<TReturn, TFormState>`** — canonical Flight payload shape (`{ root: ReactNode } & RscActionResult`). Single source of truth used by both producer (rsc entry) and consumers (ssr + browser entries) — eliminates ad-hoc duplication of the same interface in multiple files.
- **`rscActionPluginFactory(getResult)`** — sibling plugin that claims the `"rscAction"` namespace. Publishes `{ returnValue?, formState? }` to `state.context.rscAction` via the `start` interceptor; coexists with `rscServerPluginFactory` (`"rsc"`) and `ssrDataPluginFactory` (`"data"`) on the same router.

Use case: Server Action results computed in the RSC fetch handler (via `decodeAction` / `loadServerAction` / `decodeReply`) become part of router state and can be read by any Server Component during the post-action render — eliminates prop-drilling for cross-page action result UI.

```ts
let actionResult: RscActionResult | undefined;
if (request.method === "POST") {
  // ... execute action ...
  actionResult = { returnValue: { ok: true, data: ... } };
}

router.usePlugin(
  rscServerPluginFactory(loaders),
  rscActionPluginFactory(() => actionResult),
);

const state = await router.start(pathname);
// state.context.rsc       — ReactNode tree
// state.context.rscAction — { returnValue?, formState? }
```

Verified by 12 new functional tests covering write semantics, composition with `rscServerPluginFactory`, namespace collision detection, and teardown.
