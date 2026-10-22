/**
 * Global test setup
 *
 * Silences console output from logger during tests, and holds every cell to
 * the read budget in `cell-read-budget.ts`.
 */

import { installCellReadBudget } from "./cell-read-budget";

// Suppress console output for all tests
console.log = () => {};
console.warn = () => {};
console.error = () => {};

installCellReadBudget();
