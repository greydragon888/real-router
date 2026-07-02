<script lang="ts">
  import { Router, type RouteConfig } from "@mateothegreat/svelte5-router";

  import Ready from "./Ready.svelte";

  // ?n=N synthetic plain-string routes (/r0.../r{N-1}) + home. The harness holds
  // this table, forces GC and reads retained heap — the memory cost of the route
  // set (mateo stores a Route instance per entry in a Set).
  const n = Number(new URLSearchParams(location.search).get("n") ?? "1");

  const routes: RouteConfig[] = [
    { path: "/", component: Ready, props: { n: String(n) } },
    ...Array.from({ length: n }, (_, i) => ({
      path: `/r${i}`,
      component: Ready,
      props: { n: String(n) },
    })),
  ];
</script>

<Router {routes} />
