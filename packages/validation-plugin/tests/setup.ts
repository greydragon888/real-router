/**
 * Global test setup for validation-plugin
 *
 * Silences console output from logger during tests
 */

// Suppress console output for all tests
console.log = () => {};
console.warn = () => {};
console.error = () => {};
