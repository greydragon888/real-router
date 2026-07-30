/** Frozen lookup table — module scope is correct, nothing accumulates. */
const LEVELS = new Set(["all", "warn-error", "error-only", "none"]);

/** Keyed by an object, so it evicts with its key. */
const perRouter = new WeakMap<object, number>();

export function isLevel(value: string): boolean {
  return LEVELS.has(value);
}

export function bump(router: object): void {
  perRouter.set(router, (perRouter.get(router) ?? 0) + 1);
}
