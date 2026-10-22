import {
  globSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import * as ts from "typescript";
import { beforeAll, describe, expect, it } from "vitest";

import {
  BACKLOG,
  CELL_READ_BUDGET,
  bytesReadInWindow,
  cellVerdict,
  hookVerdict,
  readPhase,
} from "../cell-read-budget";

/**
 * The controls of the cell read budget in `tests/cell-read-budget.ts` (#2818).
 *
 * ⚑ The instrument failing OPEN is the outcome this file exists to rule out. A
 * wrapper that stopped counting passes every cell in the suite, and a green
 * suite would then read as "no cell reads a tree". So each way a read arrives is
 * shown to count, collection is shown NOT to, and both windows are shown to red
 * on a read over the budget.
 *
 * ⚠ The two `it.fails` cells are judged by the tripwire's own hooks, so their
 * bodies hold no `expect`: under `fails` a failing assertion is a pass.
 */

const TESTS = path.resolve(__dirname, "..");
const SRC = path.resolve(__dirname, "../../src");

/** Multi-byte on purpose: its length as a string is not its count of bytes. */
const SAMPLE = "a cell reads a file or two — and its bytes count\n";

/** Runs `body` on a file holding `content`, in a directory of its own. */
function withFile<T>(content: string | Buffer, body: (file: string) => T): T {
  const directory = mkdtempSync(path.join(tmpdir(), "cell-read-budget-"));

  try {
    const file = path.join(directory, "fixture");

    writeFileSync(file, content);

    return body(file);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

/** Byte order — `localeCompare` would reorder the backlog per locale. */
function byteOrder(left: string, right: string): number {
  if (left === right) {
    return 0;
  }

  return left < right ? -1 : 1;
}

/** A read over the budget made here, at collection, and the window around it. */
const COLLECTION = withFile(Buffer.alloc(CELL_READ_BUDGET + 1), (file) => {
  const phase = readPhase();
  const before = bytesReadInWindow();

  readFileSync(file);

  return { phase, before, after: bytesReadInWindow() };
});

/** Core's own `src` by size on disk: the scan the budget has to sit under. */
const SRC_BYTES = globSync(`${SRC}/**/*.ts`).reduce(
  (sum, file) => sum + statSync(file).size,
  0,
);

/** Rows whose file is gone, or no longer spells every part of the name. */
const VANISHED = BACKLOG.filter((row) => {
  const [file, name] = row.split(" :: ", 2);
  const at = path.join(TESTS, file);
  let text: string;

  try {
    text = readFileSync(at, "utf8");
  } catch {
    return true;
  }

  return name.split(" > ").some((part) => !text.includes(part));
});

describe("the cell read budget (#2818)", () => {
  it("counts a read through the ESM binding, byte for byte", () => {
    withFile(SAMPLE, (file) => {
      readFileSync(file, "utf8");
      readFileSync(file);
    });

    expect(bytesReadInWindow()).toBe(2 * Buffer.byteLength(SAMPLE));
  });

  it("counts the reads TypeScript makes on its own", () => {
    withFile(SAMPLE, (file) => ts.sys.readFile(file));

    expect(bytesReadInWindow()).toBe(Buffer.byteLength(SAMPLE));
  });

  it("counts nothing at collection, where a scan belongs", () => {
    expect(COLLECTION).toStrictEqual({ phase: "collect", before: 0, after: 0 });
  });

  // eslint-disable-next-line vitest/expect-expect -- the tripwire's afterEach is the assertion
  it.fails("CONTROL — fails a cell that reads over the budget", () => {
    withFile(Buffer.alloc(CELL_READ_BUDGET + 1), (file) => readFileSync(file));
  });

  it("passes a cell that reads exactly the budget", () => {
    withFile(Buffer.alloc(CELL_READ_BUDGET), (file) => readFileSync(file));

    expect(bytesReadInWindow()).toBe(CELL_READ_BUDGET);
  });

  describe("CONTROL — a hook that reads over the budget", () => {
    beforeAll(() => {
      withFile(Buffer.alloc(CELL_READ_BUDGET + 1), (file) =>
        readFileSync(file),
      );
    });

    // eslint-disable-next-line vitest/expect-expect -- the tripwire's beforeEach is the assertion
    it.fails("fails the next cell, before its body runs", () => undefined);
  });

  it("judges a cell by the budget and the backlog, in all four cases", () => {
    const backlog = ["listed"];

    expect(
      cellVerdict("listed", CELL_READ_BUDGET + 1, backlog),
    ).toBeUndefined();
    expect(cellVerdict("unlisted", CELL_READ_BUDGET, backlog)).toBeUndefined();
    expect(cellVerdict("unlisted", CELL_READ_BUDGET + 1, backlog)).toContain(
      "Read the tree ONCE at collection",
    );
    expect(cellVerdict("listed", CELL_READ_BUDGET, backlog)).toContain(
      "delete its row",
    );
  });

  it("judges the hooks between two cells by the same budget", () => {
    expect(hookVerdict(CELL_READ_BUDGET)).toBeUndefined();
    expect(hookVerdict(CELL_READ_BUDGET + 1)).toContain("hookTimeout");
  });

  it("sits under a scan of core's own src", () => {
    expect(SRC_BYTES).toBeGreaterThan(CELL_READ_BUDGET);
  });

  it("every backlog row names a cell that exists", () => {
    expect(VANISHED).toStrictEqual([]);
  });

  it("keeps the backlog in byte order, once per row", () => {
    expect(BACKLOG).toStrictEqual([...new Set(BACKLOG)].toSorted(byteOrder));
  });
});
