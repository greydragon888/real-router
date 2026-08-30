// Trie node construction: the param/splat child creators (#736). Consumed by
// `trie` during insertion, which reads the segment TOKEN from `parseSegment`
// itself (#1998) rather than through a name-extracting wrapper here.

import { createSegmentNode } from "../pathUtils";
import { throwParamNameConflict } from "./errors";

import type { SegmentNode } from "../types";

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
