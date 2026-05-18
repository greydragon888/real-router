<script lang="ts">
  import { ClientOnly, ServerOnly } from "@real-router/svelte/ssr";

  import { useClock } from "../utils/clock.svelte";

  // createSubscriber demo: SSR ships the initial server timestamp;
  // client-side, the subscriber sets up a 1s interval and the value
  // updates reactively. See clock.svelte.ts for the full rationale.
  const clock = useClock();
</script>

<svelte:head>
  <title>Home — Real-Router Svelte SSR</title>
  <meta
    name="description"
    content="Welcome to the Real-Router SSR example with Svelte 5 and Vite."
  />
</svelte:head>

<div>
  <h1>Welcome</h1>
  <p>Real-Router SSR example with Svelte 5 and Vite.</p>
  <p>
    Server time:
    <time data-testid="clock" datetime={clock().toISOString()}>
      {clock().toISOString()}
    </time>
  </p>

  <!-- Dogfooding: <ClientOnly> + <ServerOnly> SSR boundaries. -->
  <section aria-labelledby="ssr-boundaries-heading">
    <h2 id="ssr-boundaries-heading">SSR boundaries</h2>
    <ClientOnly>
      {#snippet children()}
        <p data-testid="ssr-boundaries-client">
          Mounted on the client
        </p>
      {/snippet}
      {#snippet fallback()}
        <p data-testid="ssr-boundaries-client-fallback">
          Loading client widget…
        </p>
      {/snippet}
    </ClientOnly>
    <ServerOnly>
      {#snippet children()}
        <p data-testid="ssr-boundaries-server">
          Server-only content (e.g. SEO meta, zero-JS notice)
        </p>
      {/snippet}
      {#snippet fallback()}
        <p data-testid="ssr-boundaries-server-fallback">
          Hidden after hydration
        </p>
      {/snippet}
    </ServerOnly>
  </section>
</div>
