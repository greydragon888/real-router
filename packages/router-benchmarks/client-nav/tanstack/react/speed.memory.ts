import "../../jsdom";
import { setup } from "./setup";
import { runMemoryBenchmark } from "../../memory-utils";

// TanStack throws stack overflow asynchronously during router cleanup
// (commitLocationPromise chain unwinds — see TANSTACK_STACK_OVERFLOW.md).
// The report is already printed by this point, so exit cleanly.
process.on("uncaughtException", (error) => {
  if (error instanceof RangeError) {
    process.exit(0);
  }

  throw error;
});

void runMemoryBenchmark({ router: "TanStack Router (react)", setup });
