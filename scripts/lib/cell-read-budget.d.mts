/**
 * Types for the cell read budget. The implementation is plain ESM in
 * `scripts/lib/` so that every package's tests install one copy.
 */

/** What a window may read through `readFileSync`, in bytes. */
export const CELL_READ_BUDGET: number;

/** Why a cell that read `bytes` fails, or `undefined` if it does not. */
export function cellVerdict(bytes: number): string | undefined;

/** Why the hooks that read `bytes` outside the cells fail, or `undefined`. */
export function hookVerdict(bytes: number): string | undefined;

/** Bytes the current window has read so far. */
export function bytesReadInWindow(): number;

/** Which window a read lands in right now. */
export function readPhase(): "collect" | "hooks" | "cell";

/** Wraps `readFileSync` once per worker and judges every window of the file. */
export function installCellReadBudget(): void;
