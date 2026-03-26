import { UNKNOWN_ROUTE } from "@real-router/core";
import { startsWithSegment } from "@real-router/route-utils";
import { Fragment, isVNode } from "vue";

import { Match, NotFound } from "./components";

import type { VNode } from "vue";

type FallbackType = VNode | (() => VNode) | undefined;

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
    if (child.type === Match || child.type === NotFound) {
      result.push(child);
    } else if (child.type === Fragment) {
      collectElements(child.children, result);
    }
  }
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
  let notFoundChildren: unknown = null;
  let activeMatchFound = false;
  let fallback: FallbackType = undefined;
  const rendered: VNode[] = [];

  for (const child of elements) {
    if (child.type === NotFound) {
      notFoundChildren = child.children;
      continue;
    }

    const props = child.props as {
      segment: string;
      exact?: boolean;
      fallback?: FallbackType;
    } | null;
    const segment = props?.segment ?? "";
    const exact = props?.exact ?? false;
    const fullSegmentName = nodeName ? `${nodeName}.${segment}` : segment;
    const isActive =
      !activeMatchFound && isSegmentMatch(routeName, fullSegmentName, exact);

    if (isActive) {
      activeMatchFound = true;
      fallback = props?.fallback;
      rendered.push(child);
    }
  }

  if (
    !activeMatchFound &&
    routeName === UNKNOWN_ROUTE &&
    notFoundChildren !== null
  ) {
    const nfElements = elements.filter((element) => element.type === NotFound);
    /* v8 ignore next 3 */
    const lastNf = nfElements.at(-1);

    if (lastNf) {
      rendered.push(lastNf);
    }
  }

  return { rendered, activeMatchFound, fallback };
}
