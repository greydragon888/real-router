<script lang="ts">
  import { Link } from "@real-router/svelte";
</script>

<section data-testid="home-page">
  <h1>Streaming SSR Example</h1>
  <p>
    Demonstrates Svelte 5 async SSR with <code>{"<svelte:boundary>"}</code>
    + <code>{`{#await}`}</code> blocks for deferred data — wired through
    <code>@real-router/ssr-data-plugin</code> with
    <strong>zero router-specific streaming API</strong>.
  </p>
  <p>
    <Link routeName="products.list" data-testid="nav-products">
      Browse products
    </Link>
  </p>
</section>
