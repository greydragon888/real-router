import "../../../shared/jsdom";
import { setup } from "./setup";
import { runMemoryBenchmark } from "../../../shared/memory-utils";

void runMemoryBenchmark({ router: "Real-Router (react)", setup });
