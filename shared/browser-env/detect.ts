export const isBrowserEnvironment = (): boolean =>
  typeof globalThis.window !== "undefined" && !!globalThis.history;
