# FSM-миграция @real-router/core — итоговое summary

## Что это

Полный перевод ядра роутера с ручного управления состоянием через булевые флаги (`#started`, `#active`, `#navigating`) и прямые вызовы событий на **детерминированное управление через единый конечный автомат** (FSM). Все жизненные события роутера — следствие FSM-переходов, а не ручных вызовов.

**40 коммитов, 100 файлов, +4676/-1590 строк, 4150 тестов, 100% coverage.**

---

## RouterFSM

```
IDLE → STARTING → READY ⇄ TRANSITIONING (+ NAVIGATE self-loop) → IDLE | DISPOSED
```

### Состояния

| Состояние | Описание |
|-----------|----------|
| `IDLE` | Роутер не запущен или остановлен |
| `STARTING` | Инициализация (синхронное окно до первого await) |
| `READY` | Готов к навигации |
| `TRANSITIONING` | Навигация в процессе |
| `DISPOSED` | Терминальное состояние, нет переходов |

### События

| Событие | Описание |
|---------|----------|
| `START` | Начало инициализации (IDLE→STARTING) |
| `STARTED` | Инициализация завершена (STARTING→READY) |
| `NAVIGATE` | Начало навигации (READY→TRANSITIONING, self-loop из TRANSITIONING) |
| `COMPLETE` | Навигация успешна (TRANSITIONING→READY) |
| `FAIL` | Ошибка навигации/инициализации (TRANSITIONING→READY, READY→READY self-loop, STARTING→IDLE) |
| `CANCEL` | Отмена навигации (TRANSITIONING→READY) |
| `STOP` | Остановка (READY→IDLE) |
| `DISPOSE` | Уничтожение (IDLE→DISPOSED) |

Const objects `routerStates` и `routerEvents` с derived types `RouterState`, `RouterEvent`.

### Typed Payloads (`RouterPayloads`)

```typescript
NAVIGATE: { toState: State; fromState: State | undefined }
COMPLETE: { state: State; fromState: State | undefined; opts: NavigationOptions }
FAIL:     { toState?: State; fromState?: State | undefined; error?: unknown }
CANCEL:   { toState: State; fromState: State | undefined }
```

### FSM Actions (8 штук)

FSM-действия зарегистрированы через `fsm.on(from, event, action)` в `EventBusNamespace.#setupFSMActions()`:

| from | event | action |
|------|-------|--------|
| STARTING | STARTED | `emitRouterStart()` |
| STARTING | FAIL | `emitTransitionError(...)` |
| READY | STOP | `emitRouterStop()` |
| READY | NAVIGATE | `emitTransitionStart(...)` |
| READY | FAIL | `emitTransitionError(...)` — self-loop, ранние валидационные ошибки |
| TRANSITIONING | COMPLETE | `emitTransitionSuccess(...)` |
| TRANSITIONING | CANCEL | `emitTransitionCancel(...)` |
| TRANSITIONING | FAIL | `emitTransitionError(...)` |

---

## Публичный API — изменения vs master

### Добавлено

- **`router.dispose(): void`** — терминальное уничтожение роутера
  - Идемпотентно (повторный вызов — no-op)
  - Отменяет in-flight transition, останавливает если active
  - Cleanup: plugins → middleware → observable → routes+lifecycle → state → deps
  - `#markDisposed()` перезаписывает 23 мутирующих метода на `throw RouterError(ROUTER_DISPOSED)`
  - Read-only методы (`getState`, `isActive`, `getOptions`, `buildPath`) остаются рабочими

- **`state.transition?: TransitionMeta`** — метаданные перехода после навигации
  ```typescript
  interface TransitionMeta {
    phase: TransitionPhase;     // "deactivating" | "activating" | "middleware"
    from?: string;              // предыдущий route (undefined при start())
    reason: TransitionReason;   // "success" | "blocked" | "cancelled" | "error"
    segments: {
      deactivated: string[];    // frozen
      activated: string[];      // frozen
      intersection: string;
    };
  }
  ```
  Deep-frozen (включая вложенные массивы).

