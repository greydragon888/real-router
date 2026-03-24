<script lang="ts">
  import { RouterProvider, RouteView } from "@real-router/svelte";
  import type { Router } from "@real-router/core";
  import Layout from "../../shared/Layout.svelte";
  import Home from "./pages/Home.svelte";
  import ProductDetail from "./pages/ProductDetail.svelte";
  import About from "./pages/About.svelte";

  let { router }: { router: Router } = $props();

  const links = [
    { routeName: "home", label: "Home" },
    { routeName: "products", label: "Products" },
    { routeName: "about", label: "About" },
  ];
</script>

<RouterProvider {router}>
  <Layout title="Real-Router — Link Action" {links}>
    <RouteView nodeName="">
      {#snippet home()}
        <Home />
      {/snippet}
      {#snippet products()}
        <RouteView nodeName="products">
          {#snippet detail()}
            <ProductDetail />
          {/snippet}
          {#snippet notFound()}
            <Home />
          {/snippet}
        </RouteView>
      {/snippet}
      {#snippet about()}
        <About />
      {/snippet}
      {#snippet notFound()}
        <h1>404 — Page Not Found</h1>
      {/snippet}
    </RouteView>
  </Layout>
</RouterProvider>
