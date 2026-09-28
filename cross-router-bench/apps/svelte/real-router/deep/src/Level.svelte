<script lang="ts">
  // One nested layout level. `self` renders the leaf (CatalogItem) when this
  // level is terminal; the dynamic `l{k+1}` segment snippet recurses one level
  // deeper. Svelte snippet declarations are static, so the deeper snippet is
  // passed under its computed segment key via spread. Self-import gives the
  // recursion (svelte:self is deprecated in Svelte 5).
  import { RouteView } from "@real-router/svelte";

  import CatalogItem from "../../../_shared/CatalogItem.svelte";
  import Level from "./Level.svelte";

  let { k, name }: { k: number; name: string } = $props();
</script>

{#snippet leaf()}
  <CatalogItem n={String(k)} />
{/snippet}
{#snippet deeper()}
  <Level k={k + 1} name={`${name}.l${k + 1}`} />
{/snippet}

<div class="lvl">
  <RouteView nodeName={name} self={leaf} {...{ [`l${k + 1}`]: deeper }} />
</div>
