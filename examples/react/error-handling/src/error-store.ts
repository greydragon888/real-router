import type { RouterError, State } from "@real-router/core";

export interface ErrorEntry {
  code: string;
  message: string;
  path: string | undefined;
  time: number;
}

let entries: readonly ErrorEntry[] = [];
const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((fn) => {
    fn();
  });
}

export const errorStore = {
  add(err: RouterError) {
    entries = [
      ...entries,
      {
        code: err.code,
        message: err.message,
        path: err.path,
        time: Date.now(),
      },
    ];
    notify();
  },
  addCancel(toState: State, _fromState: State | undefined) {
    entries = [
      ...entries,
      {
        code: "TRANSITION_CANCELLED",
        message: `Navigation to ${toState.name} was cancelled`,
        path: toState.path,
        time: Date.now(),
      },
    ];
    notify();
  },
  getAll: () => entries,
  subscribe(fn: () => void) {
    listeners.add(fn);

    return () => listeners.delete(fn);
  },
};