- **`errorCodes.ROUTER_DISPOSED`** — error code `"DISPOSED"`

- **`LimitsConfig.warnListeners`** — настраиваемый порог предупреждения о memory leak (default: 1000, 0 — отключить). Ранее захардкожен.

### Удалено

- **`router.cancel()`** — функционал встроен в `stop()`, `dispose()` и внутреннюю логику concurrent navigation
- **`emitSuccess` параметр** из `navigateToState()` (core + browser-plugin)

---

## @real-router/fsm — изменения

### `FSM.canSend(event): boolean`

O(1) проверка валидности события в текущем состоянии. Использует кэшированный `#currentTransitions`.

```typescript
if (fsm.canSend("NAVIGATE")) { ... }
```

### `FSM.on(from, event, action): Unsubscribe`

Типизированный action для конкретной пары `(from, event)`:

```typescript
fsm.on("idle", "FETCH", (payload) => {
  console.log(payload.url); // type-safe через TPayloadMap
});
```

- **Lazy `#actions` Map** — `null` до первого `on()`, zero-cost для не использующих
- **Key format**: `${from}\0${event}` — null separator предотвращает коллизии
- **Execution order**: actions fire **before** `onTransition` listeners
- **Overwrite semantics**: второй `on()` для той же пары перезаписывает первый
- **Returns unsubscribe function**

### Hot-path оптимизации в FSM

- `#currentTransitions` cache — O(1) event lookup без двойного `transitions[state][event]`
- `#listenerCount` fast-path — пропускает итерацию + аллокацию `TransitionInfo` когда count=0
- Null-slot listener array — `onTransition` переиспользует слоты от отписанных listeners

---

## Router.ts facade — внутренние изменения

### Новые поля

- `#eventBus: EventBusNamespace` — единый event source, инкапсулирует FSM + EventEmitter + `#currentToState`

### Удалённые поля (из namespace'ов)

- `#started: boolean` → `routerFSM.getState()` проверки
- `#active: boolean` → `s !== IDLE && s !== DISPOSED`
- `#navigating: boolean` → `routerFSM.getState() === TRANSITIONING`

### Изменённые методы

| Метод | Что изменилось |
|-------|---------------|
| `isActive()` | `#eventBus.isActive()` |
| `start(path)` | `async`, `#eventBus.canStart()` → `sendStart()` → lifecycle → `try/catch` с `isReady()` recovery |
| `stop()` | `#eventBus.cancelTransitionIfRunning()` + `isReady()/isTransitioning()` + `sendStop()` |
| `navigate()` | `async/throw` вместо `Promise.reject()`, `#suppressUnhandledRejection` |
| `navigateToDefault()` | Аналогично navigate |
| `navigateToState()` | Удалён `emitSuccess` параметр |
| `addActivateGuard()` | Упрощён до input validation + `#routeLifecycle.addCanActivate(name, handler, noValidate)` |
| `addDeactivateGuard()` | Упрощён до input validation + `#routeLifecycle.addCanDeactivate(name, handler, noValidate)` |
| `removeRoute/clearRoutes/updateRoute` | `#eventBus.isTransitioning()` |

### Приватные методы Router.ts

| Метод | Назначение |
|-------|-----------|
| `#setupCloneCallbacks()` | Clone lambda, замыкание на приватные поля других Router instances |
| `#markDisposed()` | Перезапись 23 методов на throw ROUTER_DISPOSED |
| `static #suppressUnhandledRejection()` | Fire-and-forget safety |
| `static #onSuppressedError` | Кэшированный callback (одна аллокация на класс) |

**Перенесены в EventBusNamespace**: `#setupFSMActions()`, `#cancelTransitionIfRunning()`.

### Декомпозиция `#setupDependencies()` → Builder+Director

Двухэтапная эволюция:

1. **Этап 1** (6e54b23): Монолитный метод (275 строк) → 11 приватных методов в Router.ts
2. **Этап 2** (47c7a5b, 254c8d9): 9 из 11 методов извлечены в `src/wiring/` — паттерн Builder+Director

