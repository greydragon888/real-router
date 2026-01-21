// packages/helpers/modules/types.ts

import type { State } from "@real-router/core";

/**
 * Type definition for segment test functions.
 * These functions can be called directly with a segment, or curried for later use.
 */
export interface SegmentTestFunction {
  (route: State | string): (segment: string) => boolean;
  (route: State | string, segment: string): boolean;
  (route: State | string, segment: null): false;
  (
    route: State | string,
    segment?: string | null,
  ): boolean | ((segment: string) => boolean);
}
