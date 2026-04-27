<script lang="ts">
  import { RouteView } from "@real-router/svelte";

  import ProductDetail from "./ProductDetail.svelte";
  import ProductsList from "./ProductsList.svelte";
</script>

<div>
  <!--
    Persistent shell — h1 and intro stay mounted across
    /products ↔ /products/:id navigations. The `products` route IS the list
    (no synthetic `list` child / `forwardTo`); only `detail` is a real
    descendant. The `self` snippet renders ProductsList when the active
    route is `products` itself; the `detail` snippet renders ProductDetail
    when /products/:id is active.
  -->
  <h1>Products</h1>
  <p>
    Click a product card to see the hero-morph transition. The colored
    square on the card smoothly morphs into the large cover on the detail
    page via matching <code>view-transition-name</code>.
  </p>

  <RouteView nodeName="products">
    {#snippet self()}
      <ProductsList />
    {/snippet}
    {#snippet detail()}
      <ProductDetail />
    {/snippet}
  </RouteView>
</div>
