<script lang="ts">
  import { RouterProvider, RouteView } from "@real-router/svelte";
  import type { Router } from "@real-router/core";
  import Layout from "../../../shared/Layout.svelte";
  import About from "./pages/About.svelte";
  import Home from "./pages/Home.svelte";
  import Products from "./pages/Products.svelte";
  import QueryDemo from "./pages/QueryDemo.svelte";

  let { router }: { router: Router } = $props();

  const links = [
    { routeName: "home", label: "Home" },
    { routeName: "about", label: "About" },
    { routeName: "products", label: "Products" },
    { routeName: "queryDemo", label: "Query demo" },
  ];
</script>

<RouterProvider {router} viewTransitions>
  <Layout title="Real-Router — View Transitions" {links}>
    <!--
      data-route-root marks the container VT should snapshot. Pseudo-elements
      ::view-transition-old/new target this through the root transition. Keep
      it as the single wrapper around RouteView; nested VT names apply on
      descendants (e.g. product covers for hero morph, product-list for
      per-area scoped transitions).
    -->
    <div data-route-root>
      <RouteView nodeName="">
        {#snippet home()}
          <Home />
        {/snippet}
        {#snippet products()}
          <Products />
        {/snippet}
        {#snippet about()}
          <About />
        {/snippet}
        {#snippet queryDemo()}
          <QueryDemo />
        {/snippet}
        {#snippet notFound()}
          <h1>404 — Page Not Found</h1>
          <p>The page you are looking for does not exist.</p>
        {/snippet}
      </RouteView>
    </div>
  </Layout>
</RouterProvider>
