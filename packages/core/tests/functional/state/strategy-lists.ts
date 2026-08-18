/**
 * The four `queryParams` format unions, written out ONCE for the tests that need
 * to know them.
 *
 * ⚠ Hand-written on purpose, and that is the point: `requireStrategy` derives its
 * "expected …" list from the strategy TABLE, so a test deriving it the same way
 * would compare the table against itself and pass for any table. This list is the
 * independent statement of what the four options accept, and it is what makes the
 * derivation checkable. Keep it in step with `engine/search-params/strategies/`
 * — a divergence is exactly the finding.
 */
export const searchParamsStrategyLists: Readonly<
  Record<string, readonly string[]>
> = {
  arrayFormat: ["none", "brackets", "index", "comma"],
  booleanFormat: ["none", "auto", "empty-true"],
  nullFormat: ["default", "hidden"],
  numberFormat: ["none", "auto"],
};
