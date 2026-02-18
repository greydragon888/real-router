# Релиз 2: Замена булевых флагов на RouterFSM — план реализации

## Цель

Заменить `#started` и `#active` в `RouterLifecycleNamespace` на проверку состояния `#routerFSM`.
После этого релиза жизненный цикл роутера (start/stop/isStarted/isActive) полностью определяется FSM.

## Предварительные условия

- Релиз 1 завершён: FSM управляет событиями ✅
- `#routerFSM` и `#transitionFSM` — приватные поля Router ✅

### Состояние после R1 (что учитывать)

> **См. R1 Addendum (A1-A7) для полного списка.**

- **`#handleEvent` существует** — временный мост, маппит plugin events → FSM send(). R2 работает с ним, не удаляет.
- **`invokeEventListeners` лямбды существуют** с fallback-паттерном (pre-mutation state capture + conditional `observable.invoke`). R2 модифицирует их, сохраняя паттерн.
- **TRANSITION_ERROR при start() сохранён** через fallback в RouterLifecycleDependencies lambda (R1 Addendum A4). R2 должен сохранить это поведение.
- **TransitionPayloads имеют `fromState`** — явный data flow вместо `getPreviousState()` (R1 Addendum A1).
- **RouterPayloads.FAIL** — optional properties (`toState?: State`, `error?: unknown`) для spread-паттерна (R1 Addendum A1).

---

## Суть: два флага = один FSM-стейт

`#started` и `#active` — ручная эмуляция состояния STARTING, не влезающего в один boolean:

| FSM State     | `#active` | `#started` |
| ------------- | --------- | ---------- |
| IDLE          | false     | false      |
| STARTING      | true      | false      |
| READY         | true      | true       |
| TRANSITIONING | true      | true       |
| DISPOSED      | false     | false      |

С RouterFSM оба флага заменяются на `getState()`:

```typescript
isStarted() → state === "READY" || state === "TRANSITIONING"
isActive()  → state !== "IDLE" && state !== "DISPOSED"
```

---

## Шаг 1: Добавить STOP в STARTING transitions

Текущая таблица не содержит STOP для STARTING — `stop()` во время async `start()` будет no-op. Баг.

```typescript
const transitions = {
  IDLE: { START: "STARTING", DISPOSE: "DISPOSED" },
  STARTING: { STARTED: "READY", FAIL: "IDLE", STOP: "IDLE" }, // +STOP
  READY: { NAVIGATE: "TRANSITIONING", STOP: "IDLE", DISPOSE: "DISPOSED" },
  TRANSITIONING: {
    COMPLETE: "READY",
    CANCEL: "READY",
    FAIL: "READY",
    STOP: "IDLE",
  },
  // DISPOSE нет в STARTING/TRANSITIONING — dispose() сначала stop() → IDLE, потом DISPOSE
  DISPOSED: {},
};
```

> **Обновить также:** `rfc-2-router-fsm.md`

### Обновить RouterFSM → ObservableNamespace onTransition

После добавления STOP в STARTING, переход STARTING → IDLE (STOP) стал возможен. Handler из Release 1 эмитит ROUTER_STOP для **любого** `event === "STOP" && to === "IDLE"` — без проверки `from`. Это вызовет ложный ROUTER_STOP при stop() из STARTING (ROUTER_START ещё не был эмитирован).

```diff
- if (event === "STOP" && to === "IDLE") {
+ if (event === "STOP" && to === "IDLE" && (from === "READY" || from === "TRANSITIONING")) {
    this.#observable.invoke(events.ROUTER_STOP);
  }
```

> **Почему только READY и TRANSITIONING:** ROUTER_START эмитится при STARTING → READY. До этого перехода роутер "не запущен" → ROUTER_STOP семантически некорректен. Из IDLE STOP — no-op (IDLE не принимает STOP). Из DISPOSED — нет переходов.

---

## Шаг 2: Переключить `isActive()` на FSM в Router facade

`isActive()` — единственный публичный метод. `isStarted()` — internal (используется только в DI-лямбдах для PluginsNS и NavigationNS).

```typescript
// Router.ts — публичный метод
isActive(): boolean {
  const s = this.#routerFSM.getState();
  return s !== "IDLE" && s !== "DISPOSED";
}
```

`isStarted()` не выносим в facade — внутренние лямбды обновляются в Шаге 7.

---

## Шаг 3: Перенести concurrent-start guard в Router facade

