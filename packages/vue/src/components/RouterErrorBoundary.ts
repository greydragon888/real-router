import { defineComponent, h, ref, watch, computed, Fragment } from "vue";

import { useRouterError } from "../composables/useRouterError";

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
    const snapshot = useRouterError();
    const dismissedVersion = ref(-1);

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

    const visibleError = computed(() =>
      snapshot.value.version > dismissedVersion.value
        ? snapshot.value.error
        : null,
    );

    const resetError = () => {
      dismissedVersion.value = snapshot.value.version;
    };

    return () => {
      const children = slots.default?.() ?? [];
      const errorVNode = visibleError.value
        ? props.fallback(visibleError.value, resetError)
        : null;

      return h(Fragment, null, [...children, errorVNode]);
    };
  },
});

export type RouterErrorBoundaryProps = InstanceType<
  typeof RouterErrorBoundary
>["$props"];
