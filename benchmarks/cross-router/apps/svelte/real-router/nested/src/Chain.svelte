<script lang="ts">
  // One layout level of the depth-D chain. Svelte snippet names are static, so
  // intermediate levels use a fixed route name "nx" (path /l{k}) → the snippet is
  // always `nx`; the bottom level owns the a/b nav + switch. Recursion via self-import.
  import { Link, RouteView } from "@real-router/svelte";

  import CatalogItem from "../../../_shared/CatalogItem.svelte";
  import Chain from "./Chain.svelte";

  let {
    level,
    dotted,
    depth,
  }: { level: number; dotted: string; depth: number } = $props();
</script>

{#if level === depth}
  <div class="sec">
    <nav>
      <Link routeName={`${dotted}.a`} data-testid="link-sec-a">A</Link>
      <Link routeName={`${dotted}.b`} data-testid="link-sec-b">B</Link>
    </nav>
    <RouteView nodeName={dotted}>
      {#snippet a()}<CatalogItem n="a" />{/snippet}
      {#snippet b()}<CatalogItem n="b" />{/snippet}
    </RouteView>
  </div>
{:else}
  <div class="lvl">
    <RouteView nodeName={dotted}>
      {#snippet nx()}
        <Chain level={level + 1} dotted={`${dotted}.nx`} {depth} />
      {/snippet}
    </RouteView>
  </div>
{/if}
