import type { JSX } from "react";

const MODE_KEY = "scroll-restoration-mode";

type Mode = "restore" | "top" | "native";

interface ModeToggleProps {
  readonly mode: Mode;
  readonly onModeChange: (mode: Mode) => void;
}

/**
 * Three-way mode toggle. Calls `onModeChange` (which updates App state +
 * remounts RouterProvider via `key`) AND persists to localStorage so the
 * next cold load picks the right mode.
 */
export function ModeToggle({
  mode,
  onModeChange,
}: ModeToggleProps): JSX.Element {
  const switchTo = (nextMode: Mode): void => {
    globalThis.localStorage.setItem(MODE_KEY, nextMode);
    onModeChange(nextMode);
  };

  return (
    <div
      className="mode-toggle"
      role="group"
      aria-label="scroll restoration mode"
    >
      {(["restore", "top", "native"] as const).map((option) => (
        <button
          key={option}
          type="button"
          data-testid={`mode-${option}`}
          data-active={option === mode}
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
