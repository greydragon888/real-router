// Build-path template compilation: turns a (constraint-stripped) route path into
// `buildStaticParts` + `buildParamSlots` through the shared `parseSegment` tokenizer (Реш.1).

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
 */
function makeBuildParamSlot(
  token: Extract<SegmentTokens, { kind: "param" | "splat" }>,
  allSplatParams: ReadonlySet<string>,
  encoding: URLParamsEncodingType,
): BuildParamSlot {
  const isSplat = allSplatParams.has(token.name);

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
): {
  buildStaticParts: readonly string[];
  buildParamSlots: readonly BuildParamSlot[];
} {
  const allUrlParams = new Set<string>();
  const allSplatParams = new Set<string>();

  for (const segment of segments) {
    for (const param of segment.paramMeta.urlParams) {
      allUrlParams.add(param);
    }

    for (const param of segment.paramMeta.spatParams) {
      allSplatParams.add(param);
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

  for (const [i, pathSegment] of pathSegments.entries()) {
    if (i > 0) {
      current += "/";
    }

    const token = parseSegment(pathSegment);

    if ("error" in token || token.kind === "static") {
      // Static text — or a malformed segment, whose route is rejected at
      // `registerTree` before these buildParts are ever read (output moot).
      current += pathSegment;
      continue;
    }

    // param | splat: close the accumulated static part, emit a slot.
    parts.push(current);
    current = "";
    slots.push(makeBuildParamSlot(token, allSplatParams, encoding));
  }

  parts.push(current);

  return { buildStaticParts: parts, buildParamSlots: slots };
}
