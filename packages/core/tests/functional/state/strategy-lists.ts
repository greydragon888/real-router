/**
 * The four `queryParams` format unions, written out for the tests that need
 * to know them.
 *
 * ⚠ Hand-written on purpose, and that is the point: `requireStrategy` derives its
 * "expected …" list from the strategy TABLE, so a test deriving it the same way
 * would compare the table against itself and pass for any table. This list is the
 * hand-written statement of what the four options accept, and it is what makes
 * the derivation checkable. Keep it in step with
 * `engine/search-params/strategies/` — a divergence is exactly the finding.
 *
 * ⚠ ORDERED, and the order is load-bearing rather than incidental (see
 * `numberFormat` below). The message prints `Object.keys(table)`, and that
 * sentence is user-facing and DOCUMENTED: the wiki's `RouterOptions.md` quotes
 * it verbatim, tail included — `— expected "auto" | "none"`, which is not the
 * order of the TS union printed beside it on the same page. So reordering a
 * strategy table is not a semantic no-op: it rewrites documented output, and the
 * cell that reds (`CONTROL — the message names the remedy…`) is the notice to
 * update this list and the wiki together. Measured: a `nullStrategies` reorder
 * reds that one cell and nothing else in the 4466-cell suite — which is also why
 * no OTHER cell may claim the order is free to change.
 *
 * ⚠ NOT the only hand copy in the repo, and not one of three either — counting
 * them wrong is the same drift this file exists to catch. The boolean union
 * alone appears verbatim in at least FOUR `src` files (the engine table, the TS
 * union beside it, `core/src/types/route-node-types.ts`, and
 * `@real-router/validation-plugin`'s allow-list, which must REJECT by name
 * before core ever resolves) and in a dozen more across the property and unit
 * tiers. The point of writing them by hand HERE is not that there is one copy:
 * it is that a divergence from the AUTHORITY fails a test.
 */
export const searchParamsStrategyLists: Readonly<
  Record<string, readonly string[]>
> = {
  arrayFormat: ["none", "brackets", "index", "comma"],
  booleanFormat: ["none", "auto", "empty-true"],
  nullFormat: ["default", "hidden"],
  // ⚠ Not alphabetical — the message enumerates `Object.keys(table)`, so this
  // mirrors the TABLE's own key order. Nor is that a departure from the sibling
  // three. ⚠ Two of the four ARE alphabetical by coincidence (`nullFormat`
  // `default | hidden`, `numberFormat` `auto | none`) — an earlier note here
  // said none was, which would make the sort a safe normalisation. It is not:
  // `arrayFormat` and `booleanFormat` are not, and all four are printed by
  // the same rule. This one merely happens to look out of place next to them.
  numberFormat: ["auto", "none"],
};
