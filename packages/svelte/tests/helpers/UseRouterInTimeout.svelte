<script lang="ts">
  import { useRouter } from "../../src/composables/useRouter.svelte";

  let {
    onCapture,
  }: { onCapture: (router: unknown, err: unknown) => void } = $props();

  // Locks the actual gotcha #2 contract: composables called inside async
  // callbacks (setTimeout, fetch, requestAnimationFrame) run AFTER the
  // component init lifecycle and outside any reactive context. In Svelte 5
  // `getContext` returns `undefined` there, so `useRouter()` throws the
  // "must be used within a RouterProvider" error — exactly the user-visible
  // signal for misuse.
  setTimeout(() => {
    try {
      const router = useRouter();

      onCapture(router, null);
    } catch (err) {
      onCapture(null, err);
    }
  }, 0);
</script>
