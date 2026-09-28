<script lang="ts">
  // Links must live inside RouterProvider (they read router context). On the
  // mount-links click, 1000 <Link>s render at once — each builds its href via
  // the router's reverse-matcher. The last link carries testid="last-link" so
  // the driver knows the whole batch committed.
  import { Link } from "@real-router/svelte";

  const _n = Number(new URLSearchParams(globalThis.location?.search ?? "").get("n"));
  const COUNT = _n > 0 ? _n : 1000;
  const items: number[] = Array.from({ length: COUNT }, (_, i) => i);

  let show = $state(false);
</script>

<button data-testid="mount-links" onclick={() => (show = true)}>mount</button>
<main data-testid="page-ready">{show ? "shown" : "idle"}</main>
{#if show}
  <nav>
    {#each items as i (i)}
      <Link
        routeName={`r${i}`}
        data-testid={i === COUNT - 1 ? "last-link" : undefined}
      >
        r{i}
      </Link>
    {/each}
  </nav>
{/if}
