import { useEffect, useState } from "react";

import type { ReactNode } from "react";

export interface ServerOnlyProps {
  readonly children: ReactNode;
  readonly fallback?: ReactNode;
}

export function ServerOnly({
  children,
  fallback = null,
}: ServerOnlyProps): ReactNode {
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
