/** 40-iteration LCG — identical to TanStack. */
export function runPerfSelectorComputation(seed: number): number {
  let value = Math.trunc(seed) | 0;
  for (let index = 0; index < 40; index++) {
    value = (value * 1664525 + 1013904223 + index) >>> 0;
  }
  return value;
}

export function normalizePage(value: unknown): number {
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? Math.round(num) : 1;
}

export function normalizeFilter(value: unknown): string {
  return typeof value === "string" && value.length > 0 ? value : "all";
}

const noop = (): void => {};
export { noop };
