// packages/router6-plugin-logger/modules/internal/params-diff.ts

import type { Params } from "router6";

export interface ParamsDiff {
  changed: Record<string, { from: unknown; to: unknown }>;
  added: Record<string, unknown>;
  removed: Record<string, unknown>;
}

/**
 * Calculates differences between two parameter objects.
 * Performs only shallow comparison.
 *
 * @param fromParams - Previous parameters
 * @param toParams - New parameters
 * @returns Object with differences or null if there are no changes
 */
export const getParamsDiff = (
  fromParams: Params,
  toParams: Params,
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
  for (const key in fromParams) {
    if (!(key in toParams)) {
      removed[key] = fromParams[key];
      hasChanges = true;
    } else if (fromParams[key] !== toParams[key]) {
      changed[key] = { from: fromParams[key], to: toParams[key] };
      hasChanges = true;
    }
  }

  // Find added
  for (const key in toParams) {
    if (!(key in fromParams)) {
      added[key] = toParams[key];
      hasChanges = true;
    }
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
 * @param context - Context for logger
 */
export const logParamsDiff = (diff: ParamsDiff, context: string): void => {
  const parts: string[] = [];

  // Cache entries to avoid double iteration
  const changedEntries = Object.entries(diff.changed);

  if (changedEntries.length > 0) {
    const items: string[] = [];

    for (const [key, { from, to }] of changedEntries) {
      items.push(`${key}: ${JSON.stringify(from)} → ${JSON.stringify(to)}`);
    }

    parts.push(`Changed: { ${items.join(", ")} }`);
  }

  const addedEntries = Object.entries(diff.added);

  if (addedEntries.length > 0) {
    parts.push(`Added: ${JSON.stringify(diff.added)}`);
  }

  const removedEntries = Object.entries(diff.removed);

  if (removedEntries.length > 0) {
    parts.push(`Removed: ${JSON.stringify(diff.removed)}`);
  }

  console.log(context, `  ${parts.join(", ")}`);
};
