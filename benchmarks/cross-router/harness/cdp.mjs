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

// Transient allocation (bytes) produced during `fn` — the memory counterpart to
// the script/Blink CPU metrics. Wraps the work in a HeapProfiler allocation
// sample and sums the profile's self-sizes = total bytes allocated (garbage
// included), the driver of GC pressure / jank under load. Pair with a nav count
// → KB/nav. A finer `samplingInterval` = more samples = tighter estimate at some
// overhead; 256 B yields ~30+ samples even for the leanest router over ~60 navs,
// which the warmup+K aggregation then stabilizes. Distinct from
// `forceGcHeapBytes` (retained heap after GC) — this counts churn, not footprint.
export async function sampleAllocationBytes(client, fn, samplingInterval = 256) {
  await client.send("HeapProfiler.enable");
  await client.send("HeapProfiler.startSampling", { samplingInterval });
  await fn();
  const { profile } = await client.send("HeapProfiler.stopSampling");
  await client.send("HeapProfiler.disable");
  const sumSelf = (node) =>
    (node.selfSize || 0) +
    (node.children || []).reduce((acc, c) => acc + sumSelf(c), 0);
  return sumSelf(profile.head);
}
