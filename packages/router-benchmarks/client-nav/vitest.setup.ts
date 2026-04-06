(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
window.scrollTo = (() => {}) as typeof window.scrollTo;

if (typeof globalThis.addEventListener !== "function") {
  (globalThis as Record<string, unknown>).addEventListener =
    window.addEventListener.bind(window);
  (globalThis as Record<string, unknown>).removeEventListener =
    window.removeEventListener.bind(window);
}
