<script lang="ts">
  import { RouterProvider, RouteView } from "@real-router/svelte";
  import type { Router } from "@real-router/core";
  import Layout from "../../../shared/Layout.svelte";
  import About from "./pages/About.svelte";
  import Home from "./pages/Home.svelte";
  import ProductDetail from "./pages/ProductDetail.svelte";
  import ProductsList from "./pages/ProductsList.svelte";
  import QueryDemo from "./pages/QueryDemo.svelte";

  let { router }: { router: Router } = $props();

  const links = [
    { routeName: "home", label: "Home" },
    { routeName: "about", label: "About" },
    { routeName: "products", label: "Products" },
    { routeName: "queryDemo", label: "Query demo" },
  ];
</script>

<RouterProvider {router}>
  <Layout title="Real-Router — Page Animations" {links}>
    <RouteView nodeName="">
      {#snippet home()}
        <Home />
      {/snippet}
      {#snippet products()}
        <RouteView nodeName="products">
          {#snippet self()}
            <ProductsList />
          {/snippet}
          {#snippet detail()}
            <ProductDetail />
          {/snippet}
        </RouteView>
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
  </Layout>
</RouterProvider>
