import { configure } from "@testing-library/react";

import "@testing-library/jest-dom/vitest";

import "vitest-react-profiler";

/**
 * Suppress console output during tests
 */
console.log = () => {};
console.warn = () => {};
console.error = () => {};

// Configure testing library
configure({ reactStrictMode: true });

afterEach(() => {
  vi.clearAllMocks();
});
