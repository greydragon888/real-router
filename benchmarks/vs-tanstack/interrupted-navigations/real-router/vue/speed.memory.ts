import "../../../shared/jsdom";
import { setup } from "./setup";
import { runMemoryBenchmark } from "../../../shared/memory-utils";

void runMemoryBenchmark({
  router: "Real-Router (vue, interrupted-navigations)",
  setup,
  navsPerRound: 150,
});
