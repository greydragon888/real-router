<script lang="ts">
  import { RouterProvider, RouteView } from "@real-router/svelte";
  import type { Router } from "@real-router/core";
  import Layout from "../../shared/Layout.svelte";
  import Home from "./pages/Home.svelte";
  import ProductList from "./pages/ProductList.svelte";
  import ProductDetail from "./pages/ProductDetail.svelte";

  let { router }: { router: Router } = $props();

  const links = [
    { routeName: "home", label: "Home" },
    { routeName: "products", label: "Products" },
  ];
</script>

<RouterProvider {router}>
  <Layout title="Real-Router — Data Loading" {links}>
    <RouteView nodeName="">
      {#snippet home()}
        <Home />
      {/snippet}
      {#snippet products()}
        <RouteView nodeName="products">
          {#snippet list()}
            <ProductList />
          {/snippet}
          {#snippet detail()}
            <ProductDetail />
          {/snippet}
        </RouteView>
      {/snippet}
      {#snippet notFound()}
        <h1>404 — Page Not Found</h1>
      {/snippet}
    </RouteView>
  </Layout>
</RouterProvider>
