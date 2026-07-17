import { UNKNOWN_ROUTE } from "@real-router/core";
import { startsWithSegment } from "@real-router/route-utils";
import { Fragment, isVNode } from "vue";

import { Match, NotFound, Self } from "./components";

import type { VNode } from "vue";

const MARKER_TYPES: ReadonlySet<unknown> = new Set([Match, Self, NotFound]);
const KEEP_ALIVE_VALUES: ReadonlySet<unknown> = new Set([
  true,
  "",
  "keep-alive",
]);

type FallbackType = VNode | (() => VNode) | undefined;

interface FallbackSlots {
  selfVNode: VNode | null;
  selfFallback: FallbackType;
  notFoundVNode: VNode | null;
}

export function isSegmentMatch(
  routeName: string,
  fullSegmentName: string,
  exact: boolean,
): boolean {
  if (exact) {
    return routeName === fullSegmentName;
  }

  return startsWithSegment(routeName, fullSegmentName);
}

// Vue compiles boolean-shorthand template attributes (`<Match keepAlive>`) to
// an empty string instead of `true`, and converts them to `true` only when the
// receiving component's prop is declared with `type: Boolean`. `Match` is a
// marker component (`render: null`) — its props are inspected on the VNode
// without ever going through Vue's prop-casting pipeline, so the raw `""` (or
// the hyphenated attribute name) reaches us here. Accept the same trio Vue's
// runtime does.
export function isKeepAliveEnabled(value: unknown): boolean {
  return KEEP_ALIVE_VALUES.has(value);
}

function normalizeChildren(children: unknown): VNode[] {
  if (Array.isArray(children)) {
    const result: VNode[] = [];

    for (const child of children) {
      if (Array.isArray(child)) {
        result.push(...normalizeChildren(child));
      } else if (isVNode(child)) {
        result.push(child);
      }
    }

    return result;
  }

  if (isVNode(children)) {
    return [children];
  }

  return [];
}

export function collectElements(children: unknown, result: VNode[]): void {
  const vnodes = normalizeChildren(children);

  for (const child of vnodes) {
    if (MARKER_TYPES.has(child.type)) {
      result.push(child);
    } else if (child.type === Fragment) {
      collectElements(child.children, result);
    }
  }
}

function recordFallback(child: VNode, slots: FallbackSlots): boolean {
  if (child.type === NotFound) {
    // First-wins: store the FIRST NotFound VNode, ignore later ones — symmetric
    // with <Self> below and the React/Preact/Solid adapters (#1439). Store the
    // VNode (never null for a real marker), not `child.children` (null for a
    // childless <NotFound/>), so the assign-once guard cannot be defeated.
    slots.notFoundVNode ??= child;

    return true;
  }

  if (child.type === Self) {
    if (slots.selfVNode === null) {
      slots.selfVNode = child;
      const props = child.props as { fallback?: FallbackType } | null;

      slots.selfFallback = props?.fallback;
    }

    return true;
  }

  return false;
}

function evaluateMatch(
  child: VNode,
  routeName: string,
  nodeName: string,
): { isActive: boolean; fallback: FallbackType } {
  const props = child.props as {
    segment: string;
    exact?: boolean;
    fallback?: FallbackType;
  } | null;
  const segment = props?.segment ?? "";
  const exact = props?.exact ?? false;
  const fullSegmentName = nodeName ? `${nodeName}.${segment}` : segment;
  const isActive = isSegmentMatch(routeName, fullSegmentName, exact);

  return { isActive, fallback: props?.fallback };
}

function appendFallback(
  rendered: VNode[],
  routeName: string,
  nodeName: string,
  slots: FallbackSlots,
): FallbackType {
  if (slots.selfVNode !== null && routeName === nodeName) {
    rendered.push(slots.selfVNode);

    return slots.selfFallback;
  }

  if (routeName === UNKNOWN_ROUTE && slots.notFoundVNode !== null) {
    rendered.push(slots.notFoundVNode);
  }

  return undefined;
}

export function buildRenderList(
  elements: VNode[],
  routeName: string,
  nodeName: string,
): {
  rendered: VNode[];
  activeMatchFound: boolean;
  fallback?: FallbackType;
  /**
   * True iff any `<Match>` child in the input has its `keepAlive` prop set
   * to one of Vue's accepted boolean-shorthand forms. Surfaced as a
   * side-channel from the single pipeline pass so the caller doesn't have
   * to re-iterate `elements` after `buildRenderList` returns — closes a MED
   * code-quality finding (audit §8.1).
   */
  hasPerMatchKA: boolean;
} {
  const slots: FallbackSlots = {
    selfVNode: null,
    selfFallback: undefined,
    notFoundVNode: null,
  };
  let activeMatchFound = false;
  let fallback: FallbackType;
  let hasPerMatchKA = false;
  const rendered: VNode[] = [];

  for (const child of elements) {
    // Match-only side-channel: scan for the keepAlive shorthand in the same
    // pass that already inspects every child. Short-circuits once a positive
    // is found to avoid redundant prop reads in big slot trees.
    if (!hasPerMatchKA && child.type === Match) {
      const matchProps = child.props as { keepAlive?: unknown } | null;

      if (isKeepAliveEnabled(matchProps?.keepAlive)) {
        hasPerMatchKA = true;
      }
    }

    if (recordFallback(child, slots)) {
      continue;
    }

    if (activeMatchFound) {
      continue;
    }

    const result = evaluateMatch(child, routeName, nodeName);

    if (result.isActive) {
      activeMatchFound = true;
      fallback = result.fallback;
      rendered.push(child);
    }
  }

  if (!activeMatchFound) {
    fallback = appendFallback(rendered, routeName, nodeName, slots);
  }

  return { rendered, activeMatchFound, fallback, hasPerMatchKA };
}
