# shared/dom-utils — Stable Shared Sources

> DOM helpers инлайнятся во все framework-адаптеры. Код **зрелый**, API устоялся.

## Status: stable

Эти файлы — общий слой для 6 адаптеров (Preact, React, Solid, Vue, Svelte, Angular). Любое изменение здесь немедленно попадает в 6 публичных bundle'ов. Относиться как к low-level примитиву, а не к «просто утилитам».

## Правила работы

### 1. Отладка начинается в адаптере, а не здесь

Перед правкой `shared/dom-utils/*.ts` убедись, что:

- баг воспроизводится **минимум в 2 адаптерах** (иначе это adapter-specific проблема обёртки);
- есть падающий тест в функциональном наборе соответствующего адаптера.

Если баг живёт только в одном адаптере — правка идёт в адаптер, не сюда.

### 2. Оптимизаций «на глаз» не делать

Функции уже прошли итерации:

- `buildActiveClassName` — токен-дедупликация через `Set`, O(n+m);
- `applyLinkA11y` — defensive null-guard + `hasAttribute` (не `getAttribute`);
- `buildHref` — optional `buildUrl` + undefined-fallback на `buildPath`;
- `createRouteAnnouncer` — double `requestAnimationFrame` + Safari-ready буферизация через `pendingText`.

«Рефактор ради чистоты» здесь запрещён — микро-изменение ломает сразу 6 bundle'ов. Изменение кода требует: конкретный баг/юз-кейс, тест на него, прогон `pnpm build`.

### 3. Angular sync после любой правки

`packages/angular/src/dom-utils/` — **git-tracked copy**, не symlink (ng-packagr не следует за symlinks как tsdown).

После правки `shared/dom-utils/*.ts`:

```bash
pnpm -F @real-router/angular bundle     # пере-материализует копию через prebundle
diff -r shared/dom-utils/ packages/angular/src/dom-utils/ | grep -v index.ts  # должно быть пусто
```

Коммитить нужно **оба** варианта: источник в `shared/` и копию в `packages/angular/src/dom-utils/`.

### 4. Валидация изменений

Минимальный чек-лист перед коммитом:

```bash
pnpm build                                           # 207+ тасков, все адаптеры
pnpm -F @real-router/react test:properties -- --run  # property-тесты buildActiveClassName/buildHref
pnpm -F @real-router/svelte test:properties -- --run # property-тесты (дублируют React, оба должны пройти)
```

## Консумеры

| Источник            | Как подключено                       | Пакеты                                      |
| ------------------- | ------------------------------------ | ------------------------------------------- |
| `shared/dom-utils/` | symlink → `src/dom-utils`            | `preact`, `react`, `solid`, `svelte`, `vue` |
| `shared/dom-utils/` | git-tracked copy (через `prebundle`) | `angular`                                   |

Проверка, что symlink цел: `readlink packages/preact/src/dom-utils` должен вернуть относительный путь к `shared/dom-utils/`.

## Публичный контракт

