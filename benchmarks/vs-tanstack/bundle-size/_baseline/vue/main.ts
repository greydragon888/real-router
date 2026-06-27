import { createApp, h } from "vue";

// Framework-only baseline: Vue runtime, no router.
createApp({ render: () => h("div", "hello world") }).mount("#root");
