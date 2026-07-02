<script lang="ts">
  // useRoute() in a CHILD of RouterProvider. Single name-parsing branch (like
  // wide) — the leaf counts the k-params off the active route's params so the
  // driver can confirm the matcher extracted N of them. `count` is $derived, so
  // it recomputes across navigations.
  import { Link, useRoute } from "@real-router/svelte";

  import { PARAM_COUNTS, paramValues } from "../../../_shared/param-spec";

  const { route } = useRoute();
  const count = $derived(
    Object.keys(route.current.params).filter((k) => /^k\d+$/.test(k)).length,
  );
</script>

<nav>
  {#each PARAM_COUNTS as n (n)}
    <Link
      routeName={`p${n}`}
      routeParams={paramValues(n)}
      data-testid={`link-param-${n}`}
    >
      {n}
    </Link>
  {/each}
</nav>
{#if route.current.name.startsWith("p")}
  <main data-testid="page-param" data-count={count}>{count} params</main>
{:else}
  <main data-testid="page-home">Home</main>
{/if}
