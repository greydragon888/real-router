<script lang="ts">
  import { untrack } from "svelte";

  import { useRouterError } from "../composables/useRouterError.svelte";

  import type { RouterError, State } from "@real-router/core";
  import type { Snippet } from "svelte";

  interface Props {
    children: Snippet;
    fallback: Snippet<[RouterError, () => void]>;
    onError?: (
      error: RouterError,
      toRoute: State | null,
      fromRoute: State | null,
    ) => void;
  }

  let { children, fallback, onError }: Props = $props();

  const snapshot = useRouterError();
  let dismissedVersion = $state(-1);

  const visibleError = $derived(
    snapshot.current.version > dismissedVersion
      ? snapshot.current.error
      : null,
  );

  function resetError(): void {
    dismissedVersion = snapshot.current.version;
  }

  $effect(() => {
    if (snapshot.current.error) {
      const { error, toRoute, fromRoute } = snapshot.current;
      untrack(() => {
        onError?.(error, toRoute, fromRoute);
      });
    }
  });
</script>

{@render children?.()}
{#if visibleError}
  {@render fallback(visibleError, resetError)}
{/if}
