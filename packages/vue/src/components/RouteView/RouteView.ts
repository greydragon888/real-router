import {
  Fragment,
  defineComponent,
  h,
  KeepAlive,
  markRaw,
  Suspense,
} from "vue";

import { Match, NotFound } from "./components";
import { buildRenderList, collectElements } from "./helpers";
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

const emptyKeepAlivePlaceholder = markRaw(
  defineComponent({
    name: "KeepAlive-placeholder",
    render() {
      return null;
    },
  }),
);

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
    keepAlive?: boolean;
  } | null;

  if (matchProps?.keepAlive === true && activeChild.type === Match) {
    /* v8 ignore start */
    const segment = matchProps.segment ?? "__not-found__";
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
    h(KeepAlive, null, { default: () => h(emptyKeepAlivePlaceholder) }),
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

      const elements: VNode[] = [];

      collectElements(slots.default?.(), elements);

      const { rendered, fallback } = buildRenderList(
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
      if (activeChild.type !== Match && activeChild.type !== NotFound) {
        return null;
      }
      /* v8 ignore stop */

      const hasPerMatchKA = elements.some(
        (element) =>
          element.type === Match &&
          (element.props as { keepAlive?: boolean } | null)?.keepAlive === true,
      );

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

export const RouteView = Object.assign(RouteViewComponent, { Match, NotFound });

export type {
  RouteViewProps,
  MatchProps as RouteViewMatchProps,
  NotFoundProps as RouteViewNotFoundProps,
} from "./types";