| Функция                                                        | Используется в                                                                                                                                                                                             | Стабильность                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `shouldNavigate(evt)`                                          | все `Link` компоненты + directives/actions                                                                                                                                                                 | frozen                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `buildHref(router, name, params, search?, hash?)`              | все `Link` компоненты + Angular directive                                                                                                                                                                  | frozen (**query-канал `search` на позиции 4 — RFC-4 M2 / #1548**; hash-фрагмент сдвинут на 5; `search` → `buildUrl`/`buildPath` slot 3. Ранее `hash` был 4-м arg #1442; ещё раньше `options { hash? }` из #532)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `navigateWithHash(router, name, params, search?, hash, opts?)` | все `Link` компоненты в click handler                                                                                                                                                                      | frozen (**query-канал `search` на позиции 4 — RFC-4 M2 / #1548**; hash сдвинут на 5, opts на 6; `search` → `router.navigate` slot 3; same-route hash-bypass сравнивает оба канала. Ранее #532)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `buildActiveClassName(isActive, active, base)`                 | все `Link` компоненты                                                                                                                                                                                      | frozen                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `applyLinkA11y(el)`                                            | все `Link` компоненты + directives                                                                                                                                                                         | frozen                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `createRouteAnnouncer(router, opts)`                           | все `RouterProvider` / `NavigationAnnouncer`                                                                                                                                                               | frozen                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `createScrollRestoration(router, opts)`                        | все `RouterProvider` / `provideRealRouter(options)`                                                                                                                                                        | unstable — **behaviour change under browser-plugin**: с landing'а `transition.replace` (RFC) утилита более не делает always-snap на каждую транзишн, а различает `transition.replace` (skip) и `transition.reload` (restore). Под `navigation-plugin` поведение без изменений. Полный opt-out — `mode: "top"`. Подробности в `IMPLEMENTATION_NOTES.md` § "Replace Flag Propagation in TransitionMeta"                                                                                                                                                                                                                                                                                                            |
| `createScrollSpy(router, opts)`                                | все `RouterProvider` / `provideRealRouter(options)`                                                                                                                                                        | unstable — router-coordinated `IntersectionObserver` scroll spy (#575). Emit'ит forced same-route `router.navigate({ hash, replace: true, force: true, hashChange: true })` при пересечении anchor'ом активной зоны. Anti-flicker: `isTransitioning` gate через `getTransitionSource` + `coolingDown` gate с `selfEmitting` guard'ом для защиты от smooth `scrollIntoView` после `<Link hash>` click'а. Требует URL plugin (browser-plugin / navigation-plugin); под hash-plugin / memory-plugin / без URL plugin — warn-once + NOOP. Опции: `{ selector, rootMargin?, scrollContainer? }`. SSR / no-IO браузер → NOOP. Подробности в `IMPLEMENTATION_NOTES.md` § "Scroll Spy via Forced Same-States Transition" |
| `createViewTransitions(router)`                                | все `RouterProvider` / `provideRealRouter(options)`                                                                                                                                                        | unstable — `subscribeLeave`-based интеграция с View Transitions API (#498). No-op в браузерах без `document.startViewTransition` (Firefox 2026-04, SSR).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `createDirectionTracker(router)`                               | optional user utility — устанавливается до `usePlugin(browserPlugin)`. **Не реэкспортируется** из `packages/angular/src/index.ts`: импорт идёт через deep-path `@real-router/angular/dom-utils` (см. ниже) | unstable                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |

«Frozen» = сигнатура и поведение не меняются без мажорного release-цикла core. Новые фичи — отдельными функциями, не модификацией существующих.

«Unstable» = API может измениться в пределах minor-релиза; после release-цикла статус повышается до frozen.

### `createDirectionTracker` — статус публичного API

Намеренно не реэкспортирован из `packages/angular/src/index.ts`, в отличие от других `dom-utils`-утилит, которые попадают в API через `provideRealRouter(options)` (scroll/view-transitions) или через directives (link-utils). Причины:

- API утилиты — **unstable** в текущем релиз-цикле (минор-изменения возможны).
- Использование требует осознанной установки до `usePlugin(browserPlugin)` (см. комментарий о listener-ordering в `direction-tracker.ts`).
- Coverage этого файла обеспечен в `packages/react/` (react — measuring owner для shared/dom-utils после миграции node→consumer, #1065; white-box в `tests/functional/dom-utils/direction-tracker.test.ts`); angular vitest исключает его из threshold (`vitest.config.mts` exclude list).

Опытные потребители могут импортировать функцию из публичного пути ng-packagr-собранного пакета: `import { createDirectionTracker } from "@real-router/angular/dist/esm2022/dom-utils/direction-tracker"` — но эта точка входа **не покрыта SemVer гарантиями**. После стабилизации API утилита будет реэкспортирована из `src/index.ts` отдельным минорным релизом.

## См. также

- [../../CLAUDE.md](../../CLAUDE.md) — monorepo-level правила symlink-инфраструктуры
- [../../IMPLEMENTATION_NOTES.md](../../IMPLEMENTATION_NOTES.md) — раздел "Shared Sources via Symlinks"
