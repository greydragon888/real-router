<script lang="ts">
  import { Link, useRoute } from "@real-router/svelte";
  import { useListFlip } from "../use-list-flip.svelte";
  import { useRouteAnimation } from "../use-route-animation.svelte";

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

  let ref: HTMLDivElement | undefined = $state();
  let listRef: HTMLUListElement | undefined = $state();

  useRouteAnimation(() => ref, { entryClass: "fade-in", exitClass: "fade-out" });
  useListFlip(() => listRef);

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

<div bind:this={ref}>
  <h1>Query-only navigation</h1>
  <p>
    Click a filter — the page itself does not fade because the
    composable's default <code>skipSameRoute: true</code> short-circuits
    when <code>route.name === nextRoute.name</code>. Three coordinated
    WAAPI animations play instead, all driven by
    <code>useListFlip</code>: survivors translate from old to new
    positions (inverse-FLIP from a <code>getBoundingClientRect</code>
    diff in <code>$effect</code>); newly-visible items fade in; items
    removed by a narrowing filter fade out via cloned ghosts
    reconstructed from <code>outerHTML</code> and pinned at their
    last-known rect. View-local — no router events, no shared state
    between components.
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

  <ul class="qd-list" bind:this={listRef}>
    {#each visible as item (item.id)}
      <li data-flip-key={item.id} class="qd-item">
        <strong>{item.label}</strong>
        <span> — {item.category}</span>
      </li>
    {/each}
  </ul>
</div>
