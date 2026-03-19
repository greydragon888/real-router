import { Fragment, defineComponent, h, KeepAlive, markRaw } from "vue";

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

      const { rendered } = buildRenderList(
        elements,
        route.name,
        props.nodeName,
      );

      if (rendered.length === 0) {
        return null;
      }

      const activeChild = rendered[0];

      if (!props.keepAlive) {
        if (activeChild.type === Match || activeChild.type === NotFound) {
          const content = getSlotContent(activeChild);

          if (!content) {
            return null;
          }

          return h(Fragment, content);
        }

        /* v8 ignore start */
        return null;
        /* v8 ignore stop */
      }

      const activeProps = activeChild.props as {
        segment?: string;
      } | null;
      const segment = activeProps?.segment ?? "__not-found__";

      const WrapperComponent = getOrCreateWrapper(wrapperCache, segment);
      const slotContent = getSlotContent(activeChild) ?? [];

      return h(KeepAlive, null, {
        default: () =>
          h(WrapperComponent, { key: segment }, { default: () => slotContent }),
      });
    };
  },
});

export const RouteView = Object.assign(RouteViewComponent, { Match, NotFound });

export type {
  RouteViewProps,
  MatchProps as RouteViewMatchProps,
  NotFoundProps as RouteViewNotFoundProps,
} from "./types";