**`RouterWiringBuilder`** (275 строк, 9 public-методов):
`wireLimits` → `wireRouteLifecycleDeps` → `wireRoutesDeps` → `wireMiddlewareDeps` → `wirePluginsDeps` → `wireNavigationDeps` (97 строк, самый большой) → `wireLifecycleDeps` → `wireStateDeps` → `wireCyclicDeps`

**`wireRouter(builder)`** — director-функция, вызывает методы в правильном порядке (28 строк).

**`WiringOptions<Dependencies>`** — options bag: все namespace'ы, `eventBus: EventBusNamespace`, router.

**Остаётся в Router.ts**:
- `#setupCloneCallbacks()` — clone lambda, замыкание на приватные поля других Router instances

**Ordering constraints**:
- `wireRouteLifecycleDeps()` до `wireRoutesDeps()` — Routes setup регистрирует pending `canActivate` handlers
- `wireCyclicDeps()` последний — резолвит циклические зависимости Navigation ⇄ Lifecycle

Router.ts: 1585 → 1366 → 1249 → 1209 строк (-376 итого).

### DI-зависимости — изменения

**NavigationDependencies** — добавлены:
- `startTransition(toState, fromState)` → `eventBus.beginTransition()`
- `cancelNavigation()` → `eventBus.cancelTransition()`
- `sendTransitionDone(state, fromState, opts)` → `eventBus.completeTransition()`
- `sendTransitionBlocked(toState, fromState, error)` → `eventBus.failTransition()`
- `sendTransitionError(toState, fromState, error)` → `eventBus.failTransition()`
- `emitTransitionError(toState, fromState, error)` → `eventBus.emitOrFailTransitionError()` (READY → FSM FAIL, TRANSITIONING → direct emit)

**NavigationDependencies** — удалены:
- `invokeEventListeners` лямбда

**RouterLifecycleDependencies** — добавлены:
- `completeStart()` → `eventBus.completeStart()`
- `emitTransitionError()` → `eventBus.failTransition()` из STARTING (→IDLE), action эмитит $$error

**RouterLifecycleDependencies** — удалены:
- `hasListeners` зависимость
- `invokeEventListeners` лямбда

**TransitionDependencies** — добавлены:
- `isTransitioning()` → `eventBus.isTransitioning()`

**PluginsDependencies** — изменены:
- `isStarted` → `canNavigate` (через `eventBus.canBeginTransition()`)

**Cyclic refs** — изменены:
- `isRouterStarted` → `canNavigate` (через `eventBus.canBeginTransition()`)

---

## Namespace — внутренние изменения

### ObservableNamespace → event-emitter → EventBusNamespace

Три этапа эволюции event-системы:

| Этап | Что | Коммиты |
|------|-----|---------|
| 1. Extraction | Generic event-emitter логика → приватный пакет `event-emitter` | 19a33f4 |
| 2. Inline | ObservableNamespace удалён, Router.ts владеет `#emitter` напрямую | 79e623e |
| 3. EventBusNamespace | FSM + EventEmitter + `#currentToState` инкапсулированы в единый namespace | 4c47c9f–67111b4 |

| Было (master) | Промежуточное (inline) | Финал (EventBusNamespace) |
|----------------|----------------------|--------------------------|
| `invoke(eventName, ...args)` с switch-routing | FSM actions → `#emitter.emit()` напрямую | FSM actions → `emit*()` methods внутри namespace |
| `#callbacks`, `#emit()`, `#checkRecursionDepth` | EventEmitter (отдельный пакет) | EventEmitter (отдельный пакет) |
| `removeEventListener` | Удалён (dead code) | — |
| Static validators в классе | `src/eventValidation.ts` (standalone) | Static methods на `EventBusNamespace` |
| `RouterEventMap` type | В `src/types.ts` | В `src/types.ts` |
| Router знает о FSM и emitter | Router знает о FSM и emitter | Router знает только о `#eventBus` |

