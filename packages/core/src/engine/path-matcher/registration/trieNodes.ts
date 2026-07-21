// Trie node construction: param-name extraction + the param/splat child creators
// (#736). Consumed by `trie` during insertion.

import { parseSegment } from "../parseSegment";
import { createSegmentNode } from "../pathUtils";
import { throwEmptyParamName, throwParamNameConflict } from "./errors";

import type { SegmentNode } from "../types";

/**
 * Extracts the param name from a marker-led segment (`:name` / `*name`),
 * delegating the boundary to the canonical `parseSegment` tokenizer (#1324) so the
 * trie backstop, the route-tree gate, and `buildParamMeta` share ONE grammar and
 * cannot drift. `registerNode`'s per-segment grammar pre-pass has already rejected
 * every malformed form (name-less #858, trailing marker `:y*`/`:y:` #1324, fused
 * marker #1050, and the M1 removed optional/constraint forms), so a `:param` /
 * `*splat` name is guaranteed here — the error/`static` branches below are an
 * unreachable typed backstop. Single source for the param branch in
 * `processSegment` (the 3-token walk no longer forks, #1516).
 */
export function extractParamName(segment: string): string {
  const token = parseSegment(segment);

  // registerNode's per-segment grammar pass (Реш.2) rejects every malformed segment
  // — name-less (#858), trailing-marker (#1324), fused-marker (#1050), constraint
  // forms — before trie insertion, so a param|splat name is guaranteed here. The
  // error/`static` branches are unreachable, kept as a typed defensive backstop.
  // This ALSO relies on createNode's leading-`/` normalization (#1407): a
  // slash-less path (`a:`) let the trie's index-1 scan drop the leading char and
  // reach `:` here (a name-less marker) — normalization keeps that branch dead.
  /* v8 ignore start -- unreachable: registerNode's grammar pass rejects non-name segments first */
  if ("error" in token || token.kind === "static") {
    throwEmptyParamName();
  }
  /* v8 ignore stop */

  return token.name;
}

/**
 * Returns the param child of `node`, creating it on first use. A pre-existing
 * child with a *different* name is a #736 conflict (two routes binding the same
 * trie position under different names). With the 3-token grammar (M1) insertion is
 * a strict linear walk, so a single route never revisits a slot it created — the
 * former optional-omit `ownNodes` exception is gone with optional params.
 */
export function ensureParamChild(
  node: SegmentNode,
  paramName: string,
): SegmentNode {
  if (!node.paramChild) {
    node.paramChild = { node: createSegmentNode(), name: paramName };
  } else if (node.paramChild.name !== paramName) {
    throwParamNameConflict(node.paramChild.name, paramName, ":");
  }

  return node.paramChild.node;
}

/** Splat counterpart of {@link ensureParamChild}. */
export function ensureSplatChild(
  node: SegmentNode,
  splatName: string,
): SegmentNode {
  if (!node.splatChild) {
    node.splatChild = { node: createSegmentNode(), name: splatName };
  } else if (node.splatChild.name !== splatName) {
    throwParamNameConflict(node.splatChild.name, splatName, "*");
  }

  return node.splatChild.node;
}
