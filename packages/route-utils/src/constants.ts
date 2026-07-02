// packages/route-utils/src/constants.ts

/**
 * Maximum allowed segment length (10,000 characters)
 */
export const MAX_SEGMENT_LENGTH = 10_000;

/**
 * Pattern for valid segment characters: word char + dot + dash.
 * `\w` is the word-character shorthand class (`[A-Za-z0-9_]`) — NOT explicit
 * ranges. Dash is placed at the end to avoid escaping (no range operator confusion).
 */
export const SAFE_SEGMENT_PATTERN = /^[\w.-]+$/;

/**
 * Route segment separator character
 */
export const ROUTE_SEGMENT_SEPARATOR = ".";
