<script lang="ts">
  import { Link, useRoute } from "@real-router/svelte";

  const COVERS: Partial<Record<string, { name: string; color: string }>> = {
    1: { name: "Crimson Flask", color: "#b91c1c" },
    2: { name: "Azure Orb", color: "#1d4ed8" },
    3: { name: "Emerald Prism", color: "#047857" },
    4: { name: "Amber Cube", color: "#b45309" },
    5: { name: "Violet Sphere", color: "#6d28d9" },
    6: { name: "Slate Block", color: "#334155" },
  };

  const { route } = useRoute<{ id: string }>();
  const id = $derived(route.current.params.id ?? "1");
  const product = $derived(COVERS[id]);
</script>

{#if product}
  <div>
    <h2>{product.name}</h2>
    <div
      class="product-cover"
      style="background-color: {product.color};"
      aria-hidden="true"
    ></div>
    <p>
      Note: no library-driven hero morph here. Svelte's built-in
      transitions are per-element entry/exit only — they do not pair
      elements across the route boundary. For an inverse-FLIP hero
      morph in Svelte, see <code>route-animations/</code> →
      <code>useHeroMorph</code>: capture rect on
      <code>useRouteExit</code>, animate via WAAPI on
      <code>navigator.subscribe</code>.
    </p>
    <p>
      <Link routeName="products" activeStrict>
        ← Back to products
      </Link>
    </p>
  </div>
{:else}
  <div>
    <h2>Unknown product</h2>
    <Link routeName="products" activeStrict>
      Back to products
    </Link>
  </div>
{/if}
