import { UNKNOWN_ROUTE } from "@real-router/core";
import { startsWithSegment } from "@real-router/route-utils";
import { Fragment, isVNode } from "vue";

import { Match, NotFound, Self } from "./components";

import type { VNode } from "vue";

type FallbackType = VNode | (() => VNode) | undefined;

interface FallbackSlots {
  selfVNode: VNode | null;
  selfFallback: FallbackType;
  notFoundChildren: unknown;
}

function isSegmentMatch(
  routeName: string,
  fullSegmentName: string,
  exact: boolean,
): boolean {
  if (exact) {
    return routeName === fullSegmentName;
  }

  return startsWithSegment(routeName, fullSegmentName);
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
    if (
      child.type === Match ||
      child.type === Self ||
      child.type === NotFound
    ) {
      result.push(child);
    } else if (child.type === Fragment) {
      collectElements(child.children, result);
    }
  }
}

function recordFallback(child: VNode, slots: FallbackSlots): boolean {
  if (child.type === NotFound) {
    slots.notFoundChildren = child.children;

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
  elements: VNode[],
): FallbackType {
  if (slots.selfVNode !== null && routeName === nodeName) {
    rendered.push(slots.selfVNode);

    return slots.selfFallback;
  }

  if (routeName === UNKNOWN_ROUTE && slots.notFoundChildren !== null) {
    const nfElements = elements.filter((element) => element.type === NotFound);
    /* v8 ignore next 3 */
    const lastNf = nfElements.at(-1);

    if (lastNf) {
      rendered.push(lastNf);
    }
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
} {
  const slots: FallbackSlots = {
    selfVNode: null,
    selfFallback: undefined,
    notFoundChildren: null,
  };
  let activeMatchFound = false;
  let fallback: FallbackType = undefined;
  const rendered: VNode[] = [];

  for (const child of elements) {
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
    fallback = appendFallback(rendered, routeName, nodeName, slots, elements);
  }

  return { rendered, activeMatchFound, fallback };
}
