# FSM-миграция @real-router/core — итоговое summary

## Что это

Полный перевод ядра роутера с ручного управления состоянием через булевые флаги (`#started`, `#active`, `#navigating`) и прямые вызовы событий на **детерминированное управление через единый конечный автомат** (FSM). Все жизненные события роутера — следствие FSM-переходов, а не ручных вызовов.

**34 коммита, 97 файлов, +4468/-1456 строк, 4101 тест, 100% coverage.**

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

FSM-действия зарегистрированы через `fsm.on(from, event, action)` в `#setupFSMActions()`:

| from | event | action |
|------|-------|--------|
| STARTING | STARTED | `#emitter.emit(ROUTER_START)` |
| STARTING | FAIL | `#emitter.emit(TRANSITION_ERROR, ...)` |
| READY | STOP | `#emitter.emit(ROUTER_STOP)` |
| READY | NAVIGATE | `#emitter.emit(TRANSITION_START, ...)` |
| READY | FAIL | `#emitter.emit(TRANSITION_ERROR, ...)` — self-loop, ранние валидационные ошибки |
| TRANSITIONING | COMPLETE | `#emitter.emit(TRANSITION_SUCCESS, ...)` |
| TRANSITIONING | CANCEL | `#emitter.emit(TRANSITION_CANCEL, ...)` |
| TRANSITIONING | FAIL | `#emitter.emit(TRANSITION_ERROR, ...)` |

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

- `#routerFSM: FSM<RouterState, RouterEvent, null, RouterPayloads>` — единый FSM
- `#currentToState: State | undefined` — текущий target state для cancel payload

### Удалённые поля (из namespace'ов)

- `#started: boolean` → `routerFSM.getState()` проверки
- `#active: boolean` → `s !== IDLE && s !== DISPOSED`
- `#navigating: boolean` → `routerFSM.getState() === TRANSITIONING`

### Изменённые методы

| Метод | Что изменилось |
|-------|---------------|
| `isActive()` | Inline FSM check вместо делегирования в namespace |
| `start(path)` | `async` с FSM lifecycle: `send(START)` → lifecycle → `try/catch` с recovery |
| `stop()` | `#cancelTransitionIfRunning()` + three-way FSM dispatch + `send(STOP)` |
| `navigate()` | `async/throw` вместо `Promise.reject()`, `#suppressUnhandledRejection` |
| `navigateToDefault()` | Аналогично navigate |
| `navigateToState()` | Удалён `emitSuccess` параметр |
| `removeRoute/clearRoutes/updateRoute` | `isNavigating` через `routerFSM.getState() === TRANSITIONING` |

### Новые приватные методы

| Метод | Назначение |
|-------|-----------|
| `#cancelTransitionIfRunning()` | Отмена in-flight transition (из stop/dispose) |
| `#markDisposed()` | Перезапись 23 методов на throw ROUTER_DISPOSED |
| `static #suppressUnhandledRejection()` | Fire-and-forget safety |
| `static #onSuppressedError` | Кэшированный callback (одна аллокация на класс) |

### Декомпозиция `#setupDependencies()` → Builder+Director

Двухэтапная эволюция:

1. **Этап 1** (6e54b23): Монолитный метод (275 строк) → 11 приватных методов в Router.ts
2. **Этап 2** (47c7a5b, 254c8d9): 9 из 11 методов извлечены в `src/wiring/` — паттерн Builder+Director

**`RouterWiringBuilder`** (275 строк, 9 public-методов):
`wireLimits` → `wireRouteLifecycleDeps` → `wireRoutesDeps` → `wireMiddlewareDeps` → `wirePluginsDeps` → `wireNavigationDeps` (97 строк, самый большой) → `wireLifecycleDeps` → `wireStateDeps` → `wireCyclicDeps`

**`wireRouter(builder)`** — director-функция, вызывает методы в правильном порядке (28 строк).

**`WiringOptions<Dependencies>`** — options bag: все namespace'ы, FSM, emitter, router + `getCurrentToState`/`setCurrentToState` callbacks (мост к приватному полю `#currentToState`).

**Остались в Router.ts** (требуют доступ к приватным полям):
- `#setupFSMActions()` — 8 FSM actions, используют `#emitter` напрямую
- `#setupCloneCallbacks()` — clone lambda, замыкание на приватные поля

