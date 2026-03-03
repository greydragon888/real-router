import type { MouseEvent } from "react";

/**
 * Check if navigation should be handled by router
 */
export function shouldNavigate(evt: MouseEvent): boolean {
  return (
    evt.button === 0 && // left click
    !evt.metaKey &&
    !evt.altKey &&
    !evt.ctrlKey &&
    !evt.shiftKey
  );
}
