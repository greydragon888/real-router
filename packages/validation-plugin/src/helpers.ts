// packages/validation-plugin/src/helpers.ts

export function computeThresholds(limit: number): {
  warn: number;
  error: number;
} {
  return {
    warn: Math.floor(limit * 0.2),
    error: Math.floor(limit * 0.5),
  };
}
