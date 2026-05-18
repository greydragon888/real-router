<script setup lang="ts">
import { Link } from "@real-router/vue";
</script>

<template>
  <section data-testid="home-page">
    <h1>Streaming SSR Example</h1>
    <p>
      Demonstrates Vue 3 streaming SSR with
      <code>renderToWebStream</code>, <code>&lt;Suspense&gt;</code> boundaries,
      and <code>async setup()</code> for deferred data — wired through
      <code>@real-router/ssr-data-plugin</code> with
      <strong>zero router-specific streaming API</strong>.
    </p>
    <p>
      <Link routeName="products.list" data-testid="nav-products">
        Browse products
      </Link>
    </p>
  </section>
</template>
