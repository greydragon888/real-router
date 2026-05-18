import { defineComponent } from "vue";

import { useDeferred } from "../composables/useDeferred";

/**
 * Reads `useDeferred(name)` and hands the resolved value to the `default`
 * scoped slot via Vue's native `async setup()` Suspense pattern. Wrap in
 * `<Streamed>` (or Vue's `<Suspense>`).
 *
 * ```vue-html
 * <Streamed>
 *   <Await name="reviews" v-slot="{ value }">
 *     <ReviewList :items="value" />
 *   </Await>
 *   <template #fallback>
 *     <Spinner />
 *   </template>
 * </Streamed>
 * ```
 *
 * Or with the render function:
 *
 * ```ts
 * h(Await, { name: "reviews" }, {
 *   default: ({ value }: { value: Review[] }) => h(ReviewList, { items: value }),
 * });
 * ```
 *
 * Implementation: `async setup()` awaits the deferred promise. Vue's
 * `<Suspense>` boundary catches the pending promise and shows the fallback
 * until resolution. Rejection bubbles to the nearest `onErrorCaptured`
 * handler.
 */
export const Await = defineComponent({
  name: "Await",
  props: {
    /** Deferred key declared in the loader's `defer({ deferred: { <name>: ... } })`. */
    name: { type: String, required: true },
  },
  async setup(props, { slots }) {
    const value = await useDeferred(props.name);

    return () => slots.default?.({ value });
  },
});

export type AwaitProps = InstanceType<typeof Await>["$props"];
