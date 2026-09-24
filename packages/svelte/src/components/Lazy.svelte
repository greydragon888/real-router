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

    // Isolate a synchronously-throwing loader (#1476): a loader that throws
    // *before* returning its promise (init work before the dynamic import) would
    // otherwise escape the `.catch` below — the async channel only covers the
    // returned promise — and bypass the error UI. The try/catch routes a sync
    // throw into the same rejection path as an async failure, while still
    // invoking the loader synchronously on mount (throw-isolation class, #806).
    let pending: Promise<{ default: Component }>;

    // eslint-disable-next-line sonarjs/no-try-promise -- the try catches a loader that throws before it returns a promise, as the comment above says
    try {
      pending = loader();
    } catch (error) {
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- the `.catch` below wraps a non-Error reason in an Error
      pending = Promise.reject(error);
    }

    pending
      .then((module) => {
        if (!active) {
          return;
        }
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- a loader outside its type can resolve to anything
        if (typeof module?.default === "undefined") {
          throw new Error(
            "[real-router] Lazy loader resolved without a `default` export.",
          );
        }

        state = { status: "ready", component: module.default };
      })
      .catch((error: unknown) => {
        if (!active) {
          return;
        }

        state = {
          status: "error",
          error: error instanceof Error ? error : new Error(String(error)),
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
