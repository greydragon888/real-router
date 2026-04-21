import { createActiveRouteSource } from "@real-router/sources";
import { defineComponent, h, computed, shallowRef, watch } from "vue";

import { useRouter } from "../composables/useRouter";
import { EMPTY_PARAMS, EMPTY_OPTIONS } from "../constants";
import { shouldNavigate, buildHref, buildActiveClassName } from "../dom-utils";

import type { Params, NavigationOptions } from "@real-router/core";
import type { PropType } from "vue";

type OnClickHandler = (evt: MouseEvent) => void;

/**
 * Vue's compiled template binds multiple `@click` handlers as an array.
 * Single render-function `onClick` is a function. Both must be invoked.
 */
function invokeAttributesOnClick(value: unknown, evt: MouseEvent): void {
  if (typeof value === "function") {
    (value as OnClickHandler)(evt);

    return;
  }
  if (Array.isArray(value)) {
    const handlers = value as OnClickHandler[];

    for (const fn of handlers) {
      if (typeof fn === "function") {
        fn(evt);

        if (evt.defaultPrevented) {
          return;
        }
      }
    }
  }
}

export const Link = defineComponent({
  name: "Link",
  // Disable Vue's automatic attribute fallthrough. Without this, attrs.onClick
  // (function OR array) is auto-attached as a native click listener AND our
  // explicit onClick fires too — user handlers are double-invoked. We invoke
  // attrs.onClick manually inside handleClick to preserve preventDefault.
  inheritAttrs: false,
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

    const isActive = shallowRef(false);

    // watch with an explicit dep getter recreates the source ONLY when
    // routeName/routeParams/strict/ignoreQueryParams change — not on every
    // reactive read inside the source factory (the watchEffect alternative
    // would also re-subscribe whenever isActive itself changed).
    watch(
      () =>
        [
          props.routeName,
          props.routeParams,
          props.activeStrict,
          props.ignoreQueryParams,
        ] as const,
      (
        [routeName, routeParams, activeStrict, ignoreQueryParams],
        _prev,
        onCleanup,
      ) => {
        const source = createActiveRouteSource(router, routeName, routeParams, {
          strict: activeStrict,
          ignoreQueryParams,
        });

        isActive.value = source.getSnapshot();

        const unsub = source.subscribe(() => {
          isActive.value = source.getSnapshot();
        });

        onCleanup(unsub);
      },
      { immediate: true, flush: "sync" },
    );

    const href = computed(() =>
      buildHref(router, props.routeName, props.routeParams),
    );

    const finalClassName = computed(() =>
      buildActiveClassName(isActive.value, props.activeClassName, props.class),
    );

    const handleClick = (evt: MouseEvent) => {
      // Vue allows attrs.onClick to be a function or an array of functions
      // (compiled templates with multiple @click bindings produce arrays).
      // Both must be invoked; treating arrays as "no handler" silently drops
      // user code.
      if (attrs.onClick !== undefined && attrs.onClick !== null) {
        invokeAttributesOnClick(attrs.onClick, evt);

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

    return () => {
      // Build forwarded attrs without `onClick`. Vue's runtime auto-attaches
      // attrs.onClick (function OR array) as a native DOM listener, which would
      // double-invoke user handlers when combined with our explicit `onClick`.
      // We invoke the original attrs.onClick manually inside handleClick so the
      // preventDefault contract is preserved.
      const restAttributes: Record<string, unknown> = {};

      for (const key of Object.keys(attrs)) {
        if (key !== "onClick") {
          restAttributes[key] = (attrs as Record<string, unknown>)[key];
        }
      }

      return h(
        "a",
        {
          ...restAttributes,
          href: href.value,
          class: finalClassName.value,
          target: props.target,
          onClick: handleClick,
        },
        slots.default?.(),
      );
    };
  },
});
