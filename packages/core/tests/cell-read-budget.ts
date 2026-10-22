import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";

// eslint-disable-next-line import-x/no-extraneous-dependencies -- test-only module; vitest is a root devDependency. The eslint vitest block (section 12) auto-exempts only *.test.ts / *.properties.ts / *.stress.ts / helpers.ts.
import { afterAll, afterEach, beforeAll, beforeEach } from "vitest";

/**
 * A cell reads a file or two; a TREE is read at collection (#2818).
 *
 * A cell runs under `testTimeout` and a hook under `hookTimeout`, and work that
 * grows with a tree grows past both: under coverage, on a loaded CI runner, a
 * whole-tree parse inside a cell missed its timeout (#2335, #2818). Module scope
 * and `describe` bodies run at collection, which no timeout reaches, so that is
 * where a scan belongs, and the cells read its result.
 *
 * ⚑ The tripwire counts BYTES read through `readFileSync`, never time: bytes are
 * the same on every machine and grow with the tree, so a scan reds while it is
 * still cheap, where a timing assertion would flake under load.
 *
 * TypeScript's own reads (`ts.sys.readFile`, a `Program` it builds) go through
 * the same function and count. A cell's window runs from its first `beforeEach`
 * to its last `afterEach`; what is read outside the cells is the hooks', judged
 * as the next cell opens or the file closes.
 *
 * ⚠ Two cells running concurrently would share one window.
 */

/**
 * What a window may read. A scan of core's own `src` is over it, which
 * `cell-read-budget-authority-2818` holds; every cell and hook is under it,
 * which the tripwire itself holds on every run.
 */
export const CELL_READ_BUDGET = 1024 * 1024;

function mib(bytes: number): string {
  return `${bytes} bytes (${(bytes / CELL_READ_BUDGET).toFixed(1)} MiB)`;
}

/** Why a cell that read `bytes` fails, or `undefined` if it does not. */
export function cellVerdict(bytes: number): string | undefined {
  if (bytes <= CELL_READ_BUDGET) {
    return undefined;
  }

  return (
    `[cell-read-budget] this cell read ${mib(bytes)} through readFileSync, ` +
    `over the ${mib(CELL_READ_BUDGET)} a cell may read. Read the tree ONCE at ` +
    `collection, at module scope or in the describe body where no timeout ` +
    `reaches, and let the cells read the result (#2818). The rule lives in ` +
    `tests/cell-read-budget.ts.`
  );
}

/** Why the hooks that read `bytes` outside the cells fail, or `undefined`. */
export function hookVerdict(bytes: number): string | undefined {
  if (bytes <= CELL_READ_BUDGET) {
    return undefined;
  }

  return (
    `[cell-read-budget] a beforeAll or afterAll hook read ${mib(bytes)} through ` +
    `readFileSync, over the ${mib(CELL_READ_BUDGET)} budget. A hook runs under ` +
    `hookTimeout, so a tree is read at collection instead (#2818).`
  );
}

interface Tally {
  /** `collect` is never counted; `hooks` and `cell` are. */
  phase: "collect" | "hooks" | "cell";
  bytes: number;
  wrapped: boolean;
}

/**
 * One tally per worker, on `globalThis`, so the wrapper and every copy of this
 * module agree on it however the module graph is shared.
 */
const TALLY = Symbol.for("@real-router/core/tests/cell-read-budget");

const tally = ((globalThis as Record<symbol, Tally | undefined>)[TALLY] ??= {
  phase: "collect",
  bytes: 0,
  wrapped: false,
});

/** Bytes the current window has read so far. */
export function bytesReadInWindow(): number {
  return tally.bytes;
}

/** Which window a read lands in right now. */
export function readPhase(): Tally["phase"] {
  return tally.phase;
}

function wrapReadFileSync(): void {
  if (tally.wrapped) {
    return;
  }

  const original = fs.readFileSync;

  fs.readFileSync = function readFileSync(
    this: unknown,
    ...args: unknown[]
  ): unknown {
    const read: unknown = Reflect.apply(original, this, args);

    if (tally.phase !== "collect") {
      tally.bytes +=
        typeof read === "string"
          ? Buffer.byteLength(read)
          : (read as Buffer).byteLength;
    }

    return read;
  } as typeof fs.readFileSync;

  // The named ESM exports of a builtin are copies; this re-points them, so an
  // `import { readFileSync } from "node:fs"` reaches the wrapper too.
  syncBuiltinESMExports();
  tally.wrapped = true;
}

/** Wraps `readFileSync` once per worker and judges every window of the file. */
export function installCellReadBudget(): void {
  wrapReadFileSync();
  tally.phase = "collect";
  tally.bytes = 0;

  /** Closes the current window, opens `next`, and judges what was closed. */
  const close = (
    next: Tally["phase"],
    judge: (bytes: number) => string | undefined,
  ): void => {
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
