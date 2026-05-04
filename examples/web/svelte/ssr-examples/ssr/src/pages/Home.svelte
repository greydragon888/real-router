<script lang="ts">
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
</div>
