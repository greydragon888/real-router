<script lang="ts">
  // useRoute() in a CHILD of RouterProvider. 100 active-aware links — each Link
  // subscribes to its own active state, so a navigation recomputes active across
  // all of them. `n` is $derived off the active route name.
  import { Link, useRoute } from "@real-router/svelte";

  import { tabs } from "../../../_shared/links-spec";

  const { route } = useRoute();
  const n = $derived(
    route.current.name.startsWith("tab") ? route.current.name.slice(3) : "",
  );
</script>

<nav>
  {#each tabs as i (i)}
    <Link
      routeName={`tab${i}`}
      activeClassName="active"
      data-testid={`link-tab-${i}`}
    >
      Tab {i}
    </Link>
  {/each}
</nav>
{#if n}
  <main data-testid="page-tab" data-n={n}><h1>Tab {n}</h1></main>
{:else}
  <main data-testid="page-home"><h1>Home</h1></main>
{/if}
