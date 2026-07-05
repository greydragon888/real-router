// Aggregation for one (scenario × engine) sample set: median + p95 + RME.
// Reuses the RME discipline from the retired core mitata suite (RME < 5% = stable).
function round(x) {
  return Math.round(x * 1000) / 1000;
}

export function aggregate(samples) {
  const s = [...samples].sort((a, b) => a - b);
  const n = s.length;
  if (n === 0) return { median: 0, p95: 0, mean: 0, rme: 0, n: 0 };

  const median = n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
  const mean = s.reduce((a, b) => a + b, 0) / n;
  const p95 = s[Math.min(n - 1, Math.ceil(0.95 * n) - 1)];

  // RME (%) at ~95% CI = 1.96 * (stddev / sqrt(n)) / mean * 100
  const variance =
    n > 1 ? s.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1) : 0;
  const sem = Math.sqrt(variance) / Math.sqrt(n);
  const rme = mean ? (1.96 * sem) / mean * 100 : 0;

  return {
    median: round(median),
    p95: round(p95),
    mean: round(mean),
    rme: round(rme),
    n,
  };
}
