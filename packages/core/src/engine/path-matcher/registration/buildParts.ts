// Build-path template compilation: turns a (constraint-stripped) route path into
// `buildStaticParts` + `buildParamSlots` through the shared `parseSegment` tokenizer (Decision 1).

import { encodeParam, ENCODING_METHODS } from "../encoding";
import {
  parseSegment,
  splitPathSegments,
  type SegmentTokens,
} from "../parseSegment";
import { EMPTY_PARAM_SLOTS } from "./context";

import type {
  BuildParamSlot,
  MatcherInputNode,
  URLParamsEncodingType,
} from "../types";

/**
 * Builds one `BuildParamSlot` from a param/splat token. The encoder is the single
 * `encodeParam` implementation the encoding unit/property suites assert (the splat
 * variant encodes each segment individually, preserving `/`), so prod and the
 * oracle can't drift (#860).
 *
 * The kind comes from the TOKEN the caller already narrowed, never from a set of
 * splat NAMES gathered across the ancestor chain (#1975). The two are not the
 * same question: the finality rule below drops a non-final splat before it can
 * become a slot, and a name set does not know about finality — so under a name
 * set a child's `:x` beneath a parent's `/*x` took the splat encoder, printed
 * its `/` raw, and `buildPath` emitted a URL the same matcher resolved to the
 * PARENT with the tail glued into the value. Reading the token asks the one
 * question a slot's encoder depends on, and cannot drift from the finality rule.
 *
 * ⚠ Observable in TWO of the four encodings, measured: under `uri` and `none`
 * the two encoders are IDENTICAL (`encodeURI` never escapes `/`, so the
 * per-segment split/join is a no-op; `none` is identity both ways), so there is
 * nothing for this choice to change and the mis-built URL persists there. That
 * is a property of those modes rather than of this function — a plain `:param`
 * carrying a `/` does not round-trip under them either — but no claim about
 * this fix holds unconditionally across encodings.
 */
function makeBuildParamSlot(
  token: Extract<SegmentTokens, { kind: "param" | "splat" }>,
  encoding: URLParamsEncodingType,
): BuildParamSlot {
  const isSplat = token.kind === "splat";

  return {
    paramName: token.name,
    encoder: isSplat
      ? (value: string): string => encodeParam(value, encoding)
      : ENCODING_METHODS[encoding],
  };
}

export function compileBuildParts(
  normalizedPath: string,
  segments: readonly MatcherInputNode[],
  encoding: URLParamsEncodingType,
  rootUrlParams: readonly string[],
): {
  buildStaticParts: readonly string[];
  buildParamSlots: readonly BuildParamSlot[];
} {
  // `normalizedPath` carries the ROOT path as its prefix, but the root node is
  // absent from `segments` — so seeding these from the segment walk alone made a
  // root-declared slot invisible here, and the fast path below emitted the whole
  // path (`:tenant` included) as literal static text (#1567).
  const allUrlParams = new Set<string>(rootUrlParams);

  for (const segment of segments) {
    for (const param of segment.paramMeta.urlParams) {
      allUrlParams.add(param);
    }
  }

  // Stryker disable next-line BlockStatement: equivalent — fast path; the param-compile loop below yields [normalizedPath]/[] when allUrlParams is empty — identical output. Proven by injection.
  if (allUrlParams.size === 0) {
    return {
      buildStaticParts: [normalizedPath],
      buildParamSlots: EMPTY_PARAM_SLOTS,
    };
  }

  const parts: string[] = [];
  const slots: BuildParamSlot[] = [];
  let current = "";

  // Build the static-parts / param-slots template through the SAME tokenizer the
  // trie (L3) and `buildParamMeta` (L1) consume — `parseSegment`, not a parallel
  // `paramRgx` — so build's param NAME can no longer drift from the trie's
  // (#1050/#1150 build≠match closed structurally, not just by the round-trip
  // property). The path is already constraint-stripped (`matchPath`), so
  // `parseSegment` sees only name/optional; each `/` separator `splitPathSegments`
  // split away is re-added to the running static part.
  const pathSegments = splitPathSegments(normalizedPath);
  const lastIndex = pathSegments.length - 1;

  for (const [i, pathSegment] of pathSegments.entries()) {
    const token = parseSegment(pathSegment);

    // A splat binds ONLY as the final segment. The trie matches a splat node's
    // children at the splat's OWN position (INVARIANTS Matching #24: `/n/*rest`
    // + `/n/*rest/edit` → `/n/edit` resolves to the child), so a splat with
    // anything after it always captures the empty string. Emitting a slot for it
    // printed a URL `match` could not resolve — or, under a splat parent, one
    // that fell back to the parent's wildcard. It contributes neither text nor
    // separator. (#1568)
    if (!("error" in token) && token.kind === "splat" && i !== lastIndex) {
      continue;
    }

    if (i > 0) {
      current += "/";
    }

    if ("error" in token || token.kind === "static") {
      // Static text — or a malformed segment, whose route is rejected at
      // `registerTree` before these buildParts are ever read (output moot).
      current += pathSegment;
      continue;
    }

    // param | splat: close the accumulated static part, emit a slot.
    parts.push(current);
    current = "";
    slots.push(makeBuildParamSlot(token, encoding));
  }

  parts.push(current);

  return { buildStaticParts: parts, buildParamSlots: slots };
}