**Пакет `event-emitter`**: generic `EventEmitter<TEventMap>` с snapshot iteration, `RecursionDepthError` sentinel (testable, без v8 ignore), listener limits, duplicate detection. 50 тестов, 100% coverage.

### EventBusNamespace (278 строк)

Инкапсулирует FSM + EventEmitter + `#currentToState` как единый event source. Router.ts и RouterWiringBuilder не имеют прямого доступа к FSM/emitter.

**Структура:**

| Категория | Методы | Описание |
|-----------|--------|----------|
| Emit wrappers (6) | `emitRouterStart/Stop`, `emitTransition{Start,Success,Error,Cancel}` | Делегация к `#emitter.emit()` |
| FSM sends (4) | `sendStart`, `sendStop`, `sendDispose`, `completeStart` | Делегация к `#fsm.send()` |
| Transition methods (4) | `beginTransition`, `completeTransition`, `failTransition`, `cancelTransition` | FSM send + `#currentToState` management |
| Composite (2) | `emitOrFailTransitionError`, `cancelTransitionIfRunning` | Условная логика (FSM state branching) |
| State queries (7) | `isActive`, `isReady`, `isTransitioning`, `isDisposed`, `canBeginTransition`, `canStart`, `canCancel` | FSM state checks |
| Subscriptions (4) | `addEventListener`, `subscribe`, `clearAll`, `setLimits` | Emitter delegation |
| Validators (3) | `validateEventName`, `validateListenerArgs`, `validateSubscribeListener` | Static, из удалённого `eventValidation.ts` |
| Internal (1) | `#setupFSMActions()` | 8 FSM→emit bridge registrations |

**`#currentToState`** — private field, управляется только через `beginTransition` (set) и `completeTransition`/`failTransition`/`cancelTransition` (reset). `getCurrentToState()` — API surface для wiring (v8 ignore, не вызывается Router.ts).

#### EventEmitter emit() оптимизации

Три оптимизации горячего пути `emit()`, валидированные через mitata-бенчмарки:

| # | Оптимизация | Суть |
|---|-------------|------|
| 1 | `apply.call` → switch по args.length | Прямые вызовы `cb()`, `cb(a)`, `cb(a,b)`, `cb(a,b,c)` вместо `Function.prototype.apply.call`. Fallback на apply только для 4+ аргументов |
| 2 | Быстрый путь при `maxEventDepth === 0` | `#emitFast()` — без depth tracking, без try/finally, без depthMap. Дефолтный путь для standalone EventEmitter |
| 3 | Inline `#checkRecursionDepth` + `#getDepthMap` | Объединены в `#emitWithDepthTracking()`, убрано 2 вызова методов на depth-tracking пути |

**Результаты vs baseline:**

| Бенчмарк | Baseline | После | Δ |
|----------|----------|-------|---|
| emit() 3 args, 1 listener (hot) | 30.3 ns | 19.3 ns | **-36%** |
| emit() 3 args, 10 listeners | 89.5 ns | 79.2 ns | **-12%** |
| emit() depth ON (maxEventDepth=5) | 34.2 ns | 31.0 ns | **-9%** |
| Full navigation (3p + 10 subs) | 175.3 ns | 161.1 ns | **-8%** |
| 1000 emits, 1 listener | 30.5 μs | 19.1 μs | **-38%** |

### RouteLifecycleNamespace

Перенос state-dependent бизнес-логики из facade в namespace.

| Было (facade) | Стало (namespace) |
|----------------|-------------------|
| Facade запрашивал `isRegistering()`, `hasCanActivate()`, `countCanActivate()` | Namespace инкапсулирует проверки внутри `addCanActivate()`/`addCanDeactivate()` |
| `registerCanActivate(name, handler, isOverwrite)` — input trusted | `addCanActivate(name, handler, skipValidation)` — self-validating |
| 7 public accessors + 2 static proxy methods | Удалены (мёртвый код) |

**Новые instance methods:**
- `addCanActivate(name, handler, skipValidation)` — not-registering check, overwrite detection, handler limit validation, registration
- `addCanDeactivate(name, handler, skipValidation)` — аналогично

