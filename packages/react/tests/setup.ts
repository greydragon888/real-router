// Force chalk/Ink to emit ANSI color codes even in the non-TTY test stdout.
// InkLink color-state tests assert on ANSI escape sequences in lastFrame().
import { configure } from "@testing-library/react";

import "@testing-library/jest-dom/vitest";

import "vitest-react-profiler";

process.env.FORCE_COLOR = "3";

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
