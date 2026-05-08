import { defineComponent, onMounted, ref } from "vue";

export const ClientOnly = defineComponent({
  name: "ClientOnly",
  setup(_, { slots }) {
    const mounted = ref(false);

    onMounted(() => {
      mounted.value = true;
    });

    return () => (mounted.value ? slots.default?.() : slots.fallback?.());
  },
});

export type ClientOnlyProps = InstanceType<typeof ClientOnly>["$props"];
