<script lang="ts">
  import { Link, useRoute } from "@real-router/svelte";

  import type { ProductsListData } from "../router/loaders";

  const EMPTY_DATA: ProductsListData = { products: [] };

  const { route } = useRoute();
  const data = $derived(
    (route.current.context.data as ProductsListData | undefined) ?? EMPTY_DATA,
  );
</script>

<section data-testid="products-list">
  <h1>Products</h1>
  <ul>
    {#each data.products as product (product.id)}
      <li data-product-id={product.id}>
        <Link routeName="products.detail" routeParams={{ id: product.id }}>
          {product.name}
        </Link>
        {" — $"}{product.price}
      </li>
    {/each}
  </ul>
</section>
