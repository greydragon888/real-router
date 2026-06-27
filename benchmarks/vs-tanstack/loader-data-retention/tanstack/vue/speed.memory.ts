import "../../../shared/jsdom";
import { setup } from "./setup";
import { runMemoryBenchmark } from "../../../shared/memory-utils";

void runMemoryBenchmark({
  router: "TanStack (vue, loader-data-retention)",
  setup,
  navsPerRound: 100,
});
