import { createSignal, onMount } from "solid-js";

import type { Accessor } from "solid-js";

/**
 * Returns a boolean accessor that is `false` during initial render (SSR
 * and the first client paint) and flips to `true` once the component
 * has mounted in the browser.
 *
 * Solid guarantees that `onMount` does NOT fire during `renderToString` /
 * `renderToStream`, so the accessor stays `false` server-side — this is
 * the building block for SSR boundary components (`<ClientOnly>` /
 * `<ServerOnly>`).
 *
 * Consolidates the identical `createSignal(false) + onMount(setMounted)`
 * pattern across the two boundary components (§8a Q15).
 */
export function createMountedSignal(): Accessor<boolean> {
  const [mounted, setMounted] = createSignal(false);

  onMount(() => {
    setMounted(true);
  });

  return mounted;
}
