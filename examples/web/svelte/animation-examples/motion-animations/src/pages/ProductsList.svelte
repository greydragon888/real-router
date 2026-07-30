<script lang="ts">
  import { Link, useRoute } from "@real-router/svelte";

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

<h1>Products</h1>
<p>
  Click a product card to see the page-level transition: the list
  slides out, the detail page slides in. There is no library
  layoutId hero morph in this Svelte example — Svelte's built-in
  transitions are per-element only. For cross-component hero morphs
  in Svelte, see <code>route-animations/</code> →
  <code>useHeroMorph</code>.
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

<ul class="product-list">
  {#each items as product (product.id)}
    <li class="product-card">
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
