# plugins namespace audit probes — 2026-07-04 (дельта-прогон к baseline 2026-06-25)

Run: `cd benchmarks && NODE_OPTIONS='--conditions=@real-router/internal-source' npx tsx audit-probes/plugins-2026-07-04/probe-02-*.ts`

## Регрессия: перегон baseline-пробы `plugins-2026-06-25/probe-01-namespace-invariants.ts`

Все вердикты идентичны baseline (dist ≡ src, md5 `09d3b648…`): P1 COVERAGE (1 composite
unsub на батч), P2 BATCH_ATOMIC rollback, P3 EVENT_METHOD_COVERAGE (вкл. LeaveApprove),
P5 FROZEN, P6 disposeAll COMPLETE+IDEMPOTENT. **0 регрессий** после дельты #974 (#960
dead `#limits` removal / #961 / #962). ⚠️ line-refs в stdout пробы (`:147-175`, `:242`)
дрейфанули (файл теперь 269 строк) — вердикты поведенческие, актуальны.

## probe-02-emit-cost-latency.ts (закрывает baseline-пробел §10 — был [SKIPPED: battery]; AC)

| Вариант | avg | Δ vs baseline |
|---|---|---|
| A navigate, 0 плагинов | 661.0 ns | — |
| B navigate, 1 плагин без хуков | 747.6 ns | +87 ns (пол шума между инстансами — `[НЕ ПОДТВЕРЖДЕНО]` как сигнал) |
| C navigate, 1 плагин × 5 хуков | 858.4 ns | +197 ns |
| D navigate, 10 плагинов × 5 хуков | 1018.8 ns | **+358 ns (~36 ns/плагин)** |
| E use(5-hooks)+unsubscribe цикл | 2556.7 ns | cold-path, ок |

**Порог промпта не превышен**: 10-plugin worst-case добавляет 0.36 µs < 1 µs →
репрайоритизация не требуется. RME 0.00% везде.

## Probe-инцидент → находка (#1188-класс, коммент оставлен)

Первый прогон варианта D упал: плагины делили один module-level `noop` →
`usePlugin` бросил СЫРОЙ некодированный `Error: Duplicate listener for "$start"`
(event-emitter строг к дубликатам listener-fn; внутреннее имя события утекает
наружу — тот же класс, что #1188 `"$$success"`). Гигиена проб: генерируй СВЕЖИЕ
hook-замыкания на каждый плагин.
