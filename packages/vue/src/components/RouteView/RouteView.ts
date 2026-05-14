import {
  Fragment,
  defineComponent,
  h,
  KeepAlive,
  markRaw,
  Suspense,
} from "vue";

import { Match, NotFound, Self } from "./components";
import {
  buildRenderList,
  collectElements,
  isKeepAliveEnabled,
} from "./helpers";
import { useRouteNode } from "../../composables/useRouteNode";

import type { Component, VNode } from "vue";

type SlotChildren = Record<string, (() => VNode[]) | undefined> | null;

function getSlotContent(vnode: VNode): VNode[] | null {
  const slots = vnode.children as SlotChildren;

  return slots?.default?.() ?? null;
}

function getOrCreateWrapper(
  cache: Map<string, Component>,
  segment: string,
): Component {
  const existing = cache.get(segment);

  if (existing) {
    return existing;
  }

  const wrapper = markRaw(
    defineComponent({
      name: `KeepAlive-${segment}`,
      setup(_wrapperProps, wrapperCtx) {
        return () => wrapperCtx.slots.default?.();
      },
    }),
  );

  cache.set(segment, wrapper);

  return wrapper;
}

function wrapWithSuspense(content: VNode, fallback: unknown): VNode {
  if (fallback === undefined) {
    return content;
  }

  const fallbackContent =
    typeof fallback === "function" ? (fallback as () => VNode)() : fallback;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment
  const suspenseComponent = Suspense as any;

  return h(
    suspenseComponent,
    {},
    {
      default: () => content,
      fallback: () => fallbackContent,
    },
  );
}

// Lazy-initialised — only allocated when a per-Match keepAlive path needs to
// keep the cache slot "occupied" with a no-render placeholder. Apps without
// keepAlive never pay the markRaw + defineComponent allocation at import.
let emptyKeepAlivePlaceholderInstance: Component | null = null;

function getEmptyKeepAlivePlaceholder(): Component {
  emptyKeepAlivePlaceholderInstance ??= markRaw(
    defineComponent({
      name: "KeepAlive-placeholder",
      render() {
        return null;
      },
    }),
  );

  return emptyKeepAlivePlaceholderInstance;
}

function renderWithRootKA(
  activeChild: VNode,
  wrapperCache: Map<string, Component>,
  fallback: unknown,
): VNode {
  const activeProps = activeChild.props as { segment?: string } | null;
  const segment = activeProps?.segment ?? "__not-found__";
  const WrapperComponent = getOrCreateWrapper(wrapperCache, segment);
  const slotContent = getSlotContent(activeChild) ?? [];
  const keepAliveContent = h(KeepAlive, null, {
    default: () =>
      h(WrapperComponent, { key: segment }, { default: () => slotContent }),
  });

  return wrapWithSuspense(keepAliveContent, fallback);
}

function renderWithPerMatchKA(
  activeChild: VNode,
  wrapperCache: Map<string, Component>,
  fallback: unknown,
): VNode | null {
  const matchProps = activeChild.props as {
    segment?: string;
    keepAlive?: unknown;
  } | null;

  if (isKeepAliveEnabled(matchProps?.keepAlive) && activeChild.type === Match) {
    /* v8 ignore start */
    const segment = matchProps?.segment ?? "__not-found__";
    /* v8 ignore stop */
    const WrapperComponent = getOrCreateWrapper(wrapperCache, segment);
    const slotContent = getSlotContent(activeChild) ?? [];

    return h(Fragment, [
      h(KeepAlive, null, {
        default: () =>
          h(WrapperComponent, { key: segment }, { default: () => slotContent }),
      }),
    ]);
  }

  const content = getSlotContent(activeChild);

  /* v8 ignore start */
  if (!content) {
    return null;
  }
  /* v8 ignore stop */

  return h(Fragment, [
    h(KeepAlive, null, {
      default: () => h(getEmptyKeepAlivePlaceholder()),
    }),
    wrapWithSuspense(h(Fragment, content), fallback),
  ]);
}

const RouteViewComponent = defineComponent({
  name: "RouteView",
  props: {
    nodeName: {
      type: String,
      required: true,
    },
    keepAlive: {
      type: Boolean,
      default: false,
    },
  },
  setup(props, { slots }) {
    const routeContext = useRouteNode(props.nodeName);
    const wrapperCache = new Map<string, Component>();

    return (): VNode | null => {
      const route = routeContext.route.value;

      if (!route) {
        return null;
      }

      const slotOutput = slots.default?.();
      const elements: VNode[] = [];

      collectElements(slotOutput, elements);

      // `hasPerMatchKA` is a side-channel produced by the same pipeline pass
      // that builds `rendered` — closes the audit §8.1 "double iteration"
      // finding. The previous identity-cache on `slotOutput` is no longer
      // needed: per-render cost is one O(n) walk instead of two.
      const { rendered, fallback, hasPerMatchKA } = buildRenderList(
        elements,
        route.name,
        props.nodeName,
      );

      if (rendered.length === 0) {
        return null;
      }

      const activeChild = rendered[0];

      if (props.keepAlive) {
        return renderWithRootKA(activeChild, wrapperCache, fallback);
      }

      /* v8 ignore start */
      if (
        activeChild.type !== Match &&
        activeChild.type !== Self &&
        activeChild.type !== NotFound
      ) {
        return null;
      }
      /* v8 ignore stop */

      if (hasPerMatchKA) {
        return renderWithPerMatchKA(activeChild, wrapperCache, fallback);
      }

      const content = getSlotContent(activeChild);

      if (!content) {
        return null;
      }

      return wrapWithSuspense(h(Fragment, content), fallback);
    };
  },
});

export const RouteView = Object.assign(RouteViewComponent, {
  Match,
  Self,
  NotFound,
});

export type {
  RouteViewProps,
  MatchProps as RouteViewMatchProps,
  SelfProps as RouteViewSelfProps,
  NotFoundProps as RouteViewNotFoundProps,
} from "./types";