**Удалены instance methods (7):** `registerCanActivate`, `registerCanDeactivate`, `isRegistering`, `hasCanActivate`, `hasCanDeactivate`, `countCanActivate`, `countCanDeactivate`

**Удалены static methods (2):** `validateNotRegistering`, `validateHandlerLimit` (были proxy к validators.ts, теперь вызываются напрямую из instance methods)

**Сохранены:** `static validateHandler` (input validation из facade), `clearCanActivate`/`clearCanDeactivate`, `#registerHandler`, все остальные public methods.

### NavigationNamespace

| Было (master) | Стало |
|----------------|-------|
| `#navigating: boolean` | Удалён — через FSM |
| `cancel()` | Удалён — в facade через FSM |
| `isNavigating()` | Удалён — в facade через FSM |
| `navigateToState()` — монолитный | Декомпозирован: `#buildSuccessState()`, `#routeTransitionError()` |
| `Promise.reject()` | `async/throw` |
| `performance.now()` + `duration` в state | Удалён — доступно через logger-plugin |

`isCancelled()` в transition pipeline: `() => !deps.isActive()` — ловит stop() и dispose().

### RouterLifecycleNamespace

| Было (master) | Стало |
|----------------|-------|
| `#started: boolean`, `#active: boolean` | Удалены — через FSM в facade |
| `isStarted()`, `isActive()` | Удалены — в facade через FSM |
| `start()` с flag management | Упрощён: нет flag management, FSM events через DI |
| `stop()` с flag management | Упрощён до `setState(undefined)`, FSM STOP из facade |

### Transition pipeline

- `new Set(activeSegments)` для segment cleanup → `Array.includes()` (1-5 элементов — линейный поиск быстрее)
- Bare `import { logger } from "logger"` в `executeMiddleware.ts` / `executeLifecycleHooks.ts` → `from "@real-router/logger"` (исправление двойного инлайна в бандле)

---

## Архитектура event flow

### До (master)

```
navigate() → NavigationNS
  → deps.invokeEventListeners(TRANSITION_START/SUCCESS/ERROR/CANCEL)
    → observable.invoke() → switch → plugin callbacks

start() → RouterLifecycleNS
  → deps.invokeEventListeners(ROUTER_START/TRANSITION_SUCCESS)
    → observable.invoke() → plugin callbacks
```

Проблемы: ручное управление флагами, прямые вызовы событий, двойное маршрутизирование (onTransition switch + invoke switch), нетипизированный `arg: RouterError | NavigationOptions`.

### После (fsm-migration)

```
navigate() → NavigationNS.navigateToState()
  → deps.startTransition(toState, fromState)
    → eventBus.beginTransition() → fsm.send(NAVIGATE)
      → fsm.on(READY, NAVIGATE) → emitTransitionStart()
  → [transition pipeline: guards → middleware]
  → deps.sendTransitionDone(state, fromState, opts)
    → eventBus.completeTransition() → fsm.send(COMPLETE)
      → fsm.on(TRANSITIONING, COMPLETE) → emitTransitionSuccess()

start() → Router.start()
  → eventBus.sendStart() → fsm.send(START)
  → RouterLifecycleNS.start()
    → deps.completeStart() → eventBus.completeStart() → fsm.send(STARTED)
      → fsm.on(STARTING, STARTED) → emitRouterStart()
    → navigateToState() → [полный FSM-цикл выше]

stop() → Router.stop()
  → eventBus.cancelTransitionIfRunning()
    → eventBus.cancelTransition() → fsm.send(CANCEL)
      → fsm.on(TRANSITIONING, CANCEL) → emitTransitionCancel()
  → lifecycle.stop() → setState(undefined)
  → eventBus.sendStop() → fsm.send(STOP)
    → fsm.on(READY, STOP) → emitRouterStop()

dispose() → Router.dispose()
  → eventBus.cancelTransitionIfRunning()
  → [stop if isReady/isTransitioning]
  → eventBus.sendDispose() → fsm.send(DISPOSE) → IDLE→DISPOSED
  → eventBus.clearAll()
  → [cleanup: plugins → middleware → routes → state → deps]
  → #markDisposed()
```

