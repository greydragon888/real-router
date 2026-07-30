import { useRoute } from "@real-router/solid";
import { createEffect } from "solid-js";
import { isServer } from "solid-js/web";

import { getMetaForState } from "../router/meta";

import type { JSX } from "solid-js";

// Client-side dynamic head updates via Solid `createEffect`.
//
// **HONEST LIMITATION about `@solidjs/meta`**: We installed `@solidjs/meta`
// hoping to use the canonical `<MetaProvider> + <Title> + <Meta>` pattern.
// In Solid 1.9.5 the package's `useAssets`-based asset injection is
// designed for `renderToStream` (streaming SSR), where assets ship as
// separate chunks. With `renderToStringAsync` (this example's SSR mode),
// `useAssets` does NOT reliably surface the `<Title>` / `<Meta>` tags
// in the final HTML output — empirically verified by inspecting the
// SSR response (no extra `<title>` or `<meta>` tags emitted by the
// MetaProvider tree). Server-side head therefore stays on the manual
// `<!--ssr-head-->` injection (renderHeadFor in entry-server.tsx).
//
// For client-side dynamic updates after CSR navigation, we use
// `createEffect` directly — the equivalent low-level pattern. It
// mutates `document.title` and `<meta name="description">` whenever
// the route changes, which is what `@solidjs/meta` would do internally
// on the client anyway. `isServer` guards the effect from running
// during SSR (createEffect doesn't fire on the server but the guard
// makes the contract explicit and prevents `document` access throws if
// the SSR runtime ever changes).
//
// For applications using the **streaming** SSR mode (`renderToStream`,
// see ../../../ssr-examples/ssr-streaming/), `@solidjs/meta` integrates
// cleanly via `useAssets` and `<MetaProvider>` is the canonical pattern.
export function AutoMeta(): JSX.Element {
  if (isServer) {
    return null;
  }

  const routeState = useRoute();

  createEffect(() => {
    const meta = getMetaForState({
      name: routeState().route.name,
      params: routeState().route.params as Record<string, unknown>,
      search: routeState().route.search as Record<string, unknown>,
    });

    document.title = meta.title;

    const descTag = document.querySelector<HTMLMetaElement>(
      'meta[name="description"]',
    );

    if (descTag) {
      descTag.content = meta.description;
    }
  });

  return null;
}
