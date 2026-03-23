import "@testing-library/jest-dom/vitest";

console.log = () => {};
console.warn = () => {};
console.error = () => {};

afterEach(() => {
  vi.clearAllMocks();
});
