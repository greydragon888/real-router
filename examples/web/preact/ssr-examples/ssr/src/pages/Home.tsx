import { ClientOnly, ServerOnly } from "@real-router/preact";
import { lazy, Suspense } from "preact/compat";

import { SearchForm } from "../components/SearchForm";

import type { JSX } from "preact";

// Code-split via dynamic import. Combined with `renderToStringAsync`
// in entry-server.tsx, the import is awaited before the final HTML
// is returned — Tagline renders inline, not as a deferred island.
// This is the Preact-only "async-single-shot" SSR path: simpler
// pipeline than renderToReadableStream, no chunked transfer, the
// entire document caches as one CDN object.
const Tagline = lazy(() => import("../components/Tagline"));

export function Home(): JSX.Element {
  return (
    <div>
      <h1>Welcome</h1>
      <p>Real-Router SSR example with Preact and Vite.</p>

      <Suspense fallback={<p data-testid="tagline-fallback">…</p>}>
        <Tagline />
      </Suspense>

      <SearchForm />

      {/* Dogfooding: <ClientOnly> + <ServerOnly> SSR boundaries. */}
      <section aria-labelledby="ssr-boundaries-heading">
        <h2 id="ssr-boundaries-heading">SSR boundaries</h2>
        <ClientOnly
          fallback={
            <p data-testid="ssr-boundaries-client-fallback">
              Loading client widget…
            </p>
          }
        >
          <p data-testid="ssr-boundaries-client">
            Mounted on the client (window: {String(typeof window !== "undefined")})
          </p>
        </ClientOnly>
        <ServerOnly
          fallback={
            <p data-testid="ssr-boundaries-server-fallback">
              Hidden after hydration
            </p>
          }
        >
          <p data-testid="ssr-boundaries-server">
            Server-only content (e.g. SEO meta, zero-JS notice)
          </p>
        </ServerOnly>
      </section>
    </div>
  );
}
