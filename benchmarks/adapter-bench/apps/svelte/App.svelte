<script lang="ts">
  import { Link, useRoute } from "@real-router/svelte";

  import ItemsPage from "./ItemsPage.svelte";
  import RootSubscriber from "./RootSubscriber.svelte";

  const indices = [0, 1, 2, 3, 4];
  const ctx = useRoute();
  const routeName = $derived(ctx.route.current.name);
</script>

{#each indices as i (i)}
  <RootSubscriber index={i} />
{/each}
<nav>
  {#each indices as i (i)}
    <Link
      routeName="items"
      routeParams={{ id: String(i + 1) }}
      activeClassName="active"
    >
      Items {i + 1}
    </Link>
  {/each}
  <Link routeName="home" activeClassName="active">Home</Link>
  <Link routeName="about" activeClassName="active">About</Link>
  <Link
    routeName="items.details"
    routeParams={{ id: "1" }}
    activeClassName="active"
  >
    Details 1
  </Link>
  <!-- routeSearch active-recompute panel (RFC-4 M2 / #1548): 5 tab Links on the
       same route, distinguished ONLY by query; ignoreQueryParams=false → a
       query-only swap recomputes active for all five. -->
  {#each indices as i (`tab${i}`)}
    <Link
      routeName="search"
      routeSearch={{ tab: `t${i}` }}
      ignoreQueryParams={false}
      activeClassName="active"
    >
      Tab {i}
    </Link>
  {/each}
</nav>
{#if routeName.startsWith("items")}
  <ItemsPage />
{:else}
  <p>{routeName}</p>
{/if}
