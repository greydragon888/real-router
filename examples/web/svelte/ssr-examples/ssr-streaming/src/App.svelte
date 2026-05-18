<script lang="ts">
  import { Link, RouteView, RouterProvider } from "@real-router/svelte";

  import ProductDetail from "./components/ProductDetail.svelte";
  import ProductsList from "./components/ProductsList.svelte";
  import Home from "./pages/Home.svelte";
  import NotFound from "./pages/NotFound.svelte";

  import type { Router } from "@real-router/core";

  const { router }: { router: Router } = $props();
</script>

<RouterProvider {router}>
  <div>
    <header>
      <nav>
        <Link routeName="home" data-testid="nav-home">Home</Link>
        {" | "}
        <Link routeName="products.list" data-testid="nav-products-list">
          Products
        </Link>
      </nav>
    </header>
    <main>
      <RouteView nodeName="">
        {#snippet home()}
          <Home />
        {/snippet}
        {#snippet products()}
          <RouteView nodeName="products">
            {#snippet list()}
              <ProductsList />
            {/snippet}
            {#snippet detail()}
              <ProductDetail />
            {/snippet}
          </RouteView>
        {/snippet}
        {#snippet notFound()}
          <NotFound />
        {/snippet}
      </RouteView>
    </main>
  </div>
</RouterProvider>
