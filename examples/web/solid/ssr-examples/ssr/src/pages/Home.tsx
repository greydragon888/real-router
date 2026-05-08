import { ClientOnly, ServerOnly } from "@real-router/solid";
import { isServer } from "solid-js/web";

import type { JSX } from "solid-js";

export function Home(): JSX.Element {
  return (
    <div>
      <h1>Welcome</h1>
      <p>Real-Router SSR example with Solid and Vite.</p>

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
            Mounted on the client (isServer: {String(isServer)})
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
