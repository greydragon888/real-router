/**
 * Test-only barrel. Intentionally NOT re-exported from
 * `shared/dom-utils/index.ts` so the helpers don't leak into adapters'
 * public API surface. Property tests import from this path directly:
 *
 *   import { computeExpectedFragment } from "../../src/dom-utils/__test-helpers";
 */

export { computeExpectedFragment } from "./expected-fragment.js";
