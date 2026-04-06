import { setup } from "./setup";
import { window } from "../../jsdom";

const DURATION_MS = 10_000;

async function main() {
  const test = setup();

  try {
    await test.before();
    const startedAt = performance.now();

    while (performance.now() - startedAt < DURATION_MS) {
      await test.tick();
    }
  } finally {
    test.after();
    window.close();
  }
}

await main();
