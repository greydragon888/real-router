import { putField } from "@real-router/core/utils";

/**
 * Intrinsics captured at module load (#1971).
 *
 * ⚑ These DECIDE — each answers "what is on this object" for a value this module
 * did not build, so read off the live global they are the weakest point of every
 * check built on them. `guards.ts` states the doctrine and its measurement: one
 * naive `Object.hasOwn` polyfill walked straight through five sibling readers
 * while the single captured guard held.
 *
 * ⚠ Capture narrows the window from "any time after boot" to "before this module
 * loads". It does not close it — a shim evaluated ahead of core still wins
 * (#1798), which is the doctrine's own caveat and travels with it.
 */
const objectEntries = Object.entries;
const hasOwn = Object.hasOwn;
const objectKeys = Object.keys;
// packages/logger-plugin/src/internal/params-diff.ts

export interface ParamsDiff {
  changed: Record<string, { from: unknown; to: unknown }>;
  added: Record<string, unknown>;
  removed: Record<string, unknown>;
}

/**
 * Calculates differences between two parameter objects.
 * Performs only shallow comparison. Channel-agnostic — reused for both the path
 * (`state.params`) and the query (`state.search`) channels (RFC-4 M2 / #1548).
 *
 * @param fromParams - Previous parameters
 * @param toParams - New parameters
 * @returns Object with differences or null if there are no changes
 */
export const getParamsDiff = (
  fromParams: Record<string, unknown>,
  toParams: Record<string, unknown>,
): ParamsDiff | null => {
  const changed: ParamsDiff["changed"] = {};
  const added: ParamsDiff["added"] = {};
  const removed: ParamsDiff["removed"] = {};

  // Track if any changes found to avoid iterating through objects at the end.
  // This is a performance optimization: instead of calling Object.keys().length
  // three times to check if objects are empty, we set this flag when we find
  // any change and check it once at the end.
  let hasChanges = false;

  // Find changed and removed
  // ⚑ `Object.hasOwn`, not `key in` (#1852). The `in` form walks the prototype
  // chain, so a key an application also put on `Object.prototype` read as
  // "present in the other bag" and the diff LIED about it — a removed key
  // stopped being reported as removed. That also made two of these three
  // branches look immune to the write hazard below, which they were, by
  // accident: the branch that would have written simply was not taken.
  for (const [key, from] of objectEntries(fromParams)) {
    if (!hasOwn(toParams, key)) {
      putField(removed, key, from);
      hasChanges = true;
    } else if (from !== toParams[key]) {
      // The only branch whose condition never asked the chain, and therefore
      // the only one that reached the write: an ambient accessor under a param
      // name took the whole log line with it, isolated by core as a listener
      // error.
      putField(changed, key, { from, to: toParams[key] });
      hasChanges = true;
    }
  }

  // Find added
  for (const [key, to] of objectEntries(toParams)) {
    if (hasOwn(fromParams, key)) {
      continue;
    }

    putField(added, key, to);
    hasChanges = true;
  }

  // Return null if there are no changes
  if (!hasChanges) {
    return null;
  }

  return { changed, added, removed };
};

/**
 * Formats and logs parameter differences.
 *
 * @param diff - Object with differences
 * @param context - Context for console
 * @param channel - Channel label (`params` / `search`) prefixed to the line so
 *   the two-channel split is visible in the output (RFC-4 M2 / #1548)
 */
export const logParamsDiff = (
  diff: ParamsDiff,
  context: string,
  channel: string,
): void => {
  const parts: string[] = [];

  // Cache entries to avoid double iteration
  const changedEntries = objectEntries(diff.changed);

  if (changedEntries.length > 0) {
    const items: string[] = [];

    for (const [key, { from, to }] of changedEntries) {
      items.push(`${key}: ${JSON.stringify(from)} → ${JSON.stringify(to)}`);
    }

    parts.push(`Changed: { ${items.join(", ")} }`);
  }

  if (objectKeys(diff.added).length > 0) {
    parts.push(`Added: ${JSON.stringify(diff.added)}`);
  }

  if (objectKeys(diff.removed).length > 0) {
    parts.push(`Removed: ${JSON.stringify(diff.removed)}`);
  }

  console.log(`[${context}]  ${channel} ${parts.join(", ")}`);
};