```typescript
// Router.ts — start()
start(startPath: string): Promise<State> {
  if (!this.#noValidate) {
    RouterLifecycleNamespace.validateStartArgs([startPath]);
  }

  if (this.#routerFSM.getState() !== "IDLE") {
    throw CACHED_ALREADY_STARTED_ERROR;
  }

  this.#routerFSM.send("START");

  return this.#lifecycle.start(startPath);
}
```

---

## Шаг 4: Упростить `start()` в namespace

> **⚠️ WARNING (Post-Analysis Correction):** The code diffs below that propose removing
> `invokeEventListeners(ROUTER_START)` and `invokeEventListeners(TRANSITION_SUCCESS)` 
> from namespace `start()` are INCORRECT for R2. These calls are **FSM transition triggers**:
> - `invokeEventListeners(ROUTER_START)` → `#handleEvent` → `routerFSM.send("STARTED")` → STARTING→READY
> - `invokeEventListeners(TRANSITION_SUCCESS)` → `#handleEvent` → `transitionFSM.send("DONE")` → RUNNING→IDLE
> Both MUST be kept in R2. Remove only in R3 when FSM sends are called directly.

Удаляем всё управление флагами — FSM уже в STARTING:

```typescript
async start(startPath: string): Promise<State> {
  const deps = this.#deps;
  const options = deps.getOptions();
  const startOptions: NavigationOptions = { replace: true };

  const matchedState = deps.matchPath(startPath);

  let finalState: State;

  if (matchedState) {
    finalState = await this.navigateToState(matchedState, undefined, startOptions, false);
  } else if (options.allowNotFound) {
    const notFoundState = deps.makeNotFoundState(startPath, startOptions);
    finalState = await this.navigateToState(notFoundState, undefined, startOptions, false);
  } else {
    // TRANSITION_ERROR при route not found:
    // R1 фактически СОХРАНИЛ эмиссию через fallback в RouterLifecycleDependencies lambda
    // (см. R1 Addendum A4). Здесь оставляем invokeEventListeners вызов для совместимости.
    // R3 перестроит start() и решит финальное поведение.
    const err = new RouterError(errorCodes.ROUTE_NOT_FOUND, { path: startPath });

    if (deps.hasListeners(events.TRANSITION_ERROR)) {
      deps.invokeEventListeners(events.TRANSITION_ERROR, undefined, undefined, err);
    }

    throw err;
  }

  return finalState;
}
```

Что удалено:

| Было                               | Почему не нужно                      |
| ---------------------------------- | ------------------------------------ |
| `if (#started \|\| #active) throw` | Guard в facade (Шаг 3)               |
| `#active = true`                   | FSM уже в STARTING (facade)          |
| `#started = true`                  | FSM: STARTING → READY (onTransition) |
| `catch { #active = false }`        | FSM: FAIL → IDLE (onTransition)      |

---

## Шаг 5: Упростить `stop()` — facade + namespace

> **⚠️ WARNING (Post-Analysis Correction):** For READY/TRANSITIONING states, the facade
> must NOT call `routerFSM.send("STOP")` directly before namespace cleanup. `send("STOP")` 
> fires `onTransition` synchronously which emits ROUTER_STOP, but `setState(undefined)` 
> hasn't been called yet. Test `stop.test.ts:159-174` asserts `getState()` is `undefined`
> inside the ROUTER_STOP listener. See actual implementation in the work plan.

```typescript
// Router.ts — stop()
stop(): this {
  const prevState = this.#routerFSM.getState();

  this.#routerFSM.send("STOP");

  // IDLE, STARTING, DISPOSED → ничего не чистим
  if (prevState !== "READY" && prevState !== "TRANSITIONING") {
    return this;
  }

  // Роутер был полностью запущен → cleanup
  this.#lifecycle.stop();

  return this;
}
```

Namespace `stop()` упрощается до:

```typescript
stop(): void {
  this.#deps.setState();
  // ROUTER_STOP эмитится через invokeEventListeners → #handleEvent → routerFSM.send("STOP") →
  // routerFSM.onTransition → observable.invoke(ROUTER_STOP)
  // Примечание: #handleEvent и invokeEventListeners лямбда ещё существуют из R1 (удаляются в R3).
  // ROUTER_STOP проходит через весь chain: lambda → #handleEvent → FSM → onTransition → observable.
  deps.invokeEventListeners(events.ROUTER_STOP);
}
```

---

