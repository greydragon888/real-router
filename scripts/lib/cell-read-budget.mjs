// cell-read-budget.mjs — a cell reads a file or two; a TREE is read at collection (#2818).
//
// A cell runs under `testTimeout` and a hook under `hookTimeout`, and work that
// grows with a tree grows past both: under coverage, on a loaded CI runner, a
// whole-tree parse or a typed program built inside a cell missed its timeout
// (#2335, #2818, #2839). Module scope and `describe` bodies run at collection,
// which no timeout reaches, so that is where a scan belongs, and the cells read
// its result.
//
// `vitest.setup.mts` installs it, and `vitest.config.common.mts` lists that
// file in `setupFiles`.
//
// ⚑ The tripwire counts BYTES read through `readFileSync`, never time: bytes are
// the same on every machine and grow with the tree, so a scan reds while it is
// still cheap, where a timing assertion would flake under load.
//
// TypeScript's own reads (`ts.sys.readFile`, a `Program` it builds) go through
// the same function and count, and so does a CommonJS module a cell loads: Node
// reads it with `readFileSync` too. A cell's window runs from its first
// `beforeEach` to its last `afterEach`; what is read outside the cells is the
// hooks', judged as the next cell opens or the file closes.
//
// ⚠ Two cells running concurrently would share one window.
import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";

import { afterAll, afterEach, beforeAll, beforeEach } from "vitest";

/**
 * What a window may read. A scan of core's own `src` is over it, which
 * `cell-read-budget-authority-2818` holds; every cell and hook is under it,
 * which the tripwire itself holds on every run.
 */
export const CELL_READ_BUDGET = 1024 * 1024;

function mib(bytes) {
  return `${bytes} bytes (${(bytes / CELL_READ_BUDGET).toFixed(1)} MiB)`;
}

/** Why a cell that read `bytes` fails, or `undefined` if it does not. */
export function cellVerdict(bytes) {
  if (bytes <= CELL_READ_BUDGET) {
    return undefined;
  }

  return (
    `[cell-read-budget] this cell read ${mib(bytes)} through readFileSync, ` +
    `over the ${mib(CELL_READ_BUDGET)} a cell may read. Read the tree ONCE at ` +
    `collection, at module scope or in the describe body where no timeout ` +
    `reaches, and let the cells read the result (#2818). The rule lives in ` +
    `scripts/lib/cell-read-budget.mjs.`
  );
}

/** Why the hooks that read `bytes` outside the cells fail, or `undefined`. */
export function hookVerdict(bytes) {
  if (bytes <= CELL_READ_BUDGET) {
    return undefined;
  }

  return (
    `[cell-read-budget] a beforeAll or afterAll hook read ${mib(bytes)} through ` +
    `readFileSync, over the ${mib(CELL_READ_BUDGET)} budget. A hook runs under ` +
    `hookTimeout, so a tree is read at collection instead (#2818).`
  );
}

/**
 * One tally per worker, on `globalThis`, so the wrapper and every copy of this
 * module agree on it however the module graph is shared. `collect` is never
 * counted; `hooks` and `cell` are.
 *
 * @type {{ phase: "collect" | "hooks" | "cell", bytes: number, wrapped: boolean }}
 */
const tally = (globalThis[Symbol.for("real-router/cell-read-budget")] ??= {
  phase: "collect",
  bytes: 0,
  wrapped: false,
});

/** Bytes the current window has read so far. */
export function bytesReadInWindow() {
  return tally.bytes;
}

/** Which window a read lands in right now. */
export function readPhase() {
  return tally.phase;
}

function wrapReadFileSync() {
  if (tally.wrapped) {
    return;
  }

  const original = fs.readFileSync;

  fs.readFileSync = function readFileSync(...args) {
    const read = Reflect.apply(original, this, args);

    if (tally.phase !== "collect") {
      tally.bytes +=
        typeof read === "string" ? Buffer.byteLength(read) : read.byteLength;
    }

    return read;
  };

  // The named ESM exports of a builtin are copies; this re-points them, so an
  // `import { readFileSync } from "node:fs"` reaches the wrapper too.
  syncBuiltinESMExports();
  tally.wrapped = true;
}

/** Wraps `readFileSync` once per worker and judges every window of the file. */
export function installCellReadBudget() {
  wrapReadFileSync();
  tally.phase = "collect";
  tally.bytes = 0;

  /** Closes the current window, opens `next`, and judges what was closed. */
  const close = (next, judge) => {
    const verdict = judge(tally.bytes);

    tally.phase = next;
    tally.bytes = 0;

    if (verdict !== undefined) {
      throw new Error(verdict);
    }
  };

  beforeAll(() => {
    tally.phase = "hooks";
    tally.bytes = 0;
  });

  beforeEach(() => {
    close("cell", hookVerdict);
  });

  afterEach(() => {
    close("hooks", cellVerdict);
  });

  afterAll(() => {
    close("collect", hookVerdict);
  });
}