---

## Edge cases

### Ранний TRANSITION_ERROR (route not found, same state)

Ранние ошибки теперь в основном маршрутизируются через FSM:

- **READY** (navigate с невалидным route/same state): `eventBus.emitOrFailTransitionError()` → `fsm.send(FAIL)` → READY→READY self-loop → action эмитит $$error. Навигация не начинается (нет `TRANSITION_START`).
- **STARTING** (start с невалидным путём): `eventBus.failTransition()` → `fsm.send(FAIL)` → STARTING→IDLE → action эмитит $$error (с guard `error !== undefined`).
- **TRANSITIONING** (edge case: concurrent navigation с плохими аргументами): `eventBus.emitOrFailTransitionError()` → direct emit через `emitTransitionError()`, чтобы не нарушать текущий transition. Единственный оставшийся bypass FSM.

### isCancelled() в transition pipeline

```typescript
const isCancelled = () => !deps.isActive();
```

Ловит `stop()` и `dispose()`. Для concurrent navigation (отмена предыдущего новым `navigate()`) используется другой механизм: `navigateToState()` вызывает `cancelNavigation()` перед `startTransition()`.

### STARTING — синхронное окно

STARTING живёт синхронно между `send("START")` и `completeStart()`. К моменту первого `await` FSM уже в READY. Переход STOP из STARTING удалён — `stop()`/`dispose()` не могут быть вызваны в синхронном окне.

### dispose() всегда через IDLE

Даже из READY/TRANSITIONING, dispose() сначала stop-like cleanup → IDLE, потом DISPOSE. Гарантирует эмиссию ROUTER_STOP.

### Re-entrancy: ROUTER_STOP listener → dispose()

FSM уже в IDLE после stop(). Listener вызывает `dispose()` → `send("DISPOSE")` переводит в DISPOSED. Cleanup-шаги безопасны (clearAll/reset на пустых коллекциях = no-op).

### NAVIGATE self-loop в TRANSITIONING

`NAVIGATE: "TRANSITIONING"` — чтобы `canSend("NAVIGATE")` возвращал `true` из TRANSITIONING. navigate() работает из TRANSITIONING через cancel-first. Никакие FSM actions не зарегистрированы для `(TRANSITIONING, NAVIGATE)`.

---

## Решённые альтернативы

### Эволюция event-системы: ObservableNamespace → inline → EventBusNamespace

**Этап 1**: ObservableNamespace удалён, EventEmitter извлечён в отдельный пакет. Router.ts владел FSM + emitter напрямую. Один уровень индирекции убран.

**Этап 2**: FSM + EventEmitter + `#currentToState` инкапсулированы в EventBusNamespace — единый event source. Router.ts не знает о FSM/emitter. Wiring работает через семантические методы (`beginTransition`, `failTransition`, `canBeginTransition`) вместо raw `fsm.send()`/`emitter.emit()`.

Мотивация EventBusNamespace:
1. Router.ts теряет все imports из `./fsm` и `event-emitter` (-7 imports)
2. `#setupFSMActions` (55 строк) и `#cancelTransitionIfRunning` (11 строк) переезжают из Router — это wiring-логика, не facade-логика
3. `WiringOptions` упрощается: 4 поля (`routerFSM`, `emitter`, `getCurrentToState`, `setCurrentToState`) → 1 (`eventBus`)
4. `#currentToState` управляется полностью внутри namespace (set в `beginTransition`, reset в `complete/fail/cancelTransition`)

---

## v8 ignore — текущее состояние (3 FSM-related блока)

| Категория | Кол-во | Место |
|-----------|--------|-------|
| Error wrapping инвариант | 1 | `#routeTransitionError()` |
| API surface methods | 2 | `EventBusNamespace.getState()`, `EventBusNamespace.getCurrentToState()` |

