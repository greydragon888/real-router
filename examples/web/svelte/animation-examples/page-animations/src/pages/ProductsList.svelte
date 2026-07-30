<script lang="ts">
  import { Link, useRoute } from "@real-router/svelte";
  import { useListFlip } from "../use-list-flip.svelte";
  import { useRouteAnimation } from "../use-route-animation.svelte";

  interface Product {
    id: string;
    name: string;
    color: string;
  }

  const PRODUCTS: Product[] = [
    { id: "1", name: "Crimson Flask", color: "#b91c1c" },
    { id: "2", name: "Azure Orb", color: "#1d4ed8" },
    { id: "3", name: "Emerald Prism", color: "#047857" },
    { id: "4", name: "Amber Cube", color: "#b45309" },
    { id: "5", name: "Violet Sphere", color: "#6d28d9" },
    { id: "6", name: "Slate Block", color: "#334155" },
  ];

  type SortDirection = "asc" | "desc";

  let ref: HTMLDivElement | undefined = $state();
  let listRef: HTMLUListElement | undefined = $state();

  useRouteAnimation(() => ref, {
    entryClass: "slide-in",
    exitClass: "slide-out",
  });

  useListFlip(() => listRef);

  const { route } = useRoute();

  const sort: SortDirection = $derived(
    route.current.search.sort === "desc" ? "desc" : "asc",
  );

  const items = $derived.by(() => {
    const sorted = PRODUCTS.toSorted((left, right) =>
      left.name.localeCompare(right.name),
    );

    return sort === "desc" ? sorted.toReversed() : sorted;
  });
</script>

<div bind:this={ref}>
  <h1>Products</h1>
  <p>
    Click a product to see the detail. Each page (this list and the
    detail) registers its own <code>useRouteAnimation</code> composable
    on its wrapper — slide-out for the list's exit, fade-in for the
    detail's entry, no shared shell, no centralised policy.
  </p>

  <div class="products-toolbar">
    <span>Sort:</span>
    <Link
      routeName="products"
      routeSearch={{ sort: "asc" }}
      ignoreQueryParams={false}
    >
      A → Z
    </Link>
    {" · "}
    <Link
      routeName="products"
      routeSearch={{ sort: "desc" }}
      ignoreQueryParams={false}
    >
      Z → A
    </Link>
    {" · "}
    <strong>current: {sort}</strong>
  </div>

  <ul class="product-list" bind:this={listRef}>
    {#each items as product (product.id)}
      <li data-flip-key={product.id} class="product-card">
        <Link routeName="products.detail" routeParams={{ id: product.id }}>
          <span
            class="product-thumb"
            style="background-color: {product.color};"
            aria-hidden="true"
          ></span>
          <span class="product-name">{product.name}</span>
        </Link>
      </li>
    {/each}
  </ul>
</div>
