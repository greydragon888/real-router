import { defineComponent, h, computed } from "vue";

import { useIsActiveRoute } from "../composables/useIsActiveRoute";
import { useRouter } from "../composables/useRouter";
import { EMPTY_PARAMS, EMPTY_OPTIONS } from "../constants";
import { shouldNavigate } from "../utils";

import type { Params, NavigationOptions } from "@real-router/core";
import type { PropType } from "vue";

export const Link = defineComponent({
  name: "Link",
  props: {
    routeName: {
      type: String,
      required: true,
    },
    routeParams: {
      type: Object as PropType<Params>,
      default: () => EMPTY_PARAMS,
    },
    routeOptions: {
      type: Object as PropType<NavigationOptions>,
      default: () => EMPTY_OPTIONS,
    },
    class: {
      type: String,
      default: undefined,
    },
    activeClassName: {
      type: String,
      default: "active",
    },
    activeStrict: {
      type: Boolean,
      default: false,
    },
    ignoreQueryParams: {
      type: Boolean,
      default: true,
    },
    target: {
      type: String,
      default: undefined,
    },
  },
  setup(props, { slots, attrs }) {
    const router = useRouter();

    const isActive = useIsActiveRoute(
      props.routeName,
      props.routeParams,
      props.activeStrict,
      props.ignoreQueryParams,
    );

    const href = computed(() => {
      if (typeof router.buildUrl === "function") {
        return router.buildUrl(props.routeName, props.routeParams);
      }

      return router.buildPath(props.routeName, props.routeParams);
    });

    const finalClassName = computed(() => {
      if (isActive.value && props.activeClassName) {
        return props.class
          ? `${props.class} ${props.activeClassName}`.trim()
          : props.activeClassName;
      }

      return props.class ?? undefined;
    });

    const handleClick = (evt: MouseEvent) => {
      if (attrs.onClick && typeof attrs.onClick === "function") {
        (attrs.onClick as (evt: MouseEvent) => void)(evt);

        if (evt.defaultPrevented) {
          return;
        }
      }

      if (!shouldNavigate(evt) || props.target === "_blank") {
        return;
      }

      evt.preventDefault();
      router
        .navigate(props.routeName, props.routeParams, props.routeOptions)
        .catch(() => {});
    };

    return () =>
      h(
        "a",
        {
          ...attrs,
          href: href.value,
          class: finalClassName.value,
          target: props.target,
          onClick: handleClick,
        },
        slots.default?.(),
      );
  },
});
