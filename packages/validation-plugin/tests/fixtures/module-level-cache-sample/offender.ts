const reported = new Set<string>();

/** Fixture for the #1583 scan's positive control — the exact retired shape. */
export function report(key: string): void {
  if (reported.has(key)) {
    return;
  }

  reported.add(key);
}