## Шаг 6: Удалить `#started` и `#active`

```diff
  class RouterLifecycleNamespace {
-   #started = false;
-   #active = false;

-   isStarted(): boolean { return this.#started; }
-   isActive(): boolean { return this.#active; }
  }
```

`isActive()` — только в Router facade. `isStarted()` удаляется из namespace, заменяется inline-логикой в лямбдах (Шаг 7).

---

## Шаг 7: Обновить зависимости

```diff
  // Router.ts — setupDependencies

  // PluginsDependencies
- isStarted: () => this.#lifecycle.isStarted(),
+ isStarted: () => {
+   const s = this.#routerFSM.getState();
+   return s === "READY" || s === "TRANSITIONING";
+ },

  // TransitionDependencies
- isActive: () => this.#lifecycle.isActive(),
+ isActive: () => this.isActive(),  // делегирует в публичный facade метод

  // NavigationNamespace
- this.#navigation.isRouterStarted = () => this.#lifecycle.isStarted();
+ this.#navigation.isRouterStarted = () => {
+   const s = this.#routerFSM.getState();
+   return s === "READY" || s === "TRANSITIONING";
+ };
```

---

## Затронутые файлы

| Файл                                                                  | Действие                                                                                               | Сложность   |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ----------- |
| `src/fsm/routerFSM.ts`                                                | Добавить STOP в STARTING transitions                                                                   | Тривиальная |
| `src/Router.ts`                                                       | `isStarted()`/`isActive()` через FSM, guard в `start()`, логика `stop()`, onTransition ROUTER_STOP fix | Средняя     |
| `src/namespaces/RouterLifecycleNamespace/RouterLifecycleNamespace.ts` | Удалить `#started`/`#active`, упростить `start()`/`stop()`                                             | Средняя     |
| `src/namespaces/RouterLifecycleNamespace/types.ts`                    | Обновить `RouterLifecycleDependencies`                                                                 | Низкая      |
| `rfc-2-router-fsm.md`                                                 | Добавить STOP в STARTING                                                                               | Тривиальная |

**НЕ меняются:** NavigationNamespace (`#navigating` → Релиз 3), transition/index.ts, ObservableNamespace, все плагины, `#handleEvent` (удаляется в Релизе 3).

---

## Порядок реализации

### Фаза A: Подготовка

1. Добавить STOP в STARTING transitions
2. Обновить onTransition: ROUTER_STOP только при `from === "READY" || from === "TRANSITIONING"`
3. Обновить `rfc-2-router-fsm.md`
4. **Прогнать тесты**

### Фаза B: Перенос в facade

5. `isStarted()` / `isActive()` через FSM в Router.ts
6. Перенести concurrent-start guard в `Router.start()` facade
7. Перенести `stop()` логику в facade
8. Обновить `setupDependencies`
9. **Прогнать тесты**

### Фаза C: Удаление флагов

10. Удалить `#started` и `#active` из RouterLifecycleNamespace
11. Удалить `isStarted()` / `isActive()` из namespace
12. Упростить `start()` и `stop()` в namespace
13. Обновить `RouterLifecycleDependencies` interface
14. **Прогнать тесты**

---

## Тестовая стратегия

Все ~2189 существующих тестов — safety net. При переключении на FSM тесты не правим.

### Новые unit тесты

```typescript
describe("RouterFSM lifecycle (Release 2)", () => {
  it("isActive() returns false when IDLE");
  it("isActive() returns true when STARTING");
  it("isActive() returns true when READY");
  it("isActive() returns true when TRANSITIONING");
  it("isActive() returns false when DISPOSED");

  it("stop() during STARTING cancels navigation without ROUTER_STOP");
  it("stop() during READY emits ROUTER_STOP and clears state");
  it("stop() during TRANSITIONING emits ROUTER_STOP and clears state");
  it("stop() on IDLE is no-op");

  it("start() after stop() works (IDLE → STARTING → READY)");
  it("concurrent start() throws ALREADY_STARTED");
});
```

---

## Критерии готовности

1. ✅ Все ~2189 существующих тестов зелёные
2. ✅ `#started` и `#active` полностью удалены из RouterLifecycleNamespace
3. ✅ `isActive()` работает через `#routerFSM.getState()`
4. ✅ `isStarted()` удалён из namespace, заменён inline-логикой в DI-лямбдах
5. ✅ Новые unit тесты покрывают все FSM-состояния для isActive
6. ✅ 100% coverage maintained
