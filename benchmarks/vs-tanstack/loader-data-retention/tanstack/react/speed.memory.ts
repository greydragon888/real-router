import "../../../shared/jsdom";
import { setup } from "./setup";
import { runMemoryBenchmark } from "../../../shared/memory-utils";

void runMemoryBenchmark({
  router: "TanStack (react, loader-data-retention)",
  setup,
  navsPerRound: 100,
});
