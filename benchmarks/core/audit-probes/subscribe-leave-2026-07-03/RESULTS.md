# subscribeLeave deep-audit wave 2 — probe results (2026-07-03)

Прогон: src (`NODE_OPTIONS='--conditions=@real-router/internal-source' npx tsx …`)
и контрольный dist (плавный `npx tsx`) — **выводы идентичны** (dist в синхроне с src).
Питание: батарея → latency-probe (10b) не выполнялся, `[SKIPPED: battery]`;
все structural/liveness пробы валидны.

| Probe | Вопрос | Вердикт |
|---|---|---|
| 01 signal-reason-matrix | #943 (бывш. F1 волны 1): reason на каждом пути | (a) sync throw → reason=thrown ✓; (b) activation false → reason.code=CANNOT_ACTIVATE + state=home (#932) ✓; (c) supersede → CANCELLED ✓; (d) external custom reason → **сигнал получает reason ✓, но navigate реджектится сырым reason — см. probe-07**; (e) success → aborted=false (#722) ✓; (f) stop → CANCELLED ✓. **F1 волны 1 ЗАКРЫТА (#978)** |
| 02 async-rejection-propagation | Промпт §5.2 утверждал «allSettled не пропагирует» | **Промпт врал**: async rejection ПРОПАГИРУЕТСЯ — navigate rejects оригинальной ошибкой; порядок победителя = порядок РЕГИСТРАЦИИ (не времени); sync throw приоритетнее; все листенеры выполняются; non-Error оборачивается ensureError. Всё = документированный контракт (wiki/leave.md Error Handling) ✓ |
| 03 reentrancy-lifecycle | Модель RFC §4 после #1030-#1035 | (a) sync reentrant navigate → REENTRANT_NAVIGATION, outer коммитится ✓; (b) deferred navigate разрешён, supersedes ✓; (c) подписка mid-emit → snapshot держит ✓; (d) self-unsubscribe → ровно 1 вызов ✓; **(e) stop() из sync-листенера → навигация РЕЗОЛВИТСЯ, FSM воскрес (isActive=true) — репродукция #1169**; **(f) dispose() из листенера → reject ROUTE_NOT_FOUND (не CANCELLED) — ветка того же #1169** |
| 04 never-settle-wake | Промпт «Известный риск 2» (DoS без timeout) | Каждый cancel-источник БУДИТ припаркованный pipeline: supersede ✓ stop ✓ dispose ✓; **external signal будит, но реджект сырой — probe-07**; без отмены — паркуется навсегда (by-design, таймаут на стороне листенера — wiki-паттерн `AbortSignal.timeout`) |
| 05 payload-nextroute-mutation | Wiki «nextRoute NOT yet frozen» — blast radius | Wrapper frozen ✓; fromState deep-frozen ✓; **nextRoute.params ЗАМОРОЖЕНЫ** (мутация throws — wiki-строчку стоит уточнить); nextRoute.name писуем, мутация НЕ коммитит hijacked-state — навигация громко падает ROUTE_NOT_FOUND (silent corruption НЕТ); nextRoute === committed state (идентичность) |
| 06 fire-conditions | Wiki-таблица «When It Fires» + окно isLeaveApproved | Все 9 строк подтверждены: no-fire на deactivate-false/SAME_STATES/navigateToNotFound/start()/ROUTE_NOT_FOUND; fire на zero-guard; isLeaveApproved true только в окне; TypeError-guard на не-функцию; pre-bound после dispose → ROUTER_DISPOSED (#946) ✓ |
| 07 external-abort-leave-vs-guard | **НОВЫЙ BUG (HIGH) → issue #1197** | External `opts.signal` abort при парковке на async LEAVE (no-guards path): navigate реджектится СЫРЫМ reason (не RouterError(TRANSITION_CANCELLED)); события `START,CANCEL,ERROR` — ложный TRANSITION_ERROR после CANCEL; fire-and-forget логирует «Unexpected navigation error» на юзер-отмену. Дефолтный `abort()` → то же с DOMException(AbortError). GUARD-путь и guard-pipeline+leave — чистые (`CANCELLED`, `START,CANCEL`). Корень: `settleLeavePromises.onAbort` реджектит `ensureError(signal.reason)` раньше, чем `abortRace` резолвится (его abort-листенер зарегистрирован первым) → минуя post-race `isActive()`-конверсию |

Артефакты прогонов (полный stdout) процитированы в
`packages/core/.claude/audit/subscribe-leave-deep-2026-07-03.md`.

Гочи проб этой волны:
- async-листенер, захватывающий `signal`, обязан фиксировать ТОЛЬКО первый
  (`captured ??= signal`) — superseding-навигация тоже проходит leave-фазу и
  перезаписывает захват своим (успешным, неабортнутым) сигналом → ложный FAIL
  (артефакт probe-01(c) run 1).
- `addEventListener` — НЕ фасадный метод: `getPluginApi(router).addEventListener`
  (та же ловушка, что `matchPath` в routes-аудите).
- Проба, мутирующая `nextRoute.name`, обязана ловить reject навигации — мутация
  роняет `completeTransition` с ROUTE_NOT_FOUND, unhandled reject валит процесс
  (артефакт probe-05 run 1).
