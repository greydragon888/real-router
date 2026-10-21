import type { Browser } from "./types.js";

/**
 * Where an entry this plugin wrote sits in session history (#2740).
 *
 * A refused Back or Forward has already moved the browser. Going back to the
 * entry it started from keeps every entry where it was, and `history.go()`
 * needs the distance to it: the History API names no entry. Every entry the
 * plugin writes carries its index in a run of entries numbered without a gap,
 * and two indexes measure a distance only within one run.
 */
export interface EntryPosition {
  readonly run: string;
  readonly index: number;
}

/**
 * The position of the entry the router stands on, kept in step with the
 * plugin's own writes. A run starts on an entry that carries no position —
 * the one a document loads with, one the browser or other code wrote; a
 * plugin started on an entry that carries one continues its run.
 */
export interface EntryPositions {
  readonly current: EntryPosition | undefined;
  /** The router stands on the entry holding `state`. */
  adopt: (state: unknown) => void;
  /**
   * Positions for a push from the current entry and a replace of it; either
   * drops an awaited return.
   */
  push: () => EntryPosition;
  replace: () => EntryPosition;
  /** The plugin sent the browser back to `origin` with `history.go()`. */
  returnTo: (origin: EntryPosition) => void;
  /** The return the next traversal completes, consumed by reading it. */
  takeReturn: () => EntryPosition | undefined;
  /**
   * A traversal arrived at the entry holding `state`, and runs until
   * `depart()`. While it runs, a write onto the entry the browser stands on
   * belongs to it only if the browser still stands on that entry: a second
   * traversal may have taken the browser elsewhere (`movedOn`).
   */
  arrive: (state: unknown) => void;
  depart: () => void;
  /**
   * A traversal runs, and the entry holding `state` — the one the browser
   * stands on — is measurably another than the one it reached.
   */
  movedOn: (state: unknown) => boolean;
}

// A random prefix keeps the runs of another document, or of another copy of
// this module, apart from this one's.
// eslint-disable-next-line sonarjs/pseudo-random -- it names a run, it guards nothing
const DOCUMENT_RUN_PREFIX = Math.random().toString(36).slice(2, 10);
let runCount = 0;

const startRun = (): EntryPosition => ({
  run: `${DOCUMENT_RUN_PREFIX}.${runCount++}`,
  index: 0,
});

/** An index: a whole number from 0, within the safe integers. */
const isIndex = (value: unknown): value is number =>
  Number.isSafeInteger(value) && (value as number) >= 0;

/**
 * Reads the position an entry's state carries. Reads each member once and
 * answers `undefined` for anything that is not one — including a state other
 * code wrote, which may throw from a getter.
 */
export function readPosition(state: unknown): EntryPosition | undefined {
  // The common shapes answer here, so a write onto a fresh entry throws
  // nothing; only a getter that throws reaches the catch.
  if (state === null || typeof state !== "object") {
    return undefined;
  }

  try {
    const position = (state as { position?: unknown }).position;

    if (position === null || typeof position !== "object") {
      return undefined;
    }

    const { run, index } = position as { run?: unknown; index?: unknown };

    return typeof run === "string" && isIndex(index)
      ? { run, index }
      : undefined;
  } catch {
    return undefined;
  }
}

/**
 * How far `history.go()` travels from `from` to `to`: known only when both
 * belong to one run.
 */
export function distanceBetween(
  from: EntryPosition | undefined,
  to: EntryPosition | undefined,
): number | undefined {
  return from !== undefined && from.run === to?.run
    ? to.index - from.index
    : undefined;
}

export function createEntryPositions(): EntryPositions {
  let current: EntryPosition | undefined;
  let awaited: EntryPosition | undefined;
  let arrived: EntryPosition | undefined;

  return {
    get current() {
      return current;
    },

    adopt: (state) => {
      current = readPosition(state);
    },

    push: () => {
      awaited = undefined;
      current = current
        ? { run: current.run, index: current.index + 1 }
        : startRun();

      return current;
    },

    replace: () => {
      awaited = undefined;
      current ??= startRun();

      return current;
    },

    returnTo: (origin) => {
      current = origin;
      awaited = origin;
    },

    takeReturn: () => {
      const origin = awaited;

      awaited = undefined;

      return origin;
    },

    arrive: (state) => {
      arrived = readPosition(state);
    },

    depart: () => {
      arrived = undefined;
    },

    movedOn: (state) => {
      // Known only between two positions of one run.
      const distance = distanceBetween(arrived, readPosition(state));

      return distance !== undefined && distance !== 0;
    },
  };
}

/**
 * The plugin's `Browser`, with every state it writes stamped with the position
 * `positions` gives that write. The stamp goes onto a copy of the writer's
 * state, so the History API receives an object no writer keeps: an entry holds
 * the state it was written with even where the host stores state by reference,
 * as jsdom does (#2741). That is what lets the writers reuse their buffers.
 *
 * Each write first takes the position of the entry the browser stands on: a
 * replace keeps that entry's place and a push follows it. The browser may
 * stand elsewhere than the router's last entry — a traversal arrives while a
 * transition is still running. A replace while a traversal runs writes
 * nothing when the browser measurably stands on another entry than the one
 * that traversal reached: the History API writes only the current entry, and
 * that one is a later traversal's.
 *
 * Every member calls `browser`'s own at call time, so a class instance keeps
 * its prototype and private fields, and a method replaced later is the one
 * called. `getState` and `go` exist only where `browser` has them: their
 * absence is how the plugin knows it cannot measure the way back, or travel
 * it.
 */
export function withEntryPositions(
  browser: Browser,
  positions: EntryPositions,
): Browser {
  return {
    getLocation: () => browser.getLocation(),
    getHash: () => browser.getHash(),
    addPopstateListener: (fn) => browser.addPopstateListener(fn),
    addHashChangeListener: (fn) => browser.addHashChangeListener(fn),
    pushState: (state, url) => {
      positions.adopt(browser.getState?.());
      browser.pushState(stamp(state, positions.push()), url);
    },
    replaceState: (state, url) => {
      const live = browser.getState?.();

      // The entry the browser stands on is another traversal's: the one in
      // flight reached an entry the browser has left.
      if (positions.movedOn(live)) {
        return;
      }

      positions.adopt(live);
      browser.replaceState(stamp(state, positions.replace()), url);
    },
    ...(browser.getState && { getState: () => browser.getState?.() }),
    ...(browser.go && {
      go: (delta: number) => {
        browser.go?.(delta);
      },
    }),
  };
}

function stamp(state: unknown, position: EntryPosition): unknown {
  if (state !== null && typeof state === "object") {
    return { ...state, position };
  }

  return state;
}
