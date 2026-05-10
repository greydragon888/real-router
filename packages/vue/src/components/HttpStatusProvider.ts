import { defineComponent, provide } from "vue";

import { HTTP_STATUS_KEY } from "../context";

import type { HttpStatusSink } from "../utils/createHttpStatusSink";
import type { PropType } from "vue";

export const HttpStatusProvider = defineComponent({
  name: "HttpStatusProvider",
  props: {
    sink: { type: Object as PropType<HttpStatusSink>, required: true },
  },
  setup(props, { slots }) {
    provide(HTTP_STATUS_KEY, props.sink);

    return () => slots.default?.();
  },
});

export type HttpStatusProviderProps = InstanceType<
  typeof HttpStatusProvider
>["$props"];
