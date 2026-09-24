<script lang="ts">
  import { RouterProvider, RouteView } from "@real-router/svelte";

  import Home from "./pages/Home.svelte";
  import Products from "./pages/Products.svelte";
  import Layout from "../../shared/Layout.svelte";

  import type { Router } from "@real-router/core";

  let { router }: { router: Router } = $props();

  const links = [
    { routeName: "home", label: "Home" },
    { routeName: "products", label: "Products" },
  ];
</script>

<RouterProvider {router}>
  <Layout title="Real-Router — Search Schema" {links}>
    <RouteView nodeName="">
      {#snippet home()}
        <Home />
      {/snippet}
      {#snippet products()}
        <Products />
      {/snippet}
      {#snippet notFound()}
        <h1>404 — Page Not Found</h1>
      {/snippet}
    </RouteView>
  </Layout>
</RouterProvider>
