import { defineComponent, h, Suspense } from "vue";

/**
 * Cross-adapter alias for Vue's native `<Suspense>`. Symmetric naming with
 * the React/Preact/Solid/Svelte/Angular `<Streamed>` components.
 *
 * Slots:
 * - `default` — content (may contain `<Await>` or `async setup()` children).
 * - `fallback` — shown while any descendant suspends.
 *
 * Vue's `<Suspense>` is **blocking** under SSR (no out-of-order placeholder
 * resolution) — render of HTML after `<Streamed>` waits for every
 * `async setup()` inside. This matches Vue 3's stable streaming behaviour
 * (vs React 19 / Solid which support OOO resolution).
 */
export const Streamed = defineComponent({
  name: "Streamed",
  setup(_, { slots }) {
    return () =>
      h(
        Suspense,
        {},
        {
          default: () => slots.default?.(),
          fallback: () => slots.fallback?.(),
        },
      );
  },
});

export type StreamedProps = InstanceType<typeof Streamed>["$props"];
