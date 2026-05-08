import { useEffect, useState } from "react";

import type { ReactNode } from "react";

export interface ClientOnlyProps {
  readonly children: ReactNode;
  readonly fallback?: ReactNode;
}

export function ClientOnly({
  children,
  fallback = null,
}: ClientOnlyProps): ReactNode {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // SSR/hydration boundary: server emits the fallback branch, client matches
    // it on first paint, then this effect flips state to swap in the children.
    // The intentional re-render is what makes the markup match across renders.
    // eslint-disable-next-line @eslint-react/set-state-in-effect -- intentional post-hydration swap
    setMounted(true);
  }, []);

  return mounted ? children : fallback;
}
