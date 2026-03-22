<script lang="ts">
  import { useRouter } from "../../../src/composables/useRouter.svelte";

  let { onRender }: { onRender?: () => void } = $props();

  const router = useRouter();

  $effect(() => {
    // router is a plain object (not reactive), so this effect runs once on mount
    void router;
    onRender?.();
  });
</script>
