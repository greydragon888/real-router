import { defineComponent } from "vue";

import type { SelfProps } from "./types";
import type { FunctionalComponent, PropType, VNode } from "vue";

function renderNull() {
  return null;
}

export const Match = defineComponent({
  name: "RouteView.Match",
  props: {
    segment: {
      type: String as PropType<string>,
      required: true,
    },
    exact: {
      type: Boolean,
      default: false,
    },
    fallback: {
      type: [Object, Function] as PropType<VNode | (() => VNode)>,
      default: undefined,
    },
    keepAlive: {
      type: Boolean,
      default: false,
    },
  },
  render: renderNull,
});

// Type Self via FunctionalComponent<SelfProps> so the SelfProps interface
// is anchored to the component contract — knip otherwise flags SelfProps
// as unused even though it's re-exported as RouteViewSelfProps for
// consumers wrapping Self in custom HOCs.
const SelfImpl = defineComponent({
  name: "RouteView.Self",
  props: {
    fallback: {
      type: [Object, Function] as PropType<VNode | (() => VNode)>,
      default: undefined,
    },
  },
  render: renderNull,
});

export const Self = SelfImpl as unknown as FunctionalComponent<SelfProps>;

export const NotFound = defineComponent({
  name: "RouteView.NotFound",
  render: renderNull,
});