**Ordering constraints**:
- `wireRouteLifecycleDeps()` до `wireRoutesDeps()` — Routes setup регистрирует pending `canActivate` handlers
- `wireCyclicDeps()` последний — резолвит циклические зависимости Navigation ⇄ Lifecycle

Router.ts: 1585 → 1366 строк (-219).

### DI-зависимости — изменения

**NavigationDependencies** — добавлены:
- `startTransition(toState, fromState)` → `routerFSM.send(NAVIGATE)`
- `cancelNavigation()` → `routerFSM.send(CANCEL)`
- `sendTransitionDone(state, fromState, opts)` → `routerFSM.send(COMPLETE)`
- `sendTransitionBlocked(toState, fromState, error)` → `routerFSM.send(FAIL)`
- `sendTransitionError(toState, fromState, error)` → `routerFSM.send(FAIL)`
- `emitTransitionError(toState, fromState, error)` → FSM send(FAIL) из READY (self-loop), fallback на direct emit из TRANSITIONING (concurrent navigation edge case)

**NavigationDependencies** — удалены:
- `invokeEventListeners` лямбда

**RouterLifecycleDependencies** — добавлены:
- `completeStart()` → `routerFSM.send(STARTED)`
- `emitTransitionError()` → `routerFSM.send(FAIL)` из STARTING (→IDLE), action эмитит $$error

**RouterLifecycleDependencies** — удалены:
- `hasListeners` зависимость
- `invokeEventListeners` лямбда

**TransitionDependencies** — добавлены:
- `isTransitioning()` → `routerFSM.getState() === TRANSITIONING`

**PluginsDependencies** — изменены:
- `isStarted` → `canNavigate` (через `routerFSM.canSend(NAVIGATE)`)

**Cyclic refs** — изменены:
- `isRouterStarted` → `canNavigate` (через `routerFSM.canSend(NAVIGATE)`)

---

## Namespace — внутренние изменения

### ObservableNamespace → event-emitter + inline

**ObservableNamespace удалён.** Generic event-emitter логика извлечена в приватный пакет `event-emitter`, Router.ts владеет `#emitter: EventEmitter<RouterEventMap>` напрямую.

| Было (master) | Промежуточное (composition) | Финал (inline) |
|----------------|---------------------------|----------------|
| `invoke(eventName, ...args)` с switch-routing | 6 emit-методов делегируют к `#emitter` | FSM actions вызывают `#emitter.emit()` напрямую |
| `#callbacks`, `#emit()`, `#checkRecursionDepth` | Вся логика в EventEmitter | EventEmitter (отдельный пакет) |
| `removeEventListener` | Удалён (dead code после composition) | — |
| Static validators в классе | В классе | `src/eventValidation.ts` (standalone функции) |
| `RouterEventMap` type | В ObservableNamespace.ts | В `src/types.ts` |
| `validEventNames` Set | В `constants.ts` namespace | В `src/constants.ts` |

**Пакет `event-emitter`**: generic `EventEmitter<TEventMap>` с snapshot iteration, `RecursionDepthError` sentinel (testable, без v8 ignore), listener limits, duplicate detection. 50 тестов, 100% coverage.

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
    → routerFSM.send("NAVIGATE")
      → fsm.on(READY, NAVIGATE) → #emitter.emit(TRANSITION_START)
  → [transition pipeline: guards → middleware]
  → deps.sendTransitionDone(state, fromState, opts)
    → routerFSM.send("COMPLETE")
      → fsm.on(TRANSITIONING, COMPLETE) → #emitter.emit(TRANSITION_SUCCESS)

start() → Router.start()
  → routerFSM.send("START")
  → RouterLifecycleNS.start()
    → deps.completeStart() → routerFSM.send("STARTED")
      → fsm.on(STARTING, STARTED) → #emitter.emit(ROUTER_START)
    → navigateToState() → [полный FSM-цикл выше]

stop() → Router.stop()
  → #cancelTransitionIfRunning()
    → routerFSM.send("CANCEL")
      → fsm.on(TRANSITIONING, CANCEL) → #emitter.emit(TRANSITION_CANCEL)
  → lifecycle.stop() → setState(undefined)
  → routerFSM.send("STOP")
    → fsm.on(READY, STOP) → #emitter.emit(ROUTER_STOP)

dispose() → Router.dispose()
  → #cancelTransitionIfRunning()
  → [stop if READY/TRANSITIONING/STARTING]
  → routerFSM.send("DISPOSE") → IDLE→DISPOSED
  → [cleanup: emitter → plugins → middleware → routes → state → deps]
  → #markDisposed()
