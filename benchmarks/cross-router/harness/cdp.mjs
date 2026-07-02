// Chrome DevTools Protocol helpers via Playwright's CDPSession (Chromium-only).
// Metric names (ScriptDuration / LayoutDuration / RecalcStyleDuration /
// TaskDuration / JSHeapUsedSize) are runtime Chromium metrics from
// Performance.getMetrics — durations are in SECONDS.

export async function attachCDP(page) {
  const client = await page.context().newCDPSession(page);
  await client.send("Performance.enable");
  await client.send("HeapProfiler.enable");
  return client;
}

export async function getMetrics(client) {
  const { metrics } = await client.send("Performance.getMetrics");
  return Object.fromEntries(metrics.map((m) => [m.name, m.value]));
}

// Blink history work (`history.pushState`'s same-document-navigation), which
// `ScriptDuration` (V8-only) does NOT count. Traces `fn`'s navigations and sums
// the `FrameLoader::updateForSameDocumentNavigation` event durations. Returns µs
// (caller divides by nav count). The event `dur` is the real Blink work — tracing
// overhead inflates V8, not this event — so it stays clean even on the hot path.
const BLINK_EVENT = "FrameLoader::updateForSameDocumentNavigation";
export async function traceBlinkUs(client, fn) {
  let sum = 0;
  const onData = (d) => {
    for (const e of d.value) {
      if (e.ph === "X" && e.dur && e.name === BLINK_EVENT) sum += e.dur;
    }
  };
  client.on("Tracing.dataCollected", onData);
  await client.send("Tracing.start", {
    categories:
      "toplevel,devtools.timeline,disabled-by-default-devtools.timeline,v8,blink",
    transferMode: "ReportEvents",
  });
  await fn();
  const complete = new Promise((r) => client.once("Tracing.tracingComplete", r));
  await client.send("Tracing.end");
  await complete;
  client.off("Tracing.dataCollected", onData);
  return sum;
}

// Real forced GC (the browser upgrade over jsdom forceGC), then read used heap.
export async function forceGcHeapBytes(client) {
  await client.send("HeapProfiler.collectGarbage");
  const m = await getMetrics(client);
  return m.JSHeapUsedSize;
}
