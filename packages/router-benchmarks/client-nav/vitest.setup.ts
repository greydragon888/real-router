(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
window.scrollTo = (() => {}) as typeof globalThis.scrollTo;
