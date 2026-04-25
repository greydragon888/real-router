import {
  Fragment,
  defineComponent,
  h,
  KeepAlive,
  markRaw,
  Suspense,
} from "vue";

import { Match, NotFound, Self } from "./components";
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

// Vue compiles boolean-shorthand template attributes (`<Match keepAlive>`) to
// an empty string instead of `true`, and converts them to `true` only when the
// receiving component's prop is declared with `type: Boolean`. `Match` is a
// marker component (`render: null`) — its props are inspected on the VNode
// without ever going through Vue's prop-casting pipeline, so the raw `""` (or
// the hyphenated attribute name) reaches us here. Accept the same trio Vue's
// runtime does.
function isKeepAliveEnabled(value: unknown): boolean {
  return value === true || value === "" || value === "keep-alive";
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

    // Cache per-Match `keepAlive` detection by slot output identity. Slot
    // contents change reference only when the parent re-renders with new
    // children, so steady-state navigations skip the O(n) `.some(...)` scan.
    let lastSlotOutput: unknown = null;
    let lastHasPerMatchKA = false;

    function detectPerMatchKA(elements: VNode[], slotOutput: unknown): boolean {
      /* v8 ignore next 3 -- @preserve: Vue's compiled slot wrapper allocates a
         new array per render call in JSDOM tests; identity-cache hits in
         production where parent compiled templates share slot output, but
         is unobservable through TestBed-style assertions. */
      if (slotOutput === lastSlotOutput) {
        return lastHasPerMatchKA;
      }

      lastSlotOutput = slotOutput;
      lastHasPerMatchKA = elements.some(
        (element) =>
          element.type === Match &&
          isKeepAliveEnabled(
            (element.props as { keepAlive?: unknown } | null)?.keepAlive,
          ),
      );

      return lastHasPerMatchKA;
    }

    return (): VNode | null => {
      const route = routeContext.route.value;

      if (!route) {
        return null;
      }

      const slotOutput = slots.default?.();
      const elements: VNode[] = [];

      collectElements(slotOutput, elements);

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
      if (
        activeChild.type !== Match &&
        activeChild.type !== Self &&
        activeChild.type !== NotFound
      ) {
        return null;
      }
      /* v8 ignore stop */

      const hasPerMatchKA = detectPerMatchKA(elements, slotOutput);

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
