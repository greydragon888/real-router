export const EMPTY_PARAMS = Object.freeze({});

export const EMPTY_OPTIONS = Object.freeze({});

// Singleton forever-pending promise — module-scope so `useDeferred(unknownKey)`
// returns a stable reference across calls (Suspense boundary doesn't retry).
export const NEVER_PROMISE = new Promise<never>(() => {
  // Intentionally never resolves — surfaces a forever-pending Suspense boundary
  // when a key is requested that the loader never declared.
});
