import { defineComponent } from "vue";

import type { PropType } from "vue";

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
  },
  render: renderNull,
});

export const NotFound = defineComponent({
  name: "RouteView.NotFound",
  render: renderNull,
});
