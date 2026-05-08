import { defineComponent, onMounted, ref } from "vue";

export const ServerOnly = defineComponent({
  name: "ServerOnly",
  setup(_, { slots }) {
    const mounted = ref(false);

    onMounted(() => {
      mounted.value = true;
    });

    return () => (mounted.value ? slots.fallback?.() : slots.default?.());
  },
});

export type ServerOnlyProps = InstanceType<typeof ServerOnly>["$props"];
