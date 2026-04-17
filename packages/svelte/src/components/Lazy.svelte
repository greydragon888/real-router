<script lang="ts">
  import type { Component } from "svelte";

  let {
    loader,
    fallback,
  }: {
    loader: () => Promise<{ default: Component }>;
    fallback?: Component | undefined;
  } = $props();

  type LazyState =
    | { status: "loading" }
    | { status: "ready"; component: Component }
    | { status: "error"; error: Error };

  let state = $state<LazyState>({ status: "loading" });

  $effect(() => {
    state = { status: "loading" };
    let active = true;

    loader()
      .then((module) => {
        if (!active) return;
        if (!module || typeof module.default === "undefined") {
          throw new Error(
            "[real-router] Lazy loader resolved without a `default` export.",
          );
        }
        state = { status: "ready", component: module.default };
      })
      .catch((err: unknown) => {
        if (!active) return;
        state = {
          status: "error",
          error: err instanceof Error ? err : new Error(String(err)),
        };
      });

    return () => {
      active = false;
    };
  });
</script>

{#if state.status === "loading" && fallback}
  {@const Fallback = fallback}
  <Fallback />
{:else if state.status === "error"}
  <p>Error loading component: {state.error.message}</p>
{:else if state.status === "ready"}
  {@const LoadedComponent = state.component}
  <LoadedComponent />
{/if}
