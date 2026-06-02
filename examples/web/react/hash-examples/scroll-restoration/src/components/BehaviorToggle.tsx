import type { JSX } from "react";

const BEHAVIOR_KEY = "scroll-restoration-behavior";

interface BehaviorToggleProps {
  readonly behavior: ScrollBehavior;
  readonly onBehaviorChange: (behavior: ScrollBehavior) => void;
}

/**
 * Three-way toggle for the `behavior` option passed to `scrollTo` and
 * `scrollIntoView`. Mirrors the same React-state-driven remount pattern as
 * ModeToggle: persists to localStorage AND calls `onBehaviorChange`, which
 * triggers RouterProvider remount via `key`.
 *
 * - `auto` (default) — browser-defined, usually instant.
 * - `instant` — explicit instant jump (no animation).
 * - `smooth` — animated transition. Best paired with `mode: "top"` or
 *   anchor scroll; smooth `restore` on Back can feel disorienting.
 */
export function BehaviorToggle({
  behavior,
  onBehaviorChange,
}: BehaviorToggleProps): JSX.Element {
  const switchTo = (next: ScrollBehavior): void => {
    globalThis.localStorage.setItem(BEHAVIOR_KEY, next);
    onBehaviorChange(next);
  };

  return (
    <div className="mode-toggle" role="group" aria-label="scroll behavior">
      {(["auto", "instant", "smooth"] as const).map((option) => (
        <button
          key={option}
          type="button"
          data-testid={`behavior-${option}`}
          data-active={option === behavior}
          onClick={() => {
            switchTo(option);
          }}
        >
          {option}
        </button>
      ))}
    </div>
  );
}
