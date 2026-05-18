import { ClientOnly, ServerOnly } from "@real-router/react/ssr";

import { SearchForm } from "../components/SearchForm";

export function Home(): React.JSX.Element {
  return (
    <div>
      <h1>Welcome</h1>
      <p>Real-Router SSR example with React and Vite.</p>

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
