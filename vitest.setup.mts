/**
 * The first setup file of every config that merges `vitest.config.common.mts`,
 * which lists it in `setupFiles`; a package's own setup file follows it.
 *
 * It holds each cell and hook to the read budget of
 * `scripts/lib/cell-read-budget.mjs`, so a test reads a tree at collection
 * (#2818).
 */
import { installCellReadBudget } from "./scripts/lib/cell-read-budget.mjs";

installCellReadBudget();
