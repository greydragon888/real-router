import { useEffect, useState } from "preact/hooks";

import type { ComponentChildren } from "preact";

export interface ServerOnlyProps {
  readonly children: ComponentChildren;
  readonly fallback?: ComponentChildren;
}

export function ServerOnly({
  children,
  fallback = null,
}: ServerOnlyProps): ComponentChildren {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // SSR/hydration boundary: server emits the children branch, client matches
    // it on first paint, then this effect flips state to swap in the fallback
    // (or hide entirely). The intentional re-render keeps markup consistent
    // across renders.
    // eslint-disable-next-line @eslint-react/set-state-in-effect -- intentional post-hydration swap
    setMounted(true);
  }, []);

  return mounted ? fallback : children;
}
