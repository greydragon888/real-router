import react from "@vitejs/plugin-react";

import { adapterBuild } from "./base.mts";

export default adapterBuild("react", "adapter-bench/apps/react.tsx", [
  react(),
]);
