// packages/router-benchmarks/modules/helpers/suppress-console.ts

/**
 * Suppress console output during benchmarks.
 * Must be imported FIRST before any other imports.
 */

console.log = () => {};
console.warn = () => {};
console.error = () => {};
