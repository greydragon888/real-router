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
</nav>
{#if routeName.startsWith("items")}
  <ItemsPage />
{:else}
  <p>{routeName}</p>
{/if}
