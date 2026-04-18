import { createDismissableError } from "@real-router/sources";
import { defineComponent, h, watch, Fragment } from "vue";

import { useRouter } from "../composables/useRouter";
import { useRefFromSource } from "../useRefFromSource";

import type { RouterError, State } from "@real-router/core";
import type { VNode, PropType } from "vue";

export const RouterErrorBoundary = defineComponent({
  name: "RouterErrorBoundary",
  props: {
    fallback: {
      type: Function as PropType<
        (error: RouterError, resetError: () => void) => VNode
      >,
      required: true,
    },
    onError: {
      type: Function as PropType<
        (
          error: RouterError,
          toRoute: State | null,
          fromRoute: State | null,
        ) => void
      >,
      default: undefined,
    },
  },
  setup(props, { slots }) {
    const router = useRouter();
    const snapshot = useRefFromSource(createDismissableError(router));

    watch(
      () => snapshot.value.version,
      () => {
        if (snapshot.value.error) {
          props.onError?.(
            snapshot.value.error,
            snapshot.value.toRoute,
            snapshot.value.fromRoute,
          );
        }
      },
      { immediate: true },
    );

    return () => {
      const children = slots.default?.() ?? [];
      const errorVNode = snapshot.value.error
        ? props.fallback(snapshot.value.error, snapshot.value.resetError)
        : null;

      return h(Fragment, null, [...children, errorVNode]);
    };
  },
});

export type RouterErrorBoundaryProps = InstanceType<
  typeof RouterErrorBoundary
>["$props"];
