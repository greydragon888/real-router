/**
 * The bound of a hold: this many ticks of `TICK_MS`. A chain, not one timer: a
 * long task delays the landing and the timer alike, and Firefox then runs the
 * timer first (measured on Firefox 155), so a task of any length spends one
 * tick.
 */
const BOUND_TICKS = 10;
const TICK_MS = 100;

/**
 * A URL plugin's writes to session history while a traversal it started
 * travels (#2879). A traversal lands a moment after the call, and a write in
 * that moment is made on the entry the browser is about to leave or, under the
 * Navigation API, races the traversal: it aborts it, or the traversal lands
 * after it.
 */
export interface HeldWrites {
  /**
   * Keeps every write back until `release` or `drop`, and `elapsed` runs when
   * the bound passes first: a browser may ignore `history.go()` (MDN), and the
   * promises of `navigation.traverseTo()` may never settle (measured on
   * Firefox 155). What a hold still running kept is dropped.
   */
  hold: (elapsed: () => void) => void;
  /**
   * Calls `write` with `state` at once or, while held, on release with a copy
   * of it: the writers reuse their buffers.
   */
  run: <S>(state: S, write: (state: S) => void) => void;
  /**
   * Ends the hold. The writes run in the order they came, and one that throws
   * is reported and stops none of the others.
   */
  release: () => void;
  /** Ends the hold without writing, and answers whether it held a write. */
  drop: () => boolean;
}

export function createHeldWrites(): HeldWrites {
  let held: (() => void)[] | undefined;
  let tick: ReturnType<typeof setTimeout> | undefined;

  return {
    hold: (elapsed) => {
      held = [];
      clearTimeout(tick);

      let ticks = BOUND_TICKS;
      const spend = (): void => {
        ticks--;

        if (ticks === 0) {
          elapsed();
        } else {
          tick = setTimeout(spend, TICK_MS);
        }
      };

      tick = setTimeout(spend, TICK_MS);
    },

    run: (state, write) => {
      if (held === undefined) {
        write(state);

        return;
      }

      const kept = copyOf(state);

      held.push(() => {
        write(kept);
      });
    },

    release: () => {
      const writes = held ?? [];

      clearTimeout(tick);
      held = undefined;

      for (const write of writes) {
        try {
          write();
        } catch (error) {
          console.error(
            "[real-router] A history write held for a traversal failed",
            error,
          );
        }
      }
    },

    drop: () => {
      const dropped = held !== undefined && held.length > 0;

      clearTimeout(tick);
      held = undefined;

      return dropped;
    },
  };
}

function copyOf<S>(state: S): S {
  return state !== null && typeof state === "object" ? { ...state } : state;
}
