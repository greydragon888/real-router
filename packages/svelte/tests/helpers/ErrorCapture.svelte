<script lang="ts">
  import { useRouterError } from "../../src/composables/useRouterError.svelte";

  let { onCapture }: { onCapture: (result: unknown) => void } = $props();

  const snapshot = useRouterError();

  onCapture(snapshot);
</script>

<div data-testid="error">{String(snapshot.current.error?.code ?? "none")}</div>
