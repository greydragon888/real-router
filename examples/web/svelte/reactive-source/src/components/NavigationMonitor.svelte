<script lang="ts">
  import { createReactiveSource, useRouter } from "@real-router/svelte";
  import { createRouteSource, createTransitionSource } from "@real-router/sources";

  const router = useRouter();

  const routeState = createReactiveSource(createRouteSource(router));
  const transitionState = createReactiveSource(createTransitionSource(router));

  let history = $state<string[]>([]);

  $effect(() => {
    const name = routeState.current?.name;
    if (name) {
      history = [...history, `${new Date().toLocaleTimeString()} → ${name}`].slice(-10);
    }
  });
</script>

<div class="card" style="margin-top: 24px">
  <strong>Navigation Monitor</strong>
  <p style="font-size: 13px; color: #888; margin-top: 4px">
    Built with <code>createReactiveSource</code> + <code>createRouteSource</code> / <code>createTransitionSource</code>
  </p>

  <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 12px">
    <div>
      <strong style="font-size: 12px; color: #888">CURRENT ROUTE</strong>
      <div style="margin-top: 4px">
        <p>Name: <strong>{routeState.current?.name ?? "—"}</strong></p>
        <p>Path: <code>{routeState.current?.path ?? "—"}</code></p>
        <p>Params: <code>{JSON.stringify(routeState.current?.params ?? {})}</code></p>
      </div>
    </div>
    <div>
      <strong style="font-size: 12px; color: #888">TRANSITION STATE</strong>
      <div style="margin-top: 4px">
        <p>Transitioning: <strong>{transitionState.current.isTransitioning ? "Yes" : "No"}</strong></p>
        {#if transitionState.current.isTransitioning}
          <div class="progress-bar" style="width: 100%; margin-top: 4px"></div>
        {/if}
      </div>
    </div>
  </div>

  <div style="margin-top: 16px">
    <strong style="font-size: 12px; color: #888">NAVIGATION HISTORY (last 10)</strong>
    {#if history.length === 0}
      <p style="font-size: 13px; color: #888">No navigations yet.</p>
    {:else}
      <ul style="padding-left: 16px; margin-top: 4px">
        {#each history.toReversed() as entry}
          <li style="font-size: 13px">{entry}</li>
        {/each}
      </ul>
    {/if}
  </div>
</div>
