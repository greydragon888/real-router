<script lang="ts">
  import { Router, type RouteConfig } from "@mateothegreat/svelte5-router";

  import CatalogItem from "../../../_shared/CatalogItem.svelte";
  import { DEEP_DEPTH } from "../../../_shared/deep-spec";
  import DeepLevel from "./DeepLevel.svelte";

  // base = path matched so far (e.g. "/deep/l1/l2"); k = number of l-segments
  // matched (0 at "/deep"). A nested <Router basePath={base}> matches the next
  // segment /l{k+1} → deeper DeepLevel; when base === the current path (terminal)
  // it falls to the no-path leaf route → CatalogItem n=k. Exactly one page-item
  // (the deepest) is ever rendered. Each instance has a fixed k/base (a fresh
  // instance is created per level by the parent router's {#key}), so the route
  // table is built once and never needs to react.
  let { k, base }: { k: number; base: string } = $props();

  // Fixed per instance (see above): capture the initial values into plain locals
  // so the route table is built once from them. The `state_referenced_locally`
  // suppressions are intentional — these props never change for a given instance,
  // so reading the initial value is correct, not a missed reaction.
  // svelte-ignore state_referenced_locally
  const level = k;
  // svelte-ignore state_referenced_locally
  const basePath = base;

  const child: RouteConfig[] = [];
  if (level < DEEP_DEPTH) {
    child.push({
      path: `/l${level + 1}`,
      component: DeepLevel,
      props: { k: level + 1, base: `${basePath}/l${level + 1}` },
    });
  }
  if (level >= 1) {
    child.push({ component: CatalogItem, props: { n: String(level) } });
  }
</script>

<div class="lvl">
  <Router basePath={base} routes={child} />
</div>
