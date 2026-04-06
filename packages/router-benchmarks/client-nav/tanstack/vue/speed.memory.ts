import "../../jsdom";
import { setup } from "./setup";
import { runMemoryBenchmark } from "../../memory-utils";

process.on("uncaughtException", (error) => {
  if (error instanceof RangeError) {
    process.exit(0);
  }

  throw error;
});

void runMemoryBenchmark({ router: "TanStack Router (vue)", setup });
