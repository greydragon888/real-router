<script lang="ts">
  import { Link, useRoute } from "@real-router/svelte";

  const ITEMS = [
    { id: "alpha", label: "Alpha", category: "letter" },
    { id: "bravo", label: "Bravo", category: "letter" },
    { id: "one", label: "One", category: "number" },
    { id: "two", label: "Two", category: "number" },
    { id: "red", label: "Red", category: "color" },
    { id: "blue", label: "Blue", category: "color" },
  ];

  type Filter = "all" | "letter" | "number" | "color";
  const FILTERS: Filter[] = ["all", "letter", "number", "color"];

  const { route } = useRoute();

  const filter: Filter = $derived(
    (route.current.search.filter as Filter | undefined) ?? "all",
  );

  const visible = $derived.by(() =>
    filter === "all"
      ? ITEMS
      : ITEMS.filter((item) => item.category === filter),
  );
</script>

<div>
  <h1>Query-only navigation</h1>
  <p>
    Switch a filter — the page-level transition does not
    exit/enter because filter changes are same-route (
    <code>route.name === nextRoute.name</code>) and
    <code>useRouteExit</code>'s default <code>skipSameRoute: true</code>
    short-circuits before the exitToken bumps. The
    <code>{`{#each}`}</code> block re-renders the visible items array
    in place. Svelte does not ship list-layout primitives, so
    individual items do not glide between positions — for that effect
    in Svelte, see <code>page-animations/</code> →
    <code>useListFlip</code>.
  </p>

  <div class="qd-toolbar">
    {#each FILTERS as value}
      <Link
        routeName="queryDemo"
        routeSearch={{ filter: value }}
        ignoreQueryParams={false}
      >
        {value}
      </Link>
    {/each}
  </div>

  <ul class="qd-list">
    {#each visible as item (item.id)}
      <li class="qd-item">
        <strong>{item.label}</strong>
        <span> — {item.category}</span>
      </li>
    {/each}
  </ul>
</div>