```

---

## Edge cases

### Ранний TRANSITION_ERROR (route not found, same state)

Ранние ошибки теперь в основном маршрутизируются через FSM:

- **READY** (navigate с невалидным route/same state): DI `emitTransitionError` отправляет `send(FAIL)` → READY→READY self-loop → action эмитит $$error. Навигация не начинается (нет `TRANSITION_START`).
- **STARTING** (start с невалидным путём): DI `emitTransitionError` отправляет `send(FAIL)` → STARTING→IDLE → action эмитит $$error (с guard `error !== undefined`).
- **TRANSITIONING** (edge case: concurrent navigation с плохими аргументами): Direct emit, чтобы не нарушать текущий transition. Единственный оставшийся bypass FSM.

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

### Замена ObservableNamespace на EventEmitter (реализовано)

Изначально отвергалось по 3 причинам — все сняты после извлечения EventEmitter:
1. ~~Несовпадение сигнатур~~ — FSM actions распаковывают payload, вызывают `emitter.emit()` с правильной сигнатурой
2. ~~Отсутствие features в FSM~~ — EventEmitter предоставляет recursion depth, limits, duplicate detection 1:1
3. ~~Concurrent navigation edge case~~ — direct `emitter.emit()` работает так же

**Итог**: ObservableNamespace удалён. Router.ts владеет `#emitter: EventEmitter<RouterEventMap>`. FSM actions вызывают `emitter.emit()` напрямую. Один уровень индирекции убран.

---

## v8 ignore — текущее состояние (1 FSM-related блок)

| Категория | Кол-во | Место |
|-----------|--------|-------|
| Error wrapping инвариант | 1 | `#routeTransitionError()` |

Defensive guard `currentToState` (2 блока) — убраны, заменены на non-null assertion.
Recursion depth guard в ObservableNamespace — убран вместе с namespace (EventEmitter покрывает 100% без v8 ignore).

Вне скоупа: 32 блока в namespace'ах (deps guards, RoutesNamespace, validators).

---

## Файлы — diff vs master

### Добавлены (6 core + event-emitter пакет)

- `packages/core/src/fsm/routerFSM.ts` — config, types, factory, `routerStates`/`routerEvents`
- `packages/core/src/fsm/index.ts` — barrel exports
- `packages/core/src/wiring/RouterWiringBuilder.ts` — Builder: 9 wire-методов (275 строк)
- `packages/core/src/wiring/wireRouter.ts` — Director: вызов методов в правильном порядке
- `packages/core/src/wiring/types.ts` — `WiringOptions<Dependencies>` interface
- `packages/core/src/wiring/index.ts` — barrel exports
- `packages/event-emitter/` — приватный пакет: generic `EventEmitter<TEventMap>` (50 тестов, 100% coverage)

### Удалены (2 src + 9 tests)

- `packages/core/src/namespaces/ObservableNamespace/helpers.ts` — содержал `invokeFor()`
- `packages/core/src/fsm/transitionFSM.ts` — промежуточный FSM, слит в RouterFSM

Тесты (implementation details):
- `tests/functional/fsm/` — 3 файла
- `tests/functional/namespaces/` — 4 файла
- `tests/unit/namespaces/` — 2 файла

### Изменены (production)

- `Router.ts` — FSM интеграция, dispose(), wiring extraction (1585→1366 строк), async/throw
- `NavigationNamespace.ts` — decomposed, FSM DI, async/throw, no duration
- `NavigationNamespace/transition/index.ts` — Set→includes
- `NavigationNamespace/transition/executeMiddleware.ts` — logger import fix
- `NavigationNamespace/transition/executeLifecycleHooks.ts` — logger import fix
- `NavigationNamespace/types.ts` — DI types
- `NavigationNamespace/validators.ts` — removed emitSuccess param
- `RouterLifecycleNamespace.ts` — simplified, flags removed
- `RouterLifecycleNamespace/types.ts` — DI types
- `RouterLifecycleNamespace/constants.ts` — cached error
- `ObservableNamespace.ts` — typed emit methods, cleanup
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
| Коммитов | 34 |
| Файлов изменено | 97 |
| Строк | +4468 / -1456 (net +3012) |
| Тестов | 4101 (core: 2286, fsm: 40, event-emitter: 50) |
| Coverage | 100% |
| Bundle size | 83.6 KB raw / 22.81 KB gzip |
