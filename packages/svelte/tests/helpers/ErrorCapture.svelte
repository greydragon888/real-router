<script lang="ts">
  import { getErrorSource } from "@real-router/sources";

  import { useRouter } from "../../src/composables/useRouter.svelte";
  import { createReactiveSource } from "../../src/createReactiveSource.svelte";

  let { onCapture }: { onCapture: (result: unknown) => void } = $props();

  const router = useRouter();
  const snapshot = createReactiveSource(getErrorSource(router));

  onCapture(snapshot);
</script>

<div data-testid="error">{String(snapshot.current.error?.code ?? "none")}</div>
