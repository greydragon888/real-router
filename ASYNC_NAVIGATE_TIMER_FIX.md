# Анализ: влияние асинхронного navigate() на fake timers в тестах

## Контекст

В рамках перехода с callback-based API на Promise-based API были изменены сигнатуры
ключевых методов роутера:

```typescript
// БЫЛО (master) — callback-паттерн
navigate(name, params?, opts?, done?): CancelFn   // возвращает функцию отмены
start(startPathOrState?, done?): this              // возвращает this

// СТАЛО — Promise-паттерн
navigate(name, params?, opts?): Promise<State>     // возвращает Promise
start(startPath?): Promise<State>                  // возвращает Promise
```

Также был удалён публичный метод `cancel()` из `Router`. Отмена навигации теперь
выполняется через `router.stop()`.

## Проблема

После перехода на Promise API тесты, использующие `vi.useFakeTimers()` с middleware,
зависали (timeout). Guard-тесты продолжали работать корректно.

## Корневая причина

### Старый код (callback-based, master)

В старом API `navigate()` возвращал `CancelFn` — синхронную функцию отмены конкретной
навигации. Тесты НЕ использовали `await` и НЕ вызывали `router.start()` после отмены:

```typescript
// Старый тест (master) — полностью синхронный
vi.useFakeTimers();

router.useMiddleware(() => (_toState, _fromState, done) => {
  setTimeout(done, 50);            // callback-based middleware
});

const cancel = router.navigate("users", (err) => {
  expect(err?.code).toBe(errorCodes.TRANSITION_CANCELLED);
});

setTimeout(cancel, 10);            // запланировать отмену

vi.advanceTimersByTime(10);         // cancel() срабатывает
vi.advanceTimersByTime(50);         // done() срабатывает — уже ignored

// Тест завершён. Нет await. Нет router.start(). Просто cleanup.
router.clearMiddleware();
vi.useRealTimers();
```

**Ключевой момент:** `cancel()` отменял только конкретную навигацию, НЕ останавливая
роутер. Роутер оставался в рабочем состоянии.

### Новый код (Promise-based)

В новом API `navigate()` возвращает `Promise<State>`. Публичный `cancel()` удалён.
Единственный способ отменить навигацию извне — `router.stop()`:

```typescript
// Новый тест — требует await
router.useMiddleware(() => async () => {
  await new Promise((resolve) => setTimeout(resolve, 50));
});

const promise = router.navigate("users");

// ... отмена через router.stop() ...

await expect(promise).rejects.toMatchObject({
  code: errorCodes.TRANSITION_CANCELLED,
});

// router.stop() останавливает ВЕСЬ роутер, нужно перезапустить:
await router.start();   // ← ЗДЕСЬ ЗАВИСАНИЕ В РЕЖИМЕ FAKE TIMERS
```

### Почему зависает `await router.start()`

1. `router.start()` вызывает `navigateToState()` для дефолтного маршрута ("home")
2. `navigateToState()` проходит через `transition()` → `executeMiddleware()`
3. Middleware **глобальный** — срабатывает для ВСЕХ навигаций, включая стартовую
4. Middleware создаёт `setTimeout(resolve, 50)` в режиме fake timers
5. **Никто не продвигает таймер** → `await` висит бесконечно

### Почему guard-тесты НЕ зависают

Guard'ы привязаны к конкретному маршруту:

```typescript
router.addActivateGuard("orders", asyncGuard);  // только для "orders"
```

При `router.start()` навигация идёт к "home" — guard для "orders" не вызывается →
нет fake-таймеров → нет зависания.

## Сравнение поведения

| Аспект | Master (callbacks) | Новый (Promises) |
|--------|-------------------|------------------|
| **Тип возврата navigate()** | `CancelFn` (синхронно) | `Promise<State>` (асинхронно) |
| **Отмена навигации** | `cancel()` — только конкретная навигация | `router.stop()` — останавливает весь роутер |
| **Нужен await** | Нет | Да |
| **Нужен router.start() после отмены** | Нет (роутер не останавливался) | Да (роутер остановлен) |
| **Взаимодействие с fake timers** | Нет проблем | `router.start()` создаёт новые fake-таймеры через middleware |

