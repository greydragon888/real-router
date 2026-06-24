// packages/route-node/modules/search-params/utils.ts

/**
 * Utility functions for search-params.
 *
 * Internalized from https://github.com/troch/search-params
 *
 * @module search-params/utils
 */

// =============================================================================
// Query String Extraction
// =============================================================================

/**
 * Extracts the query string portion from a path.
 * Returns everything after "?" or the entire string if no "?" exists.
 */
export const getSearch = (path: string): string => {
  const pos = path.indexOf("?");

  // Stryker disable next-line BlockStatement: equivalent — fast path; when there is no "?" (pos === -1) the fallthrough `path.slice(pos + 1)` is `path.slice(0)` === path, identical result (proven by injection). ConditionalExpression stays live (killable `->true` sibling returns the whole path on a "?"-bearing input).
  if (pos === -1) {
    return path;
  }

  return path.slice(pos + 1);
};