Defensive guard `currentToState` (2 блока) — убраны, заменены на non-null assertion.
Recursion depth guard в ObservableNamespace — убран вместе с namespace (EventEmitter покрывает 100% без v8 ignore).

Вне скоупа: 32 блока в namespace'ах (deps guards, RoutesNamespace, validators).

---

## Файлы — diff vs master

### Добавлены (9 core + event-emitter пакет)

- `packages/core/src/fsm/routerFSM.ts` — config, types, factory, `routerStates`/`routerEvents`
- `packages/core/src/fsm/index.ts` — barrel exports
- `packages/core/src/wiring/RouterWiringBuilder.ts` — Builder: 9 wire-методов (221 строк)
- `packages/core/src/wiring/wireRouter.ts` — Director: вызов методов в правильном порядке
- `packages/core/src/wiring/types.ts` — `WiringOptions<Dependencies>` interface
- `packages/core/src/wiring/index.ts` — barrel exports
- `packages/core/src/namespaces/EventBusNamespace/EventBusNamespace.ts` — FSM+emitter+currentToState encapsulation (278 строк)
- `packages/core/src/namespaces/EventBusNamespace/types.ts` — `EventBusOptions` interface
- `packages/core/src/namespaces/EventBusNamespace/index.ts` — barrel exports
- `packages/event-emitter/` — приватный пакет: generic `EventEmitter<TEventMap>` (50 тестов, 100% coverage)

### Удалены (3 src + 9 tests)

- `packages/core/src/namespaces/ObservableNamespace/helpers.ts` — содержал `invokeFor()`
- `packages/core/src/fsm/transitionFSM.ts` — промежуточный FSM, слит в RouterFSM
- `packages/core/src/eventValidation.ts` — validators перенесены в EventBusNamespace static methods

Тесты (implementation details):
- `tests/functional/fsm/` — 3 файла
- `tests/functional/namespaces/` — 4 файла
- `tests/unit/namespaces/` — 2 файла

### Изменены (production)

- `Router.ts` — FSM интеграция, dispose(), wiring extraction, EventBusNamespace, guard delegation (1585→1209 строк), async/throw
- `RouteLifecycleNamespace.ts` — `addCanActivate`/`addCanDeactivate` encapsulate state-dependent validation, 9 dead methods removed
- `NavigationNamespace.ts` — decomposed, FSM DI, async/throw, no duration
- `NavigationNamespace/transition/index.ts` — Set→includes
- `NavigationNamespace/transition/executeMiddleware.ts` — logger import fix
- `NavigationNamespace/transition/executeLifecycleHooks.ts` — logger import fix
- `NavigationNamespace/types.ts` — DI types
- `NavigationNamespace/validators.ts` — removed emitSuccess param
- `RouterLifecycleNamespace.ts` — simplified, flags removed
- `RouterLifecycleNamespace/types.ts` — DI types
- `RouterLifecycleNamespace/constants.ts` — cached error
- `ObservableNamespace.ts` → удалён (заменён EventBusNamespace)
- `PluginsNamespace.ts` — disposeAll(), removed empty catch
- `MiddlewareNamespace.ts` — clearAll()
- `StateNamespace.ts` — reset(), simplified set()
- `constants.ts` — ROUTER_DISPOSED, warnListeners, LIMIT_BOUNDS
- `.size-limit.json` — 22.1→25 kB

### Кросс-пакетные

- `@real-router/core-types` — TransitionMeta types, ROUTER_DISPOSED
- `@real-router/browser-plugin` — navigateToState signature change
- `@real-router/fsm` — canSend(), on()

---

## Цифры

| Метрика | Значение |
|---------|----------|
| Коммитов | 40 |
| Файлов изменено | 100 |
| Строк | +4676 / -1590 (net +3086) |
| Тестов | 4150 (core: 2287, fsm: 40, event-emitter: 50) |
| Coverage | 100% |
| Router.ts | 1585 → 1209 строк (-376) |
| Bundle size | 86.2 KB raw / 22.4 KB gzip |
