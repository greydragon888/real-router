<script lang="ts">
  import {
    Router,
    route as routeAction,
    type RouteConfig,
  } from "@mateothegreat/svelte5-router";

  import Home from "../../../_shared/Home.svelte";

  // mount-links → render 1000 <a use:routeAction>. mateo uses explicit href
  // strings (no reverse-matcher), so this isolates action-mount + <a> render
  // cost — the honest mateo counterpart to the other engines' href-builders.
  const _n = Number(new URLSearchParams(globalThis.location?.search ?? "").get("n"));
  const COUNT = _n > 0 ? _n : 1000;
  const items: number[] = Array.from({ length: COUNT }, (_, i) => i);
  const routes: RouteConfig[] = [{ path: "/", component: Home }];

  let show = $state(false);
</script>

<button data-testid="mount-links" onclick={() => (show = true)}>mount</button>
<main data-testid="page-ready">{show ? "shown" : "idle"}</main>
{#if show}
  <nav>
    {#each items as i (i)}
      <a
        href={`/r${i}`}
        use:routeAction
        data-testid={i === COUNT - 1 ? "last-link" : undefined}
      >
        r{i}
      </a>
    {/each}
  </nav>
{/if}
<Router {routes} />
