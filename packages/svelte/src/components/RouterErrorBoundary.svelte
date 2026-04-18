<script lang="ts">
  import { createDismissableError } from "@real-router/sources";
  import { untrack } from "svelte";

  import { useRouter } from "../composables/useRouter.svelte";
  import { createReactiveSource } from "../createReactiveSource.svelte";

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

  const router = useRouter();
  const snapshot = createReactiveSource(createDismissableError(router));

  $effect(() => {
    const snap = snapshot.current;
    if (!snap.error) return;

    const { error, toRoute, fromRoute } = snap;
    untrack(() => {
      try {
        onError?.(error, toRoute, fromRoute);
      } catch (callbackError) {
        console.error(
          "[real-router] RouterErrorBoundary onError handler threw:",
          callbackError,
        );
      }
    });
  });
</script>

{@render children?.()}
{#if snapshot.current.error}
  {@render fallback(snapshot.current.error, snapshot.current.resetError)}
{/if}
