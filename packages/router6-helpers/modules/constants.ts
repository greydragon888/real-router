// packages/router6-helpers/modules/constants.ts

/**
 * Maximum allowed segment length (10,000 characters)
 */
export const MAX_SEGMENT_LENGTH = 10_000;

/**
 * Pattern for valid segment characters: alphanumeric + dot + dash + underscore
 * Uses explicit character ranges for clarity and portability.
 * Dash is placed at the end to avoid escaping (no range operator confusion).
 */
export const SAFE_SEGMENT_PATTERN = /^[\w.-]+$/;

/**
 * Route segment separator character
 */
export const ROUTE_SEGMENT_SEPARATOR = ".";
