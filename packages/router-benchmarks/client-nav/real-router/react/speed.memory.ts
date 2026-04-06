import "../../jsdom";
import { setup } from "./setup";
import { runMemoryBenchmark } from "../../memory-utils";

void runMemoryBenchmark({ router: "Real-Router (react)", setup });
