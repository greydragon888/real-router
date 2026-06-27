import "../../../shared/jsdom";
import { setup } from "./setup";
import { runMemoryBenchmark } from "../../../shared/memory-utils";

void runMemoryBenchmark({
  router: "TanStack (react, interrupted-navigations)",
  setup,
  navsPerRound: 150,
});