## Решение

**Паттерн:** очистить middleware ПЕРЕД перезапуском роутера.

Без middleware `router.start()` не создаёт таймеров — transition выполняется
через микрозадачи (Promise), а не через setTimeout:

```typescript
vi.useFakeTimers();

router.useMiddleware(() => async () => {
  await new Promise((resolve) => setTimeout(resolve, 50));
});

const promise = router.navigate("users");

setTimeout(() => {
  router.stop();
}, 10);

await vi.runAllTimersAsync();

await expect(promise).rejects.toMatchObject({
  code: errorCodes.TRANSITION_CANCELLED,
});

// РЕШЕНИЕ: очистить middleware ДО перезапуска
router.clearMiddleware();        // ← нет middleware = нет fake-таймеров при start()
await router.start();            // ← безопасно — transition проходит мгновенно
vi.useRealTimers();
```

### Почему это работает

1. `router.clearMiddleware()` удаляет все зарегистрированные middleware
2. `router.start()` → `navigateToState("home")` → `transition()` → `executeMiddleware()`
3. Без middleware `executeMiddleware()` завершается мгновенно (пустой массив функций)
4. `transition()` возвращает state без создания таймеров
5. Promise `router.start()` резолвится через микрозадачу, не через setTimeout

### Классификация тестов

| Тип теста | Fake timers | Проблема с router.start() | Решение |
|-----------|-------------|---------------------------|---------|
| Middleware + отмена | Да | Да (middleware глобальный) | `clearMiddleware()` перед `start()` |
| Middleware до start() | Да | Да (start() проходит через middleware) | Регистрировать middleware ПОСЛЕ `start()` |
| Guard + отмена | Да | Нет (guard привязан к роуту) | Без изменений |
| Middleware без отмены | Да | Нет (router не останавливается) | `clearMiddleware()` перед `useRealTimers()` |

### Два паттерна для middleware + fake timers

**Паттерн 1: `clearMiddleware()` перед `router.start()` (cleanup)**
Для тестов, где middleware регистрируется до start() и router останавливается в середине:

```typescript
router.clearMiddleware();    // убрать middleware перед перезапуском
await router.start();        // безопасно
vi.useRealTimers();
```

**Паттерн 2: Регистрация middleware ПОСЛЕ `start()` (setup)**
Для тестов, где middleware нужен только для навигации, не для start:

```typescript
vi.useFakeTimers();
await router.start();                    // безопасно — нет middleware
router.useMiddleware(() => async () => { // регистрируем ПОСЛЕ start
  await new Promise(resolve => setTimeout(resolve, 200));
});
const navPromise = router.navigate("users");  // middleware работает
```

## Результаты по скорости

| Файл | Было | Стало | Ускорение |
|------|------|-------|-----------|
| `concurrent-navigation.test.ts` | ~2.5s | 26ms | **~100x** |
| `logger-plugin/plugin.test.ts` (123 теста) | ~2.5s | 94ms | **~25x** |

## Изменённые файлы

### Тесты
- `packages/core/tests/functional/navigation/navigate/concurrent-navigation.test.ts`
  — 8 middleware-тестов: real timers → fake timers с `clearMiddleware()` перед `start()`
- `packages/core/tests/functional/navigation/navigate/events-transition-success.test.ts`
  — 1 middleware-тест: то же исправление
- `packages/logger-plugin/tests/functional/plugin.test.ts`
  — 5 middleware-тестов: real timers → fake timers с middleware после `start()`

### Исходный код (из предыдущей сессии)
- `packages/core/src/Router.ts` — `navigate()` возвращает `Promise<State>`; удалён `cancel()`
- `packages/core/src/namespaces/NavigationNamespace/NavigationNamespace.ts` — cancel token механизм
- `packages/core/src/namespaces/NavigationNamespace/transition/index.ts` — `isCancelled` как параметр
- `packages/core/src/namespaces/NavigationNamespace/transition/executeMiddleware.ts` — приоритет отмены
- `packages/core/src/namespaces/NavigationNamespace/transition/executeLifecycleHooks.ts` — приоритет отмены
