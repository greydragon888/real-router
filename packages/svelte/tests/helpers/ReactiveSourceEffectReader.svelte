<script lang="ts">
  import type { RouterSource } from "@real-router/sources";

  import { createReactiveSource } from "../../src/createReactiveSource.svelte";

  // Probe component for §5.9 row 4 / row 8: reads `.current` inside `$effect`
  // and reports the read value via `onRead`. The parent test verifies that
  // `source.subscribe` was actually invoked (lazy contract: subscribe fires
  // only when `.current` is read inside a reactive context, not outside).
  //
  // For row 8 (multiple-readers-single-subscribe), set `readCount > 1` —
  // the effect reads `.current` `readCount` times in the same reactive frame.
  // Svelte 5 createSubscriber must call `source.subscribe` AT MOST ONCE for
  // the lifetime of the effect, even across multiple `.current` reads.
  let {
    source,
    onRead,
    readCount = 1,
  }: {
    source: RouterSource<unknown>;
    onRead: (values: unknown[]) => void;
    readCount?: number;
  } = $props();

  const reactive = createReactiveSource(source);

  $effect(() => {
    const reads: unknown[] = [];

    for (let i = 0; i < readCount; i++) {
      reads.push(reactive.current);
    }

    onRead(reads);
  });
</script>
